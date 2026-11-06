/**
 * 大肥鱼 · 健身房直播间前端
 *
 * - 自己的 SSE：/api/fitness/events
 * - 动作演示：Canvas 2D 骨骼小人，按动作模式（pattern）做关键帧循环
 * - 讲解：服务端合成好的语音 url 直接播；没有就自己请求 /api/voice/say
 */
const SERVER = location.origin;
const $ = (id) => document.getElementById(id);

const el = {
  modeChip: $('modeChip'),
  todayTokens: $('todayTokens'),
  balance: $('balance'),
  clock: $('clock'),
  feed: $('feed'),
  feedHint: $('feedHint'),
  dmCount: $('dmCount'),
  canvas: $('demo'),
  demoVideo: $('demoVideo'),
  demoFrame: $('demoFrame'),
  demoEmpty: $('demoEmpty'),
  doseMeta: $('doseMeta'),
  demoBadge: $('demoBadge'),
  eqTag: $('eqTag'),
  repCount: $('repCount'),
  repDone: $('repDone'),
  exPart: $('exPart'),
  exName: $('exName'),
  exChips: $('exChips'),
  exSets: $('exSets'),
  exReps: $('exReps'),
  exRest: $('exRest'),
  exCues: $('exCues'),
  exMistake: $('exMistake'),
  restBox: $('restBox'),
  restTime: $('restTime'),
  restNext: $('restNext'),
  planTitle: $('planTitle'),
  planMeta: $('planMeta'),
  planBody: $('planBody'),
  nowTitle: $('nowTitle'),
  nowBy: $('nowBy'),
  queueList: $('queueList'),
  queueCount: $('queueCount'),
  musicProgress: $('musicProgress'),
  nextBtn: $('nextBtn'),
  pet: $('pet'),
  voiceHint: $('voiceHint'),
  soundUnlock: $('soundUnlock'),
  soundStart: $('soundStart'),
  player: $('player'),
};

const state = {
  current: null,
  plan: null,
  mode: 'idle',
  rest: null,
  setsDone: 0,
  song: null,
  stats: null,
  audioReady: false,
};

const MOODS = {
  idle: 'idle',
  demo: 'talk',
  plan: 'cheer',
  rest: 'sing',
  talk: 'talk',
  hello: 'greet',
};

/* ================= 语音 ================= */
const voiceQueue = [];
let voicePlaying = false;

function playVoiceUrl(url) {
  return new Promise((resolve) => {
    if (!url || !state.audioReady) return resolve();
    const a = new Audio(url);
    a.onended = resolve;
    a.onerror = resolve;
    voiceQueue.push({ a, resolve });
    pumpVoice();
  });
}

function pumpVoice() {
  if (voicePlaying || !voiceQueue.length) return;
  voicePlaying = true;
  const { a, resolve } = voiceQueue.shift();
  el.voiceHint.textContent = '讲解中…';
  const done = () => {
    voicePlaying = false;
    el.voiceHint.textContent = '在听弹幕…';
    resolve();
    pumpVoice();
  };
  a.onended = done;
  a.onerror = done;
  a.play().catch(done);
}

async function speakLocal(text) {
  if (!text || !state.audioReady) return;
  try {
    const r = await fetch(`${SERVER}/api/voice/say`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then((x) => x.json());
    if (r?.ok && r.url) await playVoiceUrl(r.url);
  } catch {}
}

/* ================= 弹幕 ================= */
const KIND_LABEL = { gift: '送出', enter: '来了', follow: '关注了', like: '点了赞' };

function addMessage(item, { live = true } = {}) {
  if (!item?.text) return;
  const node = document.createElement('div');
  node.className = `msg ${item.kind || 'chat'}`;
  const who = item.kind === 'ai' ? '大肥鱼 · 教练' : item.username || '观众';
  const what = item.kind === 'gift' ? `送出 ${item.giftName || item.text}${item.count > 1 ? ` ×${item.count}` : ''}` : item.text;
  node.innerHTML = `<div class="who">${escapeHtml(who)}</div><div class="what">${escapeHtml(what)}</div>`;
  el.feed.appendChild(node);
  if (el.feedHint) el.feedHint.hidden = true;
  const max = 14;
  while (el.feed.children.length > max) el.feed.firstElementChild.remove();
  el.dmCount.textContent = `${el.feed.children.length}`;
  while (el.feed.scrollHeight > el.feed.clientHeight + 4 && el.feed.children.length > 3) {
    el.feed.firstElementChild.remove();
  }
  if (live && item.kind === 'ai' && !item.voice && !item.voiceOnly) speakLocal(item.text);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ================= 状态渲染 ================= */
function renderState(payload) {
  if (payload.plan !== undefined) state.plan = payload.plan;
  if (payload.current !== undefined) state.current = payload.current;
  if (payload.mode) state.mode = payload.mode;
  if (payload.rest !== undefined) state.rest = payload.rest;
  if (payload.setsDone !== undefined) state.setsDone = payload.setsDone;
  renderMode();
  renderCurrent();
  renderPlan();
  renderRest();
}

function renderMode() {
  const map = { idle: '等待开始', plan: '计划已排', demo: '动作示范', rest: '组间休息', talking: '讲解中' };
  el.modeChip.textContent = map[state.mode] || '动作示范';
  el.modeChip.className = `mode-chip ${state.mode === 'rest' ? 'rest' : state.mode === 'idle' ? 'idle' : ''}`;
  setMood(MOODS[state.mode] || 'talk');
}

function renderCurrent() {
  const c = state.current;
  if (!c) {
    el.exName.textContent = '今天想练哪儿？';
    el.exPart.textContent = '等待弹幕点动作';
    el.exChips.innerHTML = '';
    el.exSets.textContent = '—';
    el.exReps.textContent = '—';
    el.exRest.textContent = '—';
    el.exCues.innerHTML = '';
    el.exMistake.textContent = '';
    el.doseMeta.textContent = '等动作';
    el.demoBadge.textContent = '待开始';
    showMedia(null);
    return;
  }
  el.exPart.textContent = `${c.part} · ${c.cat}`;
  el.exName.textContent = c.name;
  el.eqTag.textContent = c.equip || '徒手';
  el.exSets.textContent = c.sets;
  el.exReps.textContent = String(c.reps).replace('次', '');
  el.exRest.textContent = c.restSec;
  el.exChips.innerHTML = [
    `<span class="chip hot">${escapeHtml(c.target || c.part)}</span>`,
    `<span class="chip">${escapeHtml(c.levelText || '')}</span>`,
    `<span class="chip">${escapeHtml(c.equip)}</span>`,
    c.tempo ? `<span class="chip">节奏 ${escapeHtml(c.tempo)}</span>` : '',
  ].join('');
  const cues = [c.note, ...(c.cues || []), `呼吸：${c.breath || '发力呼气，还原吸气'}`].filter(Boolean).slice(0, 4);
  el.exCues.innerHTML = cues.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  el.exMistake.textContent = c.mistakes?.[0] ? `常见错误：${c.mistakes[0]}` : '';
  el.repCount.hidden = !state.setsDone;
  el.repDone.textContent = state.setsDone;
  el.doseMeta.textContent = `${c.sets} 组 × ${c.reps}`;
  el.demoBadge.textContent = '示范中';
  showMedia(c);
}

/* ================= 动作示范：优先 openGym 的示范视频 ================= */
let mediaId = null;
const mediaBroken = new Set();

function showMedia(ex) {
  const video = el.demoVideo;
  if (!ex || !ex.id) {
    mediaId = null;
    try {
      video.pause();
      video.removeAttribute('src');
    } catch {}
    video.hidden = true;
    el.canvas.hidden = true;
    el.demoEmpty.hidden = false;
    el.demoFrame.classList.add('is-empty');
    return;
  }
  el.demoEmpty.hidden = true;
  el.demoFrame.classList.remove('is-empty');
  if (mediaId === ex.id) return;
  mediaId = ex.id;
  if (mediaBroken.has(ex.id)) {
    fallbackCanvas(ex);
    return;
  }
  video.hidden = false;
  el.canvas.hidden = true;
  video.src = `/gym-media/clip/${encodeURIComponent(ex.id)}.mp4`;
  video.play().catch(() => {});
}

function fallbackCanvas(ex) {
  try {
    el.demoVideo.pause();
  } catch {}
  el.demoVideo.hidden = true;
  el.demoEmpty.hidden = true;
  el.canvas.hidden = false;
  renderCanvasPattern(ex.pattern);
}

el.demoVideo?.addEventListener('error', () => {
  if (!mediaId) return;
  mediaBroken.add(mediaId);
  if (state.current) fallbackCanvas(state.current);
});
el.demoVideo?.addEventListener('loadeddata', () => {
  el.demoVideo.hidden = false;
});

function renderPlan() {  const p = state.plan;
  if (!p) {
    el.planTitle.textContent = '今天练什么';
    el.planMeta.textContent = '等弹幕说「想练腿」';
    el.planBody.innerHTML = '<div class="plan-empty">有人点部位，我就把热身、主项、收尾排好，组数和休息都写清楚。</div>';
    return;
  }
  el.planTitle.textContent = `今天练${p.part}`;
  el.planMeta.textContent = `${p.estMin} 分钟 · ${p.totalSets} 组 · ${p.levelText}`;
  const activeId = state.current?.id;
  const block = (b) => `
    <div class="plan-stage ${b.exercise.id === activeId ? 'active' : ''}">
      <div class="k">${b.kind === 'main' ? '主项' : '辅助'}</div>
      <div class="v">${escapeHtml(b.exercise.name)}</div>
      <div class="s">${b.rounds} 组 · ${escapeHtml(String(b.exercise.reps))} · 休 ${b.exercise.restSec}s</div>
    </div>`;
  el.planBody.innerHTML = `
    <div class="plan-stage plan-warm"><div class="k">热身</div><div class="v">${escapeHtml(p.warmup.join(' / '))}</div></div>
    ${p.blocks.map(block).join('')}
    <div class="plan-stage plan-cool"><div class="k">收尾</div><div class="v">${escapeHtml(p.cooldown.join(' / '))}</div></div>`;
}

function renderRest() {
  if (!state.rest) {
    el.restBox.hidden = true;
    return;
  }
  el.restBox.hidden = false;
  el.restNext.textContent = state.rest.nextName ? `下一组：${state.rest.nextName}` : '';
}

function tickRest() {
  if (!state.rest) return;
  const left = Math.max(0, Math.round((state.rest.endsAt - Date.now()) / 1000));
  el.restTime.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  if (left <= 0) {
    state.rest = null;
    el.restBox.hidden = true;
  }
}

/* ================= 点歌 ================= */
function renderSong(song) {
  if (!song) return;
  state.song = song;
  const cur = song.currentSong;
  el.nowTitle.textContent = cur ? `${cur.title}` : '还没放歌';
  el.nowBy.textContent = cur
    ? `${cur.by ? `${cur.by} · ` : ''}${cur.vip ? '会员音源' : cur.provider === 'local' ? '本地' : '网易云'}`
    : '弹幕「点歌 晴天」';
  const list = song.playlist || [];
  el.queueCount.textContent = `${list.length}/${song.queueMax || 3}`;
  el.queueList.innerHTML = list.length
    ? list.map((s, i) => `<li><span class="idx">${i + 1}</span><span class="t">${escapeHtml(s.title)}${s.by ? ` · ${escapeHtml(s.by)}` : ''}</span></li>`).join('')
    : '<li class="empty">队列空着，点一首？</li>';
  if (cur?.url && el.player.dataset.url !== cur.url) {
    el.player.dataset.url = cur.url;
    el.player.src = cur.url;
    if (state.audioReady) el.player.play().catch(() => {});
  }
  if (!cur) {
    el.player.pause();
    el.player.removeAttribute('src');
    el.player.dataset.url = '';
  }
}

el.player.addEventListener('timeupdate', () => {
  const d = el.player.duration;
  if (!d || !Number.isFinite(d)) return;
  el.musicProgress.style.width = `${Math.min(100, (el.player.currentTime / d) * 100)}%`;
});

el.player.addEventListener('ended', async () => {
  el.musicProgress.style.width = '0%';
  try {
    await fetch(`${SERVER}/api/music/ended`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  } catch {}
});

el.nextBtn.addEventListener('click', async () => {
  await fetch(`${SERVER}/api/song/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
});

/* ================= 宠物 ================= */
const petCache = new Set();
function setMood(name) {
  const src = `assets/pet/${name}.webm`;
  if (el.pet.dataset.mood === name) return;
  if (!petCache.has(name)) {
    // 文件不存在时浏览器会触发 error，退回 idle
    el.pet.onerror = () => {
      el.pet.onerror = null;
      el.pet.dataset.mood = '';
      setMood('idle');
    };
    petCache.add(name);
  }
  el.pet.dataset.mood = name;
  el.pet.src = src;
  el.pet.play?.().catch(() => {});
}

/* ================= SSE ================= */
function connect() {
  const es = new EventSource(`${SERVER}/api/fitness/events`);
  es.onmessage = (e) => {
    let d = null;
    try {
      d = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!d || d.room !== 'fitness') return;
    switch (d.type) {
      case 'fit-state':
        renderState(d);
        if (Array.isArray(d.feed) && el.feed.children.length === 0) {
          d.feed.slice(-12).forEach((it) => addMessage(it, { live: false }));
        }
        break;
      case 'fit-event':
        addMessage(d.item);
        if (d.item?.voice) playVoiceUrl(d.item.voice);
        if (d.item?.kind === 'ai') setMood('talk');
        break;
      case 'fit-song':
        renderSong(d.song);
        break;
      case 'fit-extra':
        if (d.stats) renderStats(d.stats);
        if (d.song) renderSong(d.song);
        if (d.balance !== undefined) renderBalance(d.balance);
        break;
      default:
        break;
    }
  };
  es.onerror = () => {
    // EventSource 自己会重连，这里只更新提示
    el.voiceHint.textContent = '连接断开，重连中…';
  };
  es.onopen = () => {
    el.voiceHint.textContent = '在听弹幕…';
  };
}

function renderStats(stats) {
  state.stats = stats;
  const tokens = stats?.tokens?.total ?? stats?.tokenTotal ?? 0;
  el.todayTokens.textContent = formatNum(tokens);
}

function renderBalance(balance) {
  const v = balance?.total ?? balance?.balance;
  el.balance.textContent = v === undefined || v === null ? '—' : `¥${Number(v).toFixed(2)}`;
}

function formatNum(n) {
  const v = Number(n) || 0;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(v);
}

/* ================= Canvas 动作演示 ================= */
const ctx = el.canvas.getContext('2d');
const OX = 310;
const OY = 596;
const S = 132;
const RAD = Math.PI / 180;

function toScreen([x, y]) {
  return [OX + x * S, OY - y * S];
}

const LIMB = { shin: 0.92, thigh: 0.98, torso: 1.1, upper: 0.72, fore: 0.66, head: 0.24 };

/** 侧视：从脚往上算关节位置，脚踩地、髋随角度下沉 */
function buildSide(p) {
  const legs = (p.legs || [{}]).map((l, i) => {
    const foot = [l.footX || 0, 0];
    const knee = [foot[0] + Math.sin(l.shin * RAD) * LIMB.shin, foot[1] + Math.cos(l.shin * RAD) * LIMB.shin];
    const hip = [knee[0] + Math.sin(l.thigh * RAD) * LIMB.thigh, knee[1] + Math.cos(l.thigh * RAD) * LIMB.thigh];
    return { foot, knee, hip, back: i > 0 };
  });
  // 两条腿共用一个髋，前后脚才不会「各走各的」
  const hip = legs[0].hip;
  legs.forEach((l) => {
    l.hip = hip;
  });
  const sh = [hip[0] + Math.sin(p.lean * RAD) * LIMB.torso, hip[1] + Math.cos(p.lean * RAD) * LIMB.torso];
  const head = [sh[0] + Math.sin(p.lean * RAD) * 0.3, sh[1] + Math.cos(p.lean * RAD) * 0.3];
  const armOf = (a) => {
    const elbow = [sh[0] + Math.sin(a.arm * RAD) * LIMB.upper, sh[1] - Math.cos(a.arm * RAD) * LIMB.upper];
    const hand = [elbow[0] + Math.sin(a.fore * RAD) * LIMB.fore, elbow[1] - Math.cos(a.fore * RAD) * LIMB.fore];
    return { elbow, hand };
  };
  const arms = (p.arms || [{}]).map(armOf);
  return { legs, hip, sh, head, arms, p };
}

/** 正视：左右对称，手臂抬高/弯曲 */
function buildFront(p) {
  const hip = [0, 1.95];
  const sh = [0, hip[1] + LIMB.torso];
  const head = [0, sh[1] + 0.32];
  const arms = [1, -1].map((side) => {
    const a = p.arms?.[0] || {};
    const elev = (a.elev ?? 0) * RAD;
    const bend = (a.bend ?? 0) * RAD;
    const shoulder = [side * 0.42, sh[1] - 0.06];
    const elbow = [shoulder[0] + side * Math.cos(elev) * LIMB.upper, shoulder[1] + Math.sin(elev) * LIMB.upper];
    const hand = [elbow[0] + side * Math.cos(elev + bend) * LIMB.fore, elbow[1] + Math.sin(elev + bend) * LIMB.fore];
    return { shoulder, elbow, hand, side };
  });
  const legs = [1, -1].map((side) => ({
    hip: [side * 0.2, hip[1]],
    knee: [side * (0.24 + (p.spread || 0)), 1.0],
    foot: [side * (0.3 + (p.spread || 0) * 1.4), 0],
  }));
  return { hip, sh, head, arms, legs, front: true, p };
}

const PATTERNS = {
  squat: (d) => ({
    view: 'side',
    legs: [{ shin: 8 + 18 * d, thigh: -6 - 50 * d }],
    lean: 8 + 26 * d,
    arms: [{ arm: -18 - 40 * d, fore: -95 - 20 * d }],
    prop: 'back',
  }),
  hinge: (d) => ({
    view: 'side',
    legs: [{ shin: 4 + 10 * d, thigh: -4 - 16 * d }],
    lean: 8 + 62 * d,
    arms: [{ arm: 2 + 6 * d, fore: 2 + 6 * d }],
    prop: 'bar',
  }),
  lunge: (d) => ({
    view: 'side',
    legs: [
      { footX: 0.85, shin: 24 + 8 * d, thigh: -30 - 30 * d },
      { footX: -0.55, shin: -30 - 12 * d, thigh: -18 - 26 * d },
    ],
    lean: 6 + 6 * d,
    arms: [{ arm: 4, fore: 2 }],
    prop: 'dumbbell',
  }),
  push_h: (d) => ({
    view: 'side',
    legs: [{ footX: 0.18, shin: 6, thigh: -4 }],
    lean: 4,
    arms: [{ arm: 62 + 34 * d, fore: 62 + 34 * d }],
    prop: 'bar',
  }),
  push_v: (d) => ({
    view: 'front',
    arms: [{ elev: 62 + 62 * d, bend: -8 }],
    spread: 0.04,
    prop: 'bar',
    legs: [{ knee: 0.06, foot: 0 }],
  }),
  pull_v: (d) => ({
    view: 'front',
    arms: [{ elev: 128 - 24 * d, bend: -14 }],
    spread: 0.06,
    prop: 'bar',
    overhead: true,
  }),
  pull_h: (d) => ({
    view: 'side',
    legs: [{ shin: 8, thigh: -6 }],
    lean: 44,
    arms: [{ arm: 6 - 8 * d, fore: 6 - 78 * d }],
    prop: 'dumbbell',
  }),
  curl: (d) => ({
    view: 'side',
    legs: [{ shin: 4, thigh: -2 }],
    lean: 4,
    arms: [{ arm: 6, fore: 2 + 118 * d }],
    prop: 'dumbbell',
  }),
  extend: (d) => ({
    view: 'side',
    legs: [{ shin: 4, thigh: -2 }],
    lean: 10,
    arms: [{ arm: 12, fore: 12 + 70 * (1 - d) }],
    prop: 'dumbbell',
  }),
  raise: (d) => ({
    view: 'front',
    arms: [{ elev: 8 + 74 * d, bend: -6 }],
    spread: 0.05,
    prop: 'dumbbell',
  }),
  crunch: (d) => ({
    view: 'side',
    legs: [{ shin: 78, thigh: 6 }],
    lean: -78 + 34 * d,
    hipY: 0,
    arms: [{ arm: 150, fore: 200 }],
    prop: 'none',
    lying: true,
  }),
  plank: (d) => ({
    view: 'side',
    legs: [{ shin: 88, thigh: 84 }],
    lean: 86 + 1.5 * Math.sin(d * Math.PI * 2),
    arms: [{ arm: 92, fore: 2 }],
    prop: 'none',
    lying: true,
  }),
  carry: (d) => ({
    view: 'side',
    legs: [{ footX: 0.2 * Math.sin(d * Math.PI * 2), shin: 6, thigh: -4 }],
    lean: 4,
    arms: [{ arm: 4, fore: 4 }],
    prop: 'dumbbell',
  }),
  jump: (d) => ({
    view: 'side',
    legs: [{ shin: 6 + 20 * d, thigh: -6 - 24 * d }],
    lean: 10 + 12 * d,
    arms: [{ arm: -40 + 130 * d, fore: -40 + 130 * d }],
    prop: 'none',
    lift: d > 0.55 ? (d - 0.55) * 0.9 : 0,
  }),
  run: (d) => ({
    view: 'side',
    legs: [
      { footX: 0.28, shin: 26 - 40 * d, thigh: -34 + 60 * d },
      { footX: -0.24, shin: -30 + 46 * d, thigh: -20 - 44 * d },
    ],
    lean: 12,
    arms: [
      { arm: -50 + 90 * d, fore: -60 + 90 * d },
      { arm: 40 - 90 * d, fore: 50 - 90 * d },
    ],
    prop: 'none',
  }),
  stretch: (d) => ({
    view: 'side',
    legs: [{ footX: 0.15, shin: 6, thigh: -4 }],
    lean: 26 + 10 * d,
    arms: [{ arm: 40 + 20 * d, fore: 70 + 30 * d }],
    prop: 'none',
  }),
  rotate: (d) => ({
    view: 'front',
    arms: [{ elev: 20 + 10 * d, bend: -60 }],
    spread: 0.05,
    prop: 'none',
    twist: Math.sin(d * Math.PI * 2),
  }),
};

let activePattern = 'squat';
let animStart = performance.now();
let animPhase = 0;

function renderCanvasPattern(pattern) {
  if (pattern && PATTERNS[pattern] && pattern !== activePattern) {
    activePattern = pattern;
    animStart = performance.now();
  } else if (pattern && PATTERNS[pattern]) {
    activePattern = pattern;
  }
}

function drawProp(prop, pts) {
  if (!prop || prop === 'none' || !pts.hand) return;
  const [hx, hy] = toScreen(pts.hand);
  ctx.save();
  ctx.lineCap = 'round';

  const barAt = (cx, cy, half, plateR) => {
    // 杠铃杆
    ctx.strokeStyle = '#e6eef2';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx + half, cy);
    ctx.stroke();
    // 两端杠铃片
    [-half, half].forEach((dx, i) => {
      ctx.fillStyle = i === 0 ? '#3d4b52' : '#2b363c';
      ctx.beginPath();
      ctx.arc(cx + dx, cy, plateR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(198,255,74,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  if (prop === 'bar') {
    barAt(hx, hy, S * 1.05, 16);
  } else if (prop === 'back') {
    const [sx, sy] = toScreen(pts.sh);
    barAt(sx, sy - 6, S * 1.02, 17);
  } else if (prop === 'dumbbell') {
    ctx.fillStyle = '#dfe9ee';
    [-9, 9].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(hx + dx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = '#dfe9ee';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx - 9, hy);
    ctx.lineTo(hx + 9, hy);
    ctx.stroke();
  } else if (prop === 'cable') {
    ctx.strokeStyle = 'rgba(89,224,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, hy - S * 1.7);
    ctx.stroke();
    ctx.fillStyle = '#59e0ff';
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function limb(a, b, width, color) {
  const [x1, y1] = toScreen(a);
  const [x2, y2] = toScreen(b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(p, r, color) {
  const [x, y] = toScreen(p);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawFigure(pose) {
  const skin = '#e8f3f7';
  const far = 'rgba(198, 255, 74, 0.45)';
  const near = '#c6ff4a';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (pose.view === 'front') {
    const f = buildFront(pose);
    const [hx, hy] = toScreen(f.head);
    // 躯干
    limb(f.hip, [f.hip[0], f.sh[1]], 16, skin);
    // 腿
    f.legs.forEach((l) => {
      limb(l.hip, l.knee, 13, near);
      limb(l.knee, l.foot, 12, near);
      dot(l.foot, 6, near);
    });
    // 手臂
    f.arms.forEach((a) => {
      limb(a.shoulder, a.elbow, 11, near);
      limb(a.elbow, a.hand, 10, near);
      dot(a.hand, 7, '#fff');
    });
    // 头
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, LIMB.head * S, 0, Math.PI * 2);
    ctx.fill();
    // 器械横杠
    if (pose.prop === 'bar') {
      const handY = (f.arms[0].hand[1] + f.arms[1].hand[1]) / 2;
      const handX = (f.arms[0].hand[0] + f.arms[1].hand[0]) / 2;
      const [ax, ay] = toScreen([f.arms[1].hand[0] - 1.15, handY || 0]);
      const [bx, by] = toScreen([f.arms[0].hand[0] + 1.15, handY || 0]);
      ctx.strokeStyle = '#dfe9ee';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      [ax, bx].forEach((x) => {
        ctx.fillStyle = '#dfe9ee';
        ctx.beginPath();
        ctx.arc(x, ay, 12, 0, Math.PI * 2);
        ctx.fill();
      });
      void handX;
    } else if (pose.prop === 'dumbbell') {
      f.arms.forEach((a) => drawProp('dumbbell', { hand: a.hand }));
    }
    ctx.restore();
    return;
  }

  const b = buildSide(pose);
  const lift = pose.lift || 0;
  const shift = (pt) => [pt[0], pt[1] + lift];
  const farCol = 'rgba(120,178,96,0.5)';
  const nearLeg = b.legs[0];

  // 远侧腿：有第二段腿（弓步/分腿蹲）就照着画，否则按同一角度错开一点做纵深
  const farLeg = b.legs[1]
    ? { hip: b.legs[1].hip, knee: b.legs[1].knee, foot: b.legs[1].foot }
    : {
        hip: [nearLeg.hip[0] - 0.16, nearLeg.hip[1]],
        knee: [nearLeg.knee[0] - 0.22, nearLeg.knee[1] + 0.03],
        foot: [nearLeg.foot[0] - 0.3, 0],
      };
  limb(shift(farLeg.hip), shift(farLeg.knee), 18, farCol);
  limb(shift(farLeg.knee), shift(farLeg.foot), 16, farCol);
  dot(shift(farLeg.foot), 8, farCol);

  // 背蹲：双手扶在肩上杠铃两端
  const backSquat = pose.prop === 'back';
  const hand = backSquat ? [b.sh[0] - 0.26, b.sh[1] + 0.04] : b.arms[0].hand;
  const elbow = backSquat ? [b.sh[0] - 0.3, b.sh[1] - 0.5] : b.arms[0].elbow;

  // 远侧手臂
  limb(shift(b.sh), [shift(elbow)[0] + 0.14, shift(elbow)[1]], 15, farCol);
  limb([shift(elbow)[0] + 0.14, shift(elbow)[1]], [shift(hand)[0] + 0.1, shift(hand)[1]], 13, farCol);

  // 躯干
  limb(shift(b.hip), shift(b.sh), 26, skin);
  // 脖子
  limb(shift(b.sh), shift([b.sh[0] + 0.05, b.sh[1] + 0.16]), 14, skin);
  // 近侧腿
  limb(shift(nearLeg.hip), shift(nearLeg.knee), 22, near);
  limb(shift(nearLeg.knee), shift(nearLeg.foot), 20, near);
  dot(shift(nearLeg.foot), 9, near);
  // 近侧手臂
  limb(shift(b.sh), shift(elbow), 18, near);
  limb(shift(elbow), shift(hand), 16, near);
  dot(shift(hand), 10, '#ffffff');
  // 关节高光
  dot(shift(b.hip), 7, 'rgba(198,255,74,0.55)');
  dot(shift(nearLeg.knee), 6, 'rgba(198,255,74,0.55)');
  // 头
  const [hx, hy] = toScreen(shift(b.head));
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, LIMB.head * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a1216';
  ctx.beginPath();
  ctx.arc(hx + 9, hy - 3, 4, 0, Math.PI * 2);
  ctx.fill();

  drawProp(pose.prop, { hand: shift(hand), sh: shift(b.sh) });
  ctx.restore();
}

function drawScene() {
  const w = el.canvas.width;
  const h = el.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 地面光圈
  const g = ctx.createRadialGradient(OX, OY + 20, 20, OX, OY + 20, 300);
  g.addColorStop(0, 'rgba(198,255,74,0.18)');
  g.addColorStop(1, 'rgba(198,255,74,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(OX, OY + 18, 240, 54, 0, 0, Math.PI * 2);
  ctx.fill();

  const fn = PATTERNS[activePattern] || PATTERNS.squat;
  const period = activePattern === 'run' ? 900 : activePattern === 'jump' ? 1400 : 2200;
  const t = ((performance.now() - animStart) % period) / period;
  // 0→1→0 的往复，端点稍微停一下
  const d = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  const pose = fn(d);
  drawFigure(pose);
}

function loop() {
  // 只有视频没素材、退回骨骼图时才需要画
  if (!el.canvas.hidden) drawScene();
  requestAnimationFrame(loop);
}

/* ================= 启动 ================= */
function clockTick() {
  const now = new Date();
  el.clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function boot() {
  if (location.search.includes('bare=1')) document.body.classList.add('bare');
  const auto = location.search.includes('auto=1');
  if (!auto) {
    el.soundUnlock.hidden = false;
  } else {
    state.audioReady = true;
  }
  el.soundStart.addEventListener('click', async () => {
    state.audioReady = true;
    el.soundUnlock.hidden = true;
    // 解锁一次音频上下文
    try {
      await el.player.play();
      el.player.pause();
    } catch {}
  });
  setMood('idle');
  clockTick();
  setInterval(clockTick, 10000);
  setInterval(tickRest, 250);
  loop();
  connect();
  // 兜底拉一次状态（SSE 有时候首帧会晚）
  try {
    const st = await fetch(`${SERVER}/api/fitness/state`).then((r) => r.json());
    if (st?.ok) {
      renderState(st);
      if (st.stats) renderStats(st.stats);
      if (st.song) renderSong(st.song);
      (st.feed || []).slice(-10).forEach((it) => addMessage(it, { live: false }));
    }
  } catch {}
}

boot();
