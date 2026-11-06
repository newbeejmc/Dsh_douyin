/**
 * 健身房：中文动作库的读取、搜索、按部位推荐、计划编排、教练提示词。
 *
 * 动作库由 tools/build-gym-library.mjs 从 openGym 数据整理而来。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const LIB_PATH = path.join(ROOT, 'data', 'gym', 'library.json');

let cache = null;

export function gymLibrary() {
  if (cache) return cache;
  const raw = fs.readFileSync(LIB_PATH, 'utf8');
  const data = JSON.parse(raw);
  data.byId = new Map(data.exercises.map((e) => [e.id, e]));
  cache = data;
  return cache;
}

export function gymParts() {
  return gymLibrary().parts;
}

/** 部位关键词 → 标准部位名（弹幕里「练腿」「想练臀」都能认） */
const PART_ALIASES = [
  ['腿', ['腿', '大腿', '深蹲', '股四', '下肢', '蹲']],
  ['臀', ['臀', '屁股', '翘臀', '臀大肌']],
  ['背', ['背', '背部', '拉背', '背阔']],
  ['胸', ['胸', '胸部', '胸肌', '推胸']],
  ['肩', ['肩', '肩膀', '三角肌', '肩部']],
  ['手臂', ['手臂', '胳膊', '二头', '三头', '弯举']],
  ['核心', ['核心', '腹', '肚子', '腰腹', '腹肌', '平板']],
  ['小腿', ['小腿', '提踵']],
  ['有氧', ['有氧', '心肺', '燃脂', '减脂', '跑步', '跳绳']],
  ['全身', ['全身', '全身练', '体能']],
  ['颈肩', ['颈', '脖子']],
];

export function detectPart(text) {
  const t = String(text || '');
  for (const [part, words] of PART_ALIASES) {
    if (words.some((w) => t.includes(w))) return part;
  }
  return '';
}

export function detectLevel(text) {
  const t = String(text || '');
  if (/新手|入门|小白|第一次|没练过/.test(t)) return 1;
  if (/进阶|老手|有基础|练了.*年/.test(t)) return 3;
  return 0;
}

const EQUIP_PREF = [
  ['徒手', ['徒手', '自重', '家里', '没器械', '无器械']],
  ['哑铃', ['哑铃']],
  ['杠铃', ['杠铃']],
  ['绳索', ['绳索', '龙门', '拉索']],
  ['固定器械', ['器械', '机器']],
];

export function detectEquip(text) {
  const t = String(text || '');
  for (const [eq, words] of EQUIP_PREF) if (words.some((w) => t.includes(w))) return eq;
  return '';
}

export function searchExercises(query, { part = '', limit = 12, level = 0, equip = '' } = {}) {
  const lib = gymLibrary();
  const q = String(query || '').trim().toLowerCase();
  const partKey = part || detectPart(q);
  const eq = equip || detectEquip(q);
  const lv = level || detectLevel(q);
  const scored = [];
  for (const ex of lib.exercises) {
    if (partKey && !ex.parts.includes(partKey) && ex.part !== partKey) continue;
    if (eq && ex.equip !== eq) continue;
    if (lv && Math.abs(ex.level - lv) > 1) continue;
    let score = 0;
    if (!q) score = 1;
    else {
      const name = ex.name.toLowerCase();
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (ex.aliases.some((a) => a.toLowerCase().includes(q))) score = 50;
      else if (ex.en && ex.en.toLowerCase().includes(q)) score = 40;
      else if (ex.target && ex.target.includes(q)) score = 20;
    }
    if (!score) continue;
    score += ex.featured ? 30 : 0;
    score += ex.hasOwnSteps ? 6 : 0;
    score -= Math.abs(ex.level - (lv || 2)) * 2;
    scored.push({ ex, score });
  }
  scored.sort((a, b) => b.score - a.score || a.ex.name.length - b.ex.name.length);
  return scored.slice(0, limit).map((s) => s.ex);
}

/** 找用户说的那个动作；找不到就返回 null（交给 AI 兜底，不要硬塞一个不相关的） */
export function findExercise(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  const raw = q.replace(/[？?！!。，,、\s]/g, '');
  const hits = searchExercises(raw, { limit: 6 });
  if (!hits.length) return null;
  const best = hits[0];
  const n = best.name;
  // 「深蹲」能匹配到「杠铃全蹲」这类，允许；但至少要有两个字的重合
  const overlap = [...n].filter((ch) => raw.includes(ch)).length;
  if (raw.length >= 2 && overlap < Math.min(2, n.length)) return null;
  return best;
}

/* 经典动作 / 垃圾动作的名字特征，排计划和推荐共用 */
const GOOD_NAME =
  /深蹲|硬拉|腿举|蹬腿|弓步|分腿蹲|臀桥|臀推|髋|提踵|腿弯举|腿屈伸|卧推|推胸|推举|肩推|划船|下拉|引体|弯举|下压|臂屈伸|侧平举|前平举|飞鸟|夹胸|平板支撑|卷腹|挺身|俯卧撑|撑体|开合跳|波比|登山跑|跳绳|跑步|椭圆|爬楼|单车/;
const JUNK_NAME =
  /测试|评估|检查|纠正|便盆|断头台|form|drill|灵活性|绕环|热身|放松|按摩|球滚|吊环|椅上|腿长|向侧面|侧向|绕圈|抛接|杂耍|爬行/i;
const EQUIP_BONUS = { 杠铃: 12, 哑铃: 10, 器械: 8, 负重: 6, 壶铃: 6, 绳索: 6, 徒手: 4, 自重: 4 };
const STRETCH_CATS = ['拉伸', '灵活性', '瑜伽', '热身'];

/* 每个部位「像样」的动作模式，用来把「前平举」这种混进来的动作压下去 */
const PART_PATTERN = {
  胸: ['push_h', 'push_v'],
  背: ['pull_v', 'pull_h'],
  腿: ['squat', 'hinge', 'lunge'],
  臀: ['hinge', 'lunge', 'squat'],
  肩: ['raise', 'push_v', 'rotate'],
  手臂: ['curl', 'extend'],
  核心: ['crunch', 'plank', 'rotate'],
  小腿: ['raise', 'jump'],
  有氧: ['run', 'jump', 'carry'],
  全身: ['squat', 'push_h', 'pull_v', 'run'],
  颈肩: ['rotate', 'stretch'],
};

/* 名字里带这些词的才算「这个部位的正经动作」 */
const PART_NAME = {
  胸: /卧推|推胸|飞鸟|夹胸|俯卧撑|俯卧/,
  背: /划船|下拉|引体|挺身|硬拉/,
  腿: /深蹲|腿举|蹬腿|弓步|分腿蹲|腿弯举|腿屈伸|提踵|硬拉/,
  臀: /臀桥|臀推|髋|后踢|硬拉|弓步/,
  肩: /推举|肩推|侧平举|前平举|上举|绕环/,
  手臂: /弯举|下压|臂屈伸|腕/,
  核心: /卷腹|平板|撑|转体|举腿/,
  小腿: /提踵|踝/,
  有氧: /跑|跳|单车|椭圆|跳绳|爬楼/,
};

/** 动作名和这个部位搭不搭：本部位 +30，明显是别的部位的动作 -22 */
function nameFit(key, name) {
  let s = 0;
  if (PART_NAME[key] && PART_NAME[key].test(name)) s += 30;
  for (const other of Object.keys(PART_NAME)) {
    if (other === key) continue;
    if (PART_NAME[other].test(name) && !(PART_NAME[key] && PART_NAME[key].test(name))) {
      s -= 22;
      break;
    }
  }
  return s;
}


/**
 * 给某个部位挑几个「说得出口」的动作。
 *
 * 关键：`ex.part === 部位` 优先（波比这种「顺带练到胸」的全身动作不会挤进胸部推荐），
 * 只用动作库里的中文名 + 组数/休息，绝不让 AI 自己编动作。
 */
export function recommendExercises(part, { limit = 3, level = 0, equip = '', avoid = [] } = {}) {
  const lib = gymLibrary();
  const key = part || '全身';
  const lv = Math.max(0, Math.min(2, Math.round(Number(level) || 0))) + 1;
  const skip = new Set(avoid || []);
  const usable = (e) => !skip.has(e.id) && !STRETCH_CATS.includes(e.cat);
  const strict = lib.exercises.filter((e) => e.part === key && usable(e) && (!equip || e.equip === equip));
  const loose = lib.exercises.filter(
    (e) => (e.part === key || e.parts?.includes(key)) && usable(e) && (!equip || e.equip === equip),
  );
  let pool = strict.length >= limit * 2 ? strict : loose;
  pool = pool.filter((e) => !JUNK_NAME.test(e.name));
  if (!pool.length) pool = lib.exercises.filter((e) => e.part === key).slice(0, 40);
  const named = PART_NAME[key] ? pool.filter((e) => PART_NAME[key].test(e.name)) : [];
  if (named.length >= limit * 3) pool = named;

  const scoreOf = (e) => {
    let s = 0;
    if (e.part === key) s += 80;
    if (GOOD_NAME.test(e.name)) s += 40;
    if (e.featured) s += 25;
    if (e.hasOwnSteps) s += 8;
    if (e.level === lv) s += 10;
    else if (Math.abs((e.level || 2) - lv) === 1) s += 3;
    if (e.cat === '力量' || e.cat === '自重') s += 6;
    if ((PART_PATTERN[key] || []).includes(e.pattern)) s += 18;
    s += nameFit(key, e.name);
    s += EQUIP_BONUS[e.equip] || 0;
    if (key !== '有氧' && ['有氧', '爆发力'].includes(e.cat)) s -= 12;
    return s;
  };
  const ranked = pool
    .map((e) => ({ e, s: scoreOf(e) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);

  /* 同名只留一个；同一动作模式最多两个，避免三个都是卧推 */
  const out = [];
  const seenName = new Set();
  const patternCount = new Map();
  for (const e of ranked) {
    if (seenName.has(e.name)) continue;
    const n = patternCount.get(e.pattern) || 0;
    if (n >= 2) continue;
    seenName.add(e.name);
    patternCount.set(e.pattern, n + 1);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** 「练胸的话，我给你三个：…」——带组数/休息，末尾留一个「安排」的口子 */
export function recommendSpeech(part, list, { username = '', avoid = false } = {}) {
  const who = username ? `${username}，` : '';
  if (!list?.length) return `${who}${part}这块我一时没挑出合适的，换个部位或者直接说动作名？`;
  const first = list[0];
  const names = list.map((e) => e.name).join('、');
  const cue = String(first.cues?.[0] || '').trim().replace(/[。；;，,]+$/, '');
  const head = avoid ? `${who}换一批，` : `${who}练${part}的话，`;
  return (
    `${head}我给你 ${list.length} 个：${names}。` +
    `先从${first.name}开始，${first.sets} 组 ${first.reps}，组间歇 ${first.restSec} 秒。` +
    (cue ? `记一句就行：${cue}。` : '') +
    `要我把整套排出来，就说「安排」。`
  );
}


const TARGET_FIX = {
  pectorals: '胸大肌',
  pectoralis: '胸大肌',
  chest: '胸大肌',
  quadriceps: '股四头肌',
  quads: '股四头肌',
  glutes: '臀大肌',
  hamstrings: '腘绳肌',
  calves: '小腿',
  lats: '背阔肌',
  delts: '三角肌',
  deltoids: '三角肌',
  shoulders: '三角肌',
  biceps: '肱二头肌',
  triceps: '肱三头肌',
  abs: '腹直肌',
  abdominals: '腹直肌',
  obliques: '腹斜肌',
  forearms: '前臂',
  traps: '斜方肌',
  'lower back': '下背',
  'middle back': '中背',
  'upper back': '上背',
  'full body': '全身',
  'cardiovascular system': '心肺',
  'hip flexors': '髂腰肌',
  adductors: '内收肌',
  abductors: '外展肌',
  spine: '脊柱',
  'rotator cuff': '肩袖',
  'serratus anterior': '前锯肌',
  neck: '颈部',
};

function targetCn(t) {
  const key = String(t || '').trim().toLowerCase();
  if (!key) return '';
  if (TARGET_FIX[key]) return TARGET_FIX[key];
  if (/[\u4e00-\u9fa5]/.test(key)) return t;
  const sing = key.replace(/s$/, '');
  return TARGET_FIX[sing] || t;
}

/** 把「第一句。第二句。」拼成顺畅的一段，避免双句号 */
function joinSteps(steps) {
  return steps
    .map((s) => String(s).trim().replace(/[。；;，,]+$/, ''))
    .filter(Boolean)
    .join('。');
}

const LEVEL_CN = { 1: '入门', 2: '进阶', 3: '高阶' };

export function exerciseView(ex, { includeSteps = true } = {}) {
  if (!ex) return null;
  return {
    id: ex.id,
    name: ex.name,
    en: ex.en,
    part: ex.part,
    parts: ex.parts,
    target: targetCn(ex.target) || ex.part,
    equip: ex.equip,
    cat: ex.cat,
    level: ex.level,
    levelText: LEVEL_CN[ex.level] || '进阶',
    pattern: ex.pattern,
    sets: ex.sets,
    reps: ex.reps,
    restSec: ex.restSec,
    tempo: ex.tempo,
    cues: ex.cues,
    mistakes: ex.mistakes,
    breath: ex.breath,
    note: ex.note,
    steps: includeSteps
      ? (ex.steps || []).map((s) => String(s).trim().replace(/[。；;，,]+$/, '')).filter(Boolean)
      : undefined,
    featured: ex.featured,
  };
}

const WARMUP = {
  腿: ['徒手深蹲 15 次', '弓步走 每侧 10 步', '髋关节绕环 每侧 10 次'],
  臀: ['臀桥 20 次', '侧向弹力带走 每侧 12 步', '髋关节绕环 每侧 10 次'],
  背: ['弹力带下拉 15 次', '猫牛式 10 次', '肩胛骨后缩 15 次'],
  胸: ['跪姿俯卧撑 10 次', '肩绕环 前后各 10 次', '弹力带扩胸 15 次'],
  肩: ['弹力带外旋 每侧 12 次', '肩绕环 前后各 10 次', '轻重量侧平举 15 次'],
  手臂: ['手臂绕环 前后各 10 次', '空手弯举 20 次', '腕关节绕环 每侧 10 次'],
  核心: ['猫牛式 10 次', '死虫 每侧 8 次', '臀桥 15 次'],
  全身: ['开合跳 40 秒', '徒手深蹲 15 次', '肩绕环 前后各 10 次'],
  有氧: ['快走 3 分钟', '开合跳 40 秒', '踝关节绕环 每侧 10 次'],
  小腿: ['踝关节绕环 每侧 10 次', '徒手提踵 20 次', '小腿拉伸 每侧 20 秒'],
  颈肩: ['点头仰头 各 8 次', '肩绕环 前后各 10 次', '胸椎旋转 每侧 8 次'],
};

const COOLDOWN = {
  腿: ['站姿股四头肌拉伸 每侧 30 秒', '坐姿腘绳肌拉伸 每侧 30 秒'],
  臀: ['鸽子式拉伸 每侧 30 秒', '仰卧抱膝 30 秒'],
  背: ['婴儿式 40 秒', '背阔肌拉伸 每侧 30 秒'],
  胸: ['门框胸肌拉伸 每侧 30 秒', '婴儿式 40 秒'],
  肩: ['交叉臂肩后侧拉伸 每侧 30 秒', '门框胸肌拉伸 每侧 30 秒'],
  手臂: ['三头肌过头拉伸 每侧 30 秒', '二头肌靠墙拉伸 每侧 30 秒'],
  核心: ['眼镜蛇式 30 秒', '仰卧扭转 每侧 30 秒'],
  全身: ['站姿前屈 40 秒', '深呼吸放松 60 秒'],
  有氧: ['慢走 3 分钟', '站姿前屈 40 秒'],
  小腿: ['靠墙小腿拉伸 每侧 30 秒', '下犬式 40 秒'],
  颈肩: ['斜方肌拉伸 每侧 30 秒', '胸椎旋转 每侧 10 次'],
};

/** 按部位 + 水平排一节 35–45 分钟的训练：热身 → 主项 → 辅助 → 收尾 */
export function buildPlan({ part = '全身', level = 0, equip = '', minutes = 45, seed = 0 } = {}) {
  const lib = gymLibrary();
  const key = part || '全身';
  /* 后台/弹幕传 0/1/2（新手/进阶/老手），动作库的 level 是 1/2/3。 */
  const lvIn = Math.max(0, Math.min(2, Math.round(Number(level) || 0)));
  const lv = lvIn + 1;
  const PLAN_LEVEL_CN = ['新手', '进阶', '老手'];
  const pickPool = (k) => lib.exercises.filter((e) => (e.parts.includes(k) || e.part === k) && (!equip || e.equip === equip));
  let pool = pickPool(key);
  if (!pool.length) pool = pickPool('全身');
  if (!pool.length) pool = lib.exercises;
  /* 主部位完全对得上的动作够多时，就别让「顺带练到腿」的动作混进来。 */
  const exact = pool.filter((e) => e.part === key);
  if (exact.length >= 8) pool = exact;
  /* 拉伸/瑜伽体式留给收尾，不占主项和辅助的位置。 */
  const training = pool.filter((e) => !STRETCH_CATS.includes(e.cat));
  if (training.length >= 8) pool = training;
  /* 动作库的部位标签挺乱（胸部里混着「肩部平举」），名字对得上的够多就只留它们。 */
  const named = PART_NAME[key] ? pool.filter((e) => PART_NAME[key].test(e.name)) : [];
  if (named.length >= 12) pool = named;

  /* 打分：主部位 > 经典动作 > 精选 > 有中文步骤 > 水平匹配；评估/灵活性动作不抢主项位置。 */
  const scoreOf = (e) => {
    let s = 0;
    if (e.part === key) s += 60;
    if (e.parts?.[0] === key) s += 12;
    if (GOOD_NAME.test(e.name)) s += 50;
    if (JUNK_NAME.test(e.name)) s -= 70;
    s += nameFit(key, e.name);
    if ((PART_PATTERN[key] || []).includes(e.pattern)) s += 16;
    if (e.featured) s += 30;
    if (e.hasOwnSteps) s += 8;
    if (e.level === lv) s += 12;
    else if (Math.abs((e.level || 2) - lv) === 1) s += 3;
    if (e.cat === '力量' || e.cat === '自重') s += 8;
    s += EQUIP_BONUS[e.equip] || 0;
    if (key !== '有氧' && ['有氧', '爆发力', '灵活性', '拉伸'].includes(e.cat)) s -= 14;
    if (/form check|测试|评估|纠正|t drill|便盆/i.test(e.en || '')) s -= 25;
    return s;
  };
  const ranked = pool.map((e) => ({ e, s: scoreOf(e) })).sort((a, b) => b.s - a.s).map((x) => x.e);

  /* 只在打分靠前的几个里轮换，别一路滚到动作库末尾去。 */
  const rotations = (arr, n, window = 4) => {
    if (!arr.length) return [];
    const top = arr.slice(0, Math.max(n, window));
    const off = Math.floor(Date.now() / 1000) % top.length;
    const out = [];
    for (let i = 0; i < Math.min(n, top.length); i += 1) out.push(top[(off + i) % top.length]);
    return out;
  };
  const mainCount = minutes >= 40 ? 3 : 2;
  const accCount = minutes >= 40 ? 2 : 1;

  /* 主项先「一个模式一个」，凑不满再按分数补（胸部动作几乎全是 push_h，
     全靠模式去重的话只能排出一个动作）。 */
  const used = new Set();
  const mains = [];
  const seenPattern = new Set();
  for (const e of ranked) {
    if (used.has(e.name) || seenPattern.has(e.pattern)) continue;
    seenPattern.add(e.pattern);
    used.add(e.name);
    mains.push(e);
    if (mains.length >= mainCount) break;
  }
  if (mains.length < mainCount) {
    for (const e of ranked) {
      if (used.has(e.name)) continue;
      used.add(e.name);
      mains.push(e);
      if (mains.length >= mainCount) break;
    }
  }

  /* 辅助动作在靠前的几个里轮换，让每天的课表有点变化，但避开主项已经用过的模式。 */
  const mainPatterns = new Set(mains.map((e) => e.pattern));
  const rest = ranked.filter((e) => !used.has(e.name) && !mainPatterns.has(e.pattern));
  const accessories = rotations(rest.length ? rest : ranked.filter((e) => !used.has(e.name)), accCount, 4);
  const mainBlocks = mains.map((e, i) => ({
    kind: 'main',
    rounds: i === 0 ? e.sets + 1 : e.sets,
    exercise: exerciseView(e),
  }));
  const accBlocks = accessories.map((e) => ({ kind: 'accessory', rounds: e.sets, exercise: exerciseView(e) }));
  const totalSets = [...mainBlocks, ...accBlocks].reduce((n, b) => n + b.rounds, 0);
  const estMin = Math.round(
    [...mainBlocks, ...accBlocks].reduce((n, b) => n + b.rounds * (40 + b.exercise.restSec) + 90, 0) / 60,
  );
  return {
    part: key,
    level: lvIn,
    levelText: PLAN_LEVEL_CN[lvIn] || '进阶',
    minutes,
    estMin,
    totalSets,
    warmup: WARMUP[key] || WARMUP['全身'],
    blocks: [...mainBlocks, ...accBlocks],
    cooldown: COOLDOWN[key] || COOLDOWN['全身'],
    madeAt: Date.now(),
  };
}

export function planSpeech(plan, { username = '' } = {}) {
  const who = username ? `${username}，` : '';
  const first = plan.blocks[0]?.exercise;
  const names = plan.blocks.map((b) => b.exercise.name);
  return (
    `${who}给你排好啦，今天练${plan.part}，一共 ${plan.blocks.length} 个动作、${plan.totalSets} 组，大概 ${plan.estMin} 分钟。` +
    `先热身：${plan.warmup.join('、')}。` +
    `主项从${first ? first.name : '第一个动作'}开始，${first ? `${first.sets} 组 ${first.reps}，组间休息 ${Math.round(first.restSec / 60 * 10) / 10} 分钟` : ''}。` +
    `顺序是：${names.join('、')}。做完记得拉伸：${plan.cooldown.join('、')}。` +
    `重量别逞强，动作稳比数字重要，我在这儿看着你呢。`
  );
}

export function exerciseSpeech(ex, { username = '' } = {}) {
  if (!ex) return '';
  const who = username ? `${username}，` : '';
  const cue = String(ex.cues?.[0] || '').trim().replace(/[。；;，,]+$/, '');
  const steps = joinSteps(ex.steps.slice(0, 2));
  return (
    `${who}${ex.name}，练${ex.target || ex.part}，${ex.equip}就能做。` +
    `${steps}。` +
    (cue ? `关键是${cue}。` : '') +
    `${ex.sets} 组 ${ex.reps}，歇 ${ex.restSec} 秒。`
  );
}

export const COACH_SYSTEM = `你是「大肥鱼」，一个在抖音直播间带大家练的健身主播，说话像朋友，不像说明书。

规则：
1. 只说中文，口语，短句。一次回复 1–3 句，最多 70 字，适合直接念出来。
2. 有人问动作，先说这个动作练哪里，再给 1 个最关键的要领，最后给一句鼓励或提醒。
3. 有人只说了部位（比如「练胸」），先给两个具体动作名，再顺口问一句水平或者器械；不要空泛地说「多练练」。
4. 不诊断伤病、不承诺减肥效果、不推荐药。有人说疼，就让他停下来休息，必要时看医生。
5. 计划可以系统，回复要有人情味：可以叫对方名字，可以接上一句他刚说过的话，但不要油腻。
6. 只要上面给了「真实动作」列表，就只从里面挑名字，绝不能自己编动作名；列表里没有的，就说「这个我不太确定，咱们换个稳一点的」。
7. 观众的话听不清、或者没说练哪儿，就用一句话反问，别硬猜、别自顾自往下讲。
8. 不要输出 markdown、列表符号、emoji。`;

export function coachMessages({
  text,
  username = '',
  plan = null,
  current = null,
  history = [],
  topic = null,
  suggestions = [],
  safety = false,
} = {}) {
  const bits = [];
  if (safety) {
    bits.push('注意：这位观众说身体不舒服/疼。先让他停下、别硬练，必要时看医生；不要给动作建议，不要诊断。');
  }
  if (topic?.part) bits.push(`观众刚在聊：练${topic.part}` + (topic.pendingPlan ? '（还没排课，等他说「安排」）' : ''));
  if (plan) bits.push(`今天的计划：练${plan.part}，${plan.blocks.map((b) => b.exercise.name).join('、')}`);
  if (current) bits.push(`现在正在演示：${current.name}（${current.target}，${current.sets} 组 ${current.reps}，休息 ${current.restSec} 秒）`);
  if (suggestions.length) bits.push(`这个部位能说的真实动作（只能说这些名字）：${suggestions.join('、')}`);
  const sys = bits.length ? `${COACH_SYSTEM}\n\n当前直播间状态：\n${bits.join('\n')}` : COACH_SYSTEM;
  const msgs = [{ role: 'system', content: sys }];
  for (const h of history.slice(-6)) msgs.push(h);
  msgs.push({ role: 'user', content: username ? `${username}说：${text}` : text });
  return msgs;
}
