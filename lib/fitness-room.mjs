/**
 * 健身房直播间：自己一套 SSE、自己的弹幕、自己的动作演示状态。
 *
 * 和故事间共用：抖音弹幕直连、点歌队列、token 记账、语音合成。
 * 独立：动作库搜索/推荐、训练计划、动作讲解、教练人设回复。
 */
import { getConfig } from './config.mjs';
import { synthesize } from './voice.mjs';
import { chatCompletion } from './ai.mjs';
import { costOf, ratesFor } from './pricing.mjs';
import { addAiUsage, addUsageOnly, pushPlaylist, nextSong } from './store.mjs';
import { resolveTrack } from './music.mjs';
import {
  buildPlan,
  planSpeech,
  exerciseSpeech,
  findExercise,
  searchExercises,
  recommendExercises,
  recommendSpeech,
  detectPart,
  detectLevel,
  detectEquip,
  coachMessages,
  exerciseView,
  gymParts,
  gymLibrary,
} from './gym.mjs';

const MAX_FEED = 60;
const clients = new Set();
const hooks = { song: () => null, stats: () => null };

const fit = {
  online: 0,
  at: 0,
  plan: null,
  current: null,
  mode: 'idle', // idle | plan | demo | rest | talking
  rest: null, // {endsAt, totalSec, nextName}
  setsDone: 0,
  feed: [],
  history: [], // 给 AI 的最近对话
  saying: false,
  lastBy: '',
  topic: null, // { part, ids, at, pendingPlan }：刚聊到哪儿，用来接「安排」
};

/* 每个观众最近说的部位，房间换了话题也不会互相串 */
const userTopic = new Map();

/* 每条连接最后一次成功写入的时间：用来判断「画面是不是真的还开着」 */
const seen = new Map();
const ONLINE_TTL = 45000;

export function setFitHooks(next = {}) {
  Object.assign(hooks, next);
}

export function fitTouch(res) {
  if (clients.has(res)) seen.set(res, Date.now());
}

export function fitOnline() {
  const now = Date.now();
  let live = 0;
  for (const [res, at] of seen) {
    if (now - at < ONLINE_TTL) live += 1;
    else {
      clients.delete(res);
      seen.delete(res);
    }
  }
  return live > 0;
}

function emit(payload) {
  const data = `data: ${JSON.stringify({ ...payload, room: 'fitness' })}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
      seen.set(res, Date.now());
    } catch {
      clients.delete(res);
      seen.delete(res);
    }
  }
}

export function fitView() {
  return {
    online: clients.size,
    mode: fit.mode,
    plan: fit.plan,
    current: fit.current,
    rest: fit.rest,
    setsDone: fit.setsDone,
    feed: fit.feed.slice(-40),
    parts: gymParts(),
  };
}

export function fitAttach(res) {
  clients.add(res);
  seen.set(res, Date.now());
  fit.online = clients.size;
  res.write(`data: ${JSON.stringify({ type: 'fit-state', room: 'fitness', ...fitView() })}\n\n`);
  return () => {
    clients.delete(res);
    seen.delete(res);
    fit.online = clients.size;
  };
}

function pushFeed(item) {
  fit.feed.push({ ...item, at: Date.now() });
  if (fit.feed.length > MAX_FEED) fit.feed.splice(0, fit.feed.length - MAX_FEED);
  emit({ type: 'fit-event', item });
}

function setMode(mode, extra = {}) {
  fit.mode = mode;
  emit({ type: 'fit-state', ...fitView(), ...extra });
}

/* ---------------- 语音 ---------------- */

function voiceOpts() {
  const v = getConfig().voice || {};
  const engine = ['edge', 'kokoro', 'minimax'].includes(v.engine) ? v.engine : 'sapi';
  return {
    engine,
    rate: v.rate ?? 1,
    voice: v.voice || undefined,
    preset: v.preset || (engine === 'kokoro' ? 'xiaobei' : engine === 'minimax' ? 'lyrical' : 'natural'),
    speed: v.speed ?? undefined,
    minimaxVoice: v.minimaxVoice || undefined,
    minimaxModel: v.minimaxModel || undefined,
    minimaxEmotion: v.minimaxEmotion || undefined,
    minimaxBaseUrl: v.minimaxBaseUrl || undefined,
    minimaxPitch: v.minimaxPitch ?? 0,
    minimaxApiKey: v.minimaxApiKey || undefined,
  };
}

/** 说出来：进自己的弹幕框 + 前端拿 url 播放（没有语音引擎也不影响文字） */
export async function fitSay(text, { username = '大肥鱼', kind = 'ai', speak = true, extra = {} } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  let voiceUrl = null;
  const cfg = getConfig();
  if (speak && cfg.voice?.enabled !== false) {
    try {
      const out = await synthesize(clean, { ...voiceOpts(), maxChars: 900 });
      voiceUrl = out?.url || null;
    } catch (e) {
      console.warn('[fitness] 语音合成失败：', String(e.message).slice(0, 120));
    }
  }
  const item = { kind, username, text: clean, voice: voiceUrl, voiceOnly: !speak, ...extra };
  pushFeed(item);
  if (username !== '大肥鱼') {
    fit.history.push({ role: 'user', content: `${username}说：${clean}` });
    fit.history.push({ role: 'assistant', content: clean });
    if (fit.history.length > 12) fit.history.splice(0, fit.history.length - 12);
  }
  return item;
}

/* ---------------- AI 教练回复 ---------------- */

const FALLBACK = [
  '我在呢，想练哪块直接说，腿、背、胸、肩、手臂、核心都行。',
  '这句我没太听清，你再说一遍练什么，我给你挑动作。',
  '慢点来，动作稳住了再加重量，我陪着你。',
];

export async function fitCoachReply(text, { username = '', safety = false } = {}) {
  const cfg = getConfig();
  if (!cfg.ai?.enabled || !cfg.ai?.apiKey) {
    const say = safety
      ? `先别练了${username ? `，${username}` : ''}，哪儿不舒服就停下来歇着，揉一揉、观察一下；真疼得厉害就去看看医生。`
      : FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
    return fitSay(say, { username: '大肥鱼', extra: { replyTo: username } });
  }
  if (fit.saying) return null;
  fit.saying = true;
  try {
    const messages = coachMessages({
      text,
      username,
      plan: fit.plan,
      current: fit.current,
      history: fit.history,
      topic: fit.topic,
      safety,
      suggestions: fit.topic?.part ? recommendExercises(fit.topic.part, { limit: 5 }).map((e) => e.name) : [],
    });
    const r = await chatCompletion({
      baseUrl: cfg.ai.baseUrl,
      apiKey: cfg.ai.apiKey,
      model: cfg.ai.model,
      messages,
      temperature: Math.min(1.3, Number(cfg.ai.temperature) || 1),
      maxTokens: 160,
      timeoutMs: 30000,
      retries: 2,
    });
    const usage = r.usage;
    const cost = costOf(usage, ratesFor(cfg.pricing, r.model || cfg.ai.model));
    if (usage) addAiUsage({ usage, cost, replyText: r.text });
    else addUsageOnly({ usage, cost });
    fit.history.push({ role: 'assistant', content: r.text });
    if (fit.history.length > 12) fit.history.splice(0, fit.history.length - 12);
    return await fitSay(r.text, { username: '大肥鱼', extra: { replyTo: username } });
  } catch (e) {
    console.warn('[fitness] AI 回复失败：', String(e.message).slice(0, 140));
    const say = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
    return fitSay(say, { username: '大肥鱼', extra: { replyTo: username } });
  } finally {
    fit.saying = false;
  }
}

/* ---------------- 动作 / 计划 ---------------- */

export function fitShowExercise(exOrId, { by = '' } = {}) {
  let ex = null;
  if (exOrId && typeof exOrId === 'object') {
    ex = exOrId;
  } else {
    const key = String(exOrId || '').trim();
    /* 后台是按 id 点的，弹幕是按名字说的，两条都要认。 */
    ex = gymLibrary().byId.get(key) || null;
    if (!ex) ex = searchExercises(key, { limit: 1 })[0] || null;
    if (!ex) ex = findExercise(key);
  }
  if (!ex) return null;
  const view = exerciseView(ex);
  fit.current = view;
  fit.rest = null;
  fit.setsDone = 0;
  fit.lastBy = by;
  setMode('demo');
  return view;
}

export function fitSetPlan({ part = '全身', level = 0, equip = '', minutes = 45, by = '' } = {}) {
  const plan = buildPlan({ part, level, equip, minutes, seed: Date.now() % 97 });
  fit.plan = plan;
  fit.setsDone = 0;
  fit.rest = null;
  fit.current = plan.blocks[0]?.exercise || null;
  fit.lastBy = by;
  setMode('plan');
  return plan;
}

export function fitNextBlock({ by = '' } = {}) {
  if (!fit.plan?.blocks?.length) return null;
  const idx = fit.plan.blocks.findIndex((b) => b.exercise.id === fit.current?.id);
  const next = fit.plan.blocks[(idx + 1) % fit.plan.blocks.length];
  fit.current = next.exercise;
  fit.rest = null;
  fit.setsDone = 0;
  emit({ type: 'fit-state', ...fitView(), by });
  return next.exercise;
}

let restTimer = null;
export function fitStartRest(sec, { nextName = '' } = {}) {
  const total = Math.max(10, Math.min(300, Math.round(Number(sec) || 60)));
  fit.rest = { endsAt: Date.now() + total * 1000, totalSec: total, nextName };
  setMode('rest');
  clearTimeout(restTimer);
  restTimer = setTimeout(() => {
    fit.rest = null;
    fit.setsDone += 1;
    setMode('demo');
    const name = fit.current?.name || '下一个动作';
    fitSay(`休息结束，${name}，准备开始。`, { username: '大肥鱼', speak: true }).catch(() => {});
  }, total * 1000);
  return fit.rest;
}

export function fitCompleteSet() {
  if (!fit.current) return null;
  fit.setsDone += 1;
  const rest = fitStartRest(fit.current.restSec, { nextName: fit.current.name });
  return { setsDone: fit.setsDone, rest };
}

export function fitReset() {
  clearTimeout(restTimer);
  restTimer = null;
  fit.plan = null;
  fit.current = null;
  fit.rest = null;
  fit.mode = 'idle';
  fit.setsDone = 0;
  fit.feed = [];
  fit.history = [];
  fit.topic = null;
  userTopic.clear();
  emit({ type: 'fit-state', ...fitView() });
}

/* ---------------- 点歌（和故事间共用队列） ---------------- */

const SONG_CMD = /^(点歌|我想听|来一首|放一首|唱一首)\s*[:：,，]?\s*(.+)$/;
const CUT_CMD = /^(切歌|下一首|换一首|跳过)$/;

async function fitnessSong(text, username) {
  const cfg = getConfig();
  const after = async () => {
    if (hooks.resolve) await hooks.resolve().catch(() => {});
    emit({ type: 'fit-song', song: hooks.song() });
  };
  if (CUT_CMD.test(text.trim())) {
    const song = nextSong();
    await after();
    await fitSay(song ? `好，切到${song.title}。` : '队列空啦，想听什么直接点。', { username: '大肥鱼' });
    return true;
  }
  const m = text.trim().match(SONG_CMD);
  if (!m) return false;
  const q = m[2].trim();
  if (!q) return false;
  try {
    const track = await resolveTrack(cfg, q);
    if (!track) {
      await fitSay(`${q} 这首我没找到，换一首？`, { username: '大肥鱼', extra: { replyTo: username } });
      return true;
    }
    const res = pushPlaylist(track.title, track.by, cfg.music?.queueMax ?? 3);
    if (res?.full) {
      await fitSay('点歌队列满了，等这首放完再点哈。', { username: '大肥鱼' });
    } else if (res?.dup) {
      await fitSay('这首已经在队列里啦。', { username: '大肥鱼' });
    } else {
      await after();
      await fitSay(`《${track.title}》安排上了，${username || '你'}点的。`, { username: '大肥鱼', extra: { song: track.title } });
    }
  } catch (e) {
    await fitSay('点歌出了点小问题，等下再试一次。', { username: '大肥鱼' });
  }
  return true;
}

/* ---------------- 弹幕入口 ---------------- */

/* 弹幕意图词表：先认「接话」，再认部位/动作，最后才交给 AI */
const AFFIRM = /^(安排|安排一下|排一下|排一个|排一套|排个|来一套|就这么定|就这样|好的|好|行|可以|要|需要|开始吧|开始|就这么办|ok|okay|嗯|嗯嗯|对|是|中)$/i;
const SWAP = /^(换一批|换几个|再来几个|换一组|还有吗|别的|换换|再换)$/;
const PLAN_WORDS = /安排|计划|来一套|带我练|今天练|练什么|怎么练|组数|训练|排一|整套|想练|练一下|搞一组/;
const PLAN_STRONG = /安排|来一套|整套|排一|排个|排课|带我练|计划|搞一组|组数|怎么练|练法/;
const PART_MINUTES = /(\d{1,3})\s*(分钟|分|min)|半小时/i;
const REC_WORDS = /推荐|有什么|哪些|来点|来几个|介绍|动作|看看|示范|练法/;
const HURT = /疼|痛|受伤|拉伤|扭到|不舒服|酸疼|发麻|麻了/;
const PART_ONLY = /^(腿|大腿|臀|屁股|背|胸|肩|手臂|胳膊|核心|腹|腰腹|小腿|有氧|全身|颈肩|腿臀)$/;
const TODAY = /^(今天练什么|今天练啥|练什么|练啥|今天练哪儿|今天练哪里|练哪儿)$/;
const THANKS = /^(谢谢|谢谢你|谢谢教练|感谢|辛苦了|爱你|牛|厉害|666|收到了|收到)$/i;
const GREET = /^(你好|hi|hello|在吗|哈喽|嗨|教练好|大肥鱼在吗|早上好|晚上好)[啊呀哈！!。]*$/i;

export async function fitIngest(ev) {
  if (!clients.size) return; // 健身房没开就不掺和
  const kind = ev?.kind || 'chat';
  const username = String(ev?.username || '').trim();
  const text = String(ev?.text || '').trim();

  if (kind === 'gift') {
    const gift = String(ev.giftName || '礼物');
    const n = Number(ev.count) || 1;
    pushFeed({ kind: 'gift', username, text: `${gift} ×${n}`, giftName: gift, count: n });
    const thanks = [
      `谢谢${username || '老板'}的${gift}，我多做两组给你看。`,
      `${username || '这位朋友'}送了个${gift}，那我得拿出点真东西了。`,
      `收到${username || '你'}的${gift}，练完这组我专门给你讲个动作。`,
    ];
    await fitSay(thanks[Math.floor(Math.random() * thanks.length)], { username: '大肥鱼' });
    return;
  }
  if (kind === 'enter') {
    pushFeed({ kind: 'enter', username, text: '来了' });
    if (Math.random() < 0.5) await fitSay(`${username || '新朋友'}来啦，先跟着活动活动肩颈。`, { username: '大肥鱼' });
    return;
  }
  if (kind === 'follow') {
    pushFeed({ kind: 'follow', username, text: '关注了' });
    await fitSay(`谢谢${username || '你'}关注，明天这个点还练。`, { username: '大肥鱼' });
    return;
  }
  if (kind === 'like') {
    pushFeed({ kind: 'like', username, text: '点了赞' });
    return;
  }
  if (!text) return;

  pushFeed({ kind: 'chat', username, text });

  if (fit.mode === 'rest' && /休息|歇|好了|继续|开始/.test(text)) {
    fit.rest = null;
    clearTimeout(restTimer);
    setMode('demo');
  }

  if (await fitnessSong(text, username)) return;

  /* 去掉标点，方便判断「安排」「换了」这种短回复 */
  const norm = text.replace(/[\s。！!？?，,、~～…]+/g, '');
  const part = detectPart(text);
  const level = detectLevel(text);
  const equip = detectEquip(text);
  const lastPart = fit.topic?.part || userTopic.get(username)?.part || '';

  const minutesOf = (s) => {
    if (/半小时/.test(s)) return 30;
    const m = String(s).match(/(\d{1,3})\s*(分钟|分|min)/i);
    if (m) return Math.max(10, Math.min(90, Number(m[1])));
    return 45;
  };

  const doPlan = async (key) => {
    const plan = fitSetPlan({ part: key, level, equip, minutes: minutesOf(text), by: username });
    fit.topic = { part: key, at: Date.now(), pendingPlan: false, ids: plan.blocks.map((b) => b.exercise.id) };
    if (username) userTopic.set(username, { part: key, at: Date.now() });
    await fitSay(planSpeech(plan, { username }), { username: '大肥鱼', extra: { plan: true } });
  };

  const doRecommend = async (key, { avoid = [], swap = false } = {}) => {
    const list = recommendExercises(key, { limit: 3, level, equip, avoid });
    if (!list.length) {
      await fitSay(`${username ? `${username}，` : ''}${key}这块我先给你排一整套吧，说「安排」。`, {
        username: '大肥鱼',
      });
      return;
    }
    fitShowExercise(list[0], { by: username });
    fit.topic = { part: key, at: Date.now(), pendingPlan: true, ids: list.map((e) => e.id) };
    if (username) userTopic.set(username, { part: key, at: Date.now() });
    await fitSay(recommendSpeech(key, list, { username, avoid: swap }), {
      username: '大肥鱼',
      extra: { exercise: list[0].id },
    });
  };

  /* 0) 「安排」「好」「来一套」——接住上一轮聊的部位，别自顾自换话题 */
  if (AFFIRM.test(norm)) {
    if (lastPart) {
      // 刚排过同一部位，别把课推翻重排，直接把进度念一遍
      const fresh =
        fit.plan &&
        fit.plan.part === lastPart &&
        fit.topic?.part === lastPart &&
        !fit.topic?.pendingPlan &&
        Date.now() - (fit.topic?.at || 0) < 15 * 60 * 1000;
      if (fresh) {
        const first = fit.plan.blocks[0]?.exercise;
        await fitSay(
          `${username ? `${username}，` : ''}已经给你排好了，今天练${fit.plan.part}，${fit.plan.blocks.length} 个动作、${fit.plan.totalSets} 组。` +
            (first ? `现在做的是${first.name}，${first.sets} 组 ${first.reps}，做完记得跟我说一声。` : ''),
          { username: '大肥鱼', extra: { plan: true } },
        );
        return;
      }
      return doPlan(lastPart);
    }
    await fitSay(`${username ? `${username}，` : ''}好，那练哪块？腿、背、胸、肩、手臂、核心，说一个我就排。`, {
      username: '大肥鱼',
    });
    return;
  }

  /* 0.5) 「换一批」——同一部位换一组动作，不重新排课 */
  if (SWAP.test(norm) && lastPart) {
    return doRecommend(lastPart, { avoid: fit.topic?.ids || [], swap: true });
  }

  /* 0.6) 身体不舒服：不推荐动作，先让他停 */
  if (HURT.test(text)) return fitCoachReply(text, { username, safety: true });

  /* 0.7) 只说「腿」「胸」这种单字部位 → 当推荐，不要当成某个动作名 */
  if (part && PART_ONLY.test(norm)) return doRecommend(part);

  /* 0.8) 「今天练什么」——已经有话题就顺着说，没有就反问 */
  if (TODAY.test(norm)) {
    if (fit.plan) {
      const first = fit.plan.blocks[0]?.exercise;
      await fitSay(
        `${username ? `${username}，` : ''}今天练${fit.plan.part}，${fit.plan.blocks.length} 个动作、${fit.plan.totalSets} 组。` +
          (first ? `现在做的是${first.name}，${first.sets} 组 ${first.reps}。` : '') +
          `想跟着练就说「安排」。`,
        { username: '大肥鱼' },
      );
      return;
    }
    if (lastPart) return doRecommend(lastPart);
    await fitSay(`${username ? `${username}，` : ''}还没定呢。你想练哪块？腿、背、胸、肩、手臂、核心，挑一个。`, {
      username: '大肥鱼',
    });
    return;
  }

  // 1) 问具体动作 → 放演示 + 讲解
  // 弹幕常带口语（「硬拉怎么做」「深蹲要注意啥」），先剥掉问句壳再找动作
  const stripAsk = (s) =>
    String(s)
      .replace(/怎么|如何|要点|讲解|教我|看看|演示|姿势|标准|注意|动作|一下|请问|做|呢|吗|啊|呀|吧|我想|我要|[？?！!。，,、\s]/g, '')
      .trim();
  let ex = findExercise(text);
  if (!ex) {
    const core = stripAsk(text);
    if (core.length >= 2) ex = findExercise(core);
  }
  if (ex && /怎么|如何|要点|讲解|教我|看看|演示|做|练|姿势|标准|注意/.test(text)) {
    fitShowExercise(ex, { by: username });
    await fitSay(exerciseSpeech(ex, { username }), { username: '大肥鱼', extra: { exercise: ex.id } });
    return;
  }
  if (ex && text.length <= 8) {
    fitShowExercise(ex, { by: username });
    await fitSay(exerciseSpeech(ex, { username }), { username: '大肥鱼', extra: { exercise: ex.id } });
    return;
  }

  // 2) 说了部位 + 明确要计划（或报了时长）→ 直接排课；只说「想练腿」先推荐
  if (part && (PLAN_STRONG.test(text) || PART_MINUTES.test(text))) return doPlan(part);

  // 3) 说了部位（「练胸」「胸」都算）→ 先推荐几个，并留出「安排」的口子
  if (part) return doRecommend(part);

  // 4) 想让人推荐、但没说部位 → 反问一句，别硬猜
  if (REC_WORDS.test(text)) {
    await fitSay(
      `${username ? `${username}，` : ''}行啊，你想练哪块？腿、背、胸、肩、手臂、核心，说一个我就给你挑动作。`,
      { username: '大肥鱼' },
    );
    return;
  }

  // 5) 打招呼 / 道谢——这种就别麻烦大模型了，回一句热乎的
  if (THANKS.test(norm)) {
    await fitSay(`${username ? `${username}，` : ''}客气啥，练完记得拉伸，明天这个点我还在这儿。`, {
      username: '大肥鱼',
      extra: { replyTo: username },
    });
    return;
  }
  if (GREET.test(norm)) {
    await fitSay(`${username ? `${username}，` : ''}在呢，想练哪块？腿、背、胸、肩、手臂、核心都行。`, {
      username: '大肥鱼',
      extra: { replyTo: username },
    });
    return;
  }

  // 6) 其余交给教练人设（带上刚才聊的部位，免得答非所问）
  await fitCoachReply(text, { username });
}
