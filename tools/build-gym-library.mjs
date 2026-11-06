/**
 * 把 openGym 的动作库（英文元数据 + 中文 i18n）整理成直播间用的中文动作库。
 *
 * 输入：.tmp-gym/catalogue/exercises/*.json + .tmp-gym/catalogue/i18n/zh.json
 * 输出：data/gym/library.json
 *
 * 用法：node tools/build-gym-library.mjs
 * 想换数据源：把 openGym 仓库放成 .tmp-gym（git clone --depth 1 ...）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.tmp-gym', 'catalogue');
const OUT_DIR = path.join(ROOT, 'data', 'gym');
const OUT = path.join(OUT_DIR, 'library.json');

const PART_CN = {
  'upper legs': '腿',
  'lower legs': '小腿',
  waist: '核心',
  back: '背',
  shoulders: '肩',
  'upper arms': '手臂',
  'lower arms': '小臂',
  chest: '胸',
  'full body': '全身',
  cardio: '有氧',
  neck: '颈肩',
};

const EQUIP_CN = {
  'body weight': '徒手',
  dumbbell: '哑铃',
  barbell: '杠铃',
  'olympic barbell': '奥杠',
  'ez barbell': '曲杆',
  cable: '绳索',
  'leverage machine': '固定器械',
  'smith machine': '史密斯',
  band: '弹力带',
  'resistance band': '阻力带',
  kettlebell: '壶铃',
  'weight plate': '杠铃片',
  'stability ball': '瑞士球',
  'medicine ball': '药球',
  'suspension trainer': '悬挂带',
  'sled machine': '雪橇',
  assisted: '助力器械',
  landmine: '地雷管',
  'trap bar': '六角杠',
  'bosu ball': '波速球',
  sandbag: '沙袋',
  roller: '泡沫轴',
  'massage ball': '按摩球',
  rope: '战绳',
  weighted: '负重',
  'stationary bike': '动感单车',
  'elliptical machine': '椭圆机',
  'wheel roller': '健腹轮',
  macebell: '锤铃',
  undefined: '自重',
};

const TARGET_CN = {
  quads: '股四头肌',
  glutes: '臀大肌',
  hamstrings: '腘绳肌',
  calves: '小腿',
  chest: '胸大肌',
  lats: '背阔肌',
  'middle back': '中背',
  'lower back': '下背',
  traps: '斜方肌',
  shoulders: '三角肌',
  biceps: '肱二头肌',
  triceps: '肱三头肌',
  forearms: '前臂',
  abs: '腹直肌',
  obliques: '腹斜肌',
  adductors: '内收肌',
  abductors: '外展肌',
  'hip flexors': '髂腰肌',
  neck: '颈部',
  'cardiovascular system': '心肺',
  'full body': '全身',
  spine: '脊柱',
  'rotator cuff': '肩袖',
  'serratus anterior': '前锯肌',
  hands: '手',
  feet: '足',
  wrists: '腕',
  ankles: '踝',
  'gluteus medius': '臀中肌',
  rhomboids: '菱形肌',
  'levator scapulae': '肩胛提肌',
  sternocleidomastoid: '胸锁乳突肌',
  'upper back': '上背',
  'lower abs': '下腹',
  'hip adductors': '内收肌',
  'hip abductors': '外展肌',
};

const CAT_CN = {
  strength: '力量',
  calisthenics: '自重',
  stretching: '拉伸',
  mobility: '灵活性',
  plyometrics: '爆发力',
  isometric: '静力',
  cardio: '有氧',
  yoga: '瑜伽',
  olympic: '举重',
  pilates: '普拉提',
  rehab: '康复',
  combat: '格斗',
};

const PATTERN_TIPS = {
  squat: ['脚掌三点踩实，膝盖顺着脚尖方向推', '下蹲到髋略低于膝，起身时先顶髋再伸膝'],
  hinge: ['脊柱保持中立，用髋往后坐而不是弯腰', '杠铃/哑铃贴着腿走，顶端收紧臀部'],
  lunge: ['前脚全脚掌踩稳，后膝垂直下落到地面附近', '躯干保持直立，重心压在前脚跟'],
  push_h: ['肩胛骨先收稳再推，肘部与躯干约 45 度', '推到手臂接近伸直，不要锁死肘关节'],
  push_v: ['核心收紧，肋骨别外翻', '推到头顶正上方，耳朵靠近手臂'],
  pull_v: ['先沉肩再拉，用背带动手臂', '拉到下巴过杠/把手到锁骨，别甩身体'],
  pull_h: ['胸口挺起来，肘部贴近身体往后拉', '肩胛骨后缩夹紧，停顿一秒再回'],
  curl: ['大臂夹紧身体，只有小臂在动', '放下时慢一点，别靠惯性甩'],
  extend: ['肘部固定，只让前臂伸展', '顶端停一下，感受目标肌收紧'],
  raise: ['小重量控制，抬到与肩同高就够', '不要耸肩，动作全程慢起慢落'],
  crunch: ['下背贴地，用腹部把肩胛骨卷起来', '呼气发力，别用手拽脖子'],
  plank: ['头、背、臀、脚跟成一条直线', '收紧腹部和臀部，正常呼吸别憋气'],
  carry: ['挺胸沉肩，步子小而稳', '身体别左右晃，核心全程绷住'],
  jump: ['落地时屈髋屈膝缓冲，膝盖别内扣', '前脚掌先着地，落地要轻'],
  run: ['呼吸跟上节奏，肩膀放松', '步幅别太大，保持能说短句的强度'],
  stretch: ['拉到有轻微牵拉感就停，不要疼', '均匀呼吸，保持 20–30 秒再换边'],
  rotate: ['骨盆稳住，只转胸椎', '动作慢，呼气时加深一点'],
};

const PATTERN_MISTAKE = {
  squat: '膝盖内扣、脚跟离地、弯腰弓背',
  hinge: '用腰发力、杠铃离开身体、顶端过度后仰',
  lunge: '前膝超过脚尖太多、身体前倾、后膝砸地',
  push_h: '肘部完全打开成 90 度、杠铃压到脖子、屁股离凳',
  push_v: '腰代偿后仰、手腕折回去、推到身体前面',
  pull_v: '耸肩、靠摆动身体借力、只拉半程',
  pull_h: '弓背、用手臂硬拽、肩胛骨不动',
  curl: '大臂前后晃、下放太快、手腕弯折',
  extend: '大臂跟着动、重量太大靠身体压',
  raise: '耸肩、甩起来、抬过肩太多',
  crunch: '用手抱头拽脖子、下背离地、速度太快',
  plank: '塌腰、撅臀、憋气',
  carry: '耸肩、身体侧倾、步子太大',
  jump: '落地膝盖内扣、脚跟着地、落地不缓冲',
  run: '含胸驼背、步幅过大、憋气',
  stretch: '弹震式拉伸、拉到疼、屏住呼吸',
  rotate: '用腰硬拧、骨盆跟着转',
};

const PATTERN_BREATH = {
  squat: '下蹲吸气，起身呼气',
  hinge: '下放吸气，起身呼气',
  lunge: '下蹲吸气，蹬起呼气',
  push_h: '下放吸气，推起呼气',
  push_v: '下放吸气，推起呼气',
  pull_v: '上拉呼气，下放吸气',
  pull_h: '后拉呼气，还原吸气',
  curl: '弯举呼气，下放吸气',
  extend: '伸肘呼气，还原吸气',
  raise: '抬起呼气，下放吸气',
  crunch: '卷起呼气，还原吸气',
  plank: '全程均匀呼吸，别憋气',
  carry: '自然呼吸，别憋气',
  jump: '起跳呼气，落地吸气',
  run: '两步一吸、两步一呼',
  stretch: '缓慢深呼吸，呼气时放松一点',
  rotate: '转动时呼气，回正吸气',
};

const PATTERN_DOSE = {
  squat: { sets: 4, reps: '8–10 次', restSec: 120, tempo: '2-1-2' },
  hinge: { sets: 4, reps: '8–10 次', restSec: 120, tempo: '2-1-2' },
  lunge: { sets: 3, reps: '每侧 10 次', restSec: 75, tempo: '2-1-2' },
  push_h: { sets: 4, reps: '8–10 次', restSec: 120, tempo: '2-1-2' },
  push_v: { sets: 4, reps: '8–10 次', restSec: 90, tempo: '2-1-2' },
  pull_v: { sets: 4, reps: '6–10 次', restSec: 120, tempo: '2-1-3' },
  pull_h: { sets: 3, reps: '10–12 次', restSec: 90, tempo: '2-1-2' },
  curl: { sets: 3, reps: '12 次', restSec: 60, tempo: '2-1-3' },
  extend: { sets: 3, reps: '12 次', restSec: 60, tempo: '2-1-3' },
  raise: { sets: 3, reps: '12–15 次', restSec: 60, tempo: '2-1-3' },
  crunch: { sets: 3, reps: '15 次', restSec: 45, tempo: '2-0-2' },
  plank: { sets: 3, reps: '30–45 秒', restSec: 45, tempo: '静态' },
  carry: { sets: 3, reps: '30 米', restSec: 60, tempo: '稳定' },
  jump: { sets: 3, reps: '8 次', restSec: 90, tempo: '爆发' },
  run: { sets: 3, reps: '45 秒', restSec: 60, tempo: '匀速' },
  stretch: { sets: 2, reps: '每侧 30 秒', restSec: 20, tempo: '静态' },
  rotate: { sets: 2, reps: '每侧 10 次', restSec: 30, tempo: '慢' },
};

// 弹幕最常问的经典动作：手写口语化的要点，别用模板糊过去
const FEATURED = [
  ['barbell full squat', ['深蹲', '杠铃深蹲'], 'squat', ['两脚与肩同宽，脚尖略外八，杠铃放在斜方肌上', '吸气收腹，髋膝同时弯，像往后坐椅子', '下到大腿平行地面，蹬地起身，膝盖始终对脚尖'], ['起身别先抬屁股，容易变成早安式', '下蹲时脚跟别离地'], '新手先用空杆练动作，重量每周加一点就够'],
  ['barbell deadlift', ['硬拉', '传统硬拉'], 'hinge', ['杠在脚掌中间，小腿贴近杠，双手正握', '挺胸沉肩，吸气绷紧核心，用腿把地推走', '杠贴着小腿大腿上行，站直时夹紧臀部'], ['别用腰猛拽，第一下是腿发力', '下放时先屈髋再屈膝'], '腰不舒服立刻停，宁轻不塌腰'],
  ['barbell bench press', ['卧推', '平板卧推', '杠铃卧推'], 'push_h', ['肩胛骨后缩下沉，屁股和上背贴紧凳面', '握距略宽于肩，杠下放到胸线附近', '推起时肘部别完全锁死，保持肩胛稳定'], ['别把杠压到脖子上', '屁股别抬离凳面'], '没有保护架就找人保护，别硬冲大重量'],
  ['pull-up', ['引体向上', '引体'], 'pull_v', ['正握略宽于肩，先沉肩再发力', '用背把身体拉起来，下巴过杠', '下放控制 2–3 秒，手臂别完全松掉'], ['别荡秋千借力', '别耸肩缩脖子'], '拉不动就用助力带或弹力带辅助'],
  ['barbell bent over row', ['杠铃划船', '划船'], 'pull_h', ['屈髋俯身约 45 度，背保持一条直线', '杠往肚脐方向拉，肘部贴身体', '顶端夹紧肩胛骨停一秒'], ['别弓背', '别用腰把杠甩起来'], '重量以能控制住不晃为准'],
  ['barbell shoulder press', ['肩推', '推举', '站姿推举'], 'push_v', ['杠放在锁骨前，握距略宽于肩', '核心收紧，把杠往头顶正上方推', '到头顶后锁定，再慢慢下放'], ['别后仰用腰代偿', '手腕保持中立'], '肩膀有旧伤就换成哑铃坐姿推举'],
  ['dumbbell lunge', ['弓步蹲', '箭步蹲', '弓步'], 'lunge', ['一脚向前跨一大步，前脚全脚掌踩稳', '下蹲到前腿大腿接近平行，后膝靠近地面', '前脚跟发力蹬回，换边'], ['前膝别内扣', '身体别往前扑'], '平衡不好先扶墙做'],
  ['barbell hip thrust', ['臀桥', '臀推', '杠铃臀推'], 'hinge', ['上背靠在凳边，杠放在髋部（垫个垫子）', '脚跟发力顶髋，顶到大腿与身体成一条线', '顶端夹臀停一秒，再慢慢下放'], ['别用腰过度后仰', '下巴微收看前方'], '找不到臀部发力就先做徒手版'],
  ['plank', ['平板支撑', '平板'], 'plank', ['肘在肩正下方，前臂贴地', '头、背、臀、脚跟一条线', '收紧腹部和臀部，正常呼吸'], ['塌腰', '撅屁股', '憋气'], '撑不住 20 秒也比塌腰撑 2 分钟强'],
  ['crunch', ['卷腹'], 'crunch', ['仰卧屈膝，下背贴地', '用腹部把肩胛骨卷离地面', '顶端呼气停一下，慢慢放下'], ['抱头拽脖子', '起身太高变成仰卧起坐'], '脖子酸就是发力错了'],
  ['push-up', ['俯卧撑'], 'push_h', ['双手略宽于肩，身体一条直线', '肘部约 45 度下放，胸口接近地面', '推起时肩胛骨推开，别塌腰'], ['撅屁股', '只做半程'], '做不了就跪姿或手撑高台'],
  ['dumbbell bicep curl', ['二头弯举', '弯举', '哑铃弯举'], 'curl', ['大臂夹紧身体两侧，掌心向前', '只动小臂，把哑铃弯到肩前', '慢慢下放到手臂接近伸直'], ['大臂前后晃', '下放太快'], '重量选能控制 12 次的'],
  ['cable triceps pushdown', ['三头下压', '绳索下压', '臂屈伸'], 'extend', ['肘部固定在身体两侧，身体略前倾', '只让小臂往下伸，到底部收紧三头', '慢慢回到 90 度'], ['大臂跟着前后摆', '耸肩'], '肘部别往外张'],
  ['leg press', ['腿举'], 'squat', ['双脚与肩同宽踩在踏板中间', '下放到膝盖约 90 度，腰别离开靠垫', '脚跟发力推起，膝盖别锁死'], ['膝盖内扣', '下放太深腰离垫'], '重量大时全程控制，别弹'],
  ['lying leg curl', ['腿弯举', '俯卧腿弯举'], 'extend', ['俯卧，脚踝勾住滚垫', '大腿贴紧凳面，只屈膝把垫子卷向臀部', '慢慢放回，保持张力'], ['腰拱起来', '用惯性甩'], '腘绳肌容易抽筋，热身要充分'],
  ['dumbbell lateral raise', ['侧平举', '哑铃侧平举'], 'raise', ['双手持哑铃垂在体侧，肘微屈', '往两侧抬到与肩同高，小指略高', '慢慢下放，别甩'], ['耸肩', '抬过肩', '身体前后晃'], '这个动作轻重量才有效'],
  ['lat pulldown', ['高位下拉', '下拉'], 'pull_v', ['握距略宽于肩，胸口挺起', '先沉肩，把横杆拉到锁骨附近', '慢慢放回，手臂别完全松'], ['身体大幅后仰借力', '拉到脖子后面'], '想着「用肘往下砸」更容易找到背'],
  ['seated cable row', ['坐姿划船', '绳索划船'], 'pull_h', ['坐直，膝盖微屈，胸口挺起', '肘部贴身体往后拉，肩胛骨夹紧', '慢慢送回，背别弓'], ['弓背', '只用手臂拉'], '拉的时候别耸肩'],
  ['romanian deadlift', ['罗马尼亚硬拉', '直腿硬拉'], 'hinge', ['站直，杠贴大腿，膝盖微屈', '髋往后推，杠贴腿下放到小腿中段', '臀腿发力站直，别过度后仰'], ['弯腰下放', '杠离开腿'], '腘绳肌有拉伸感就对了'],
  ['bulgarian split squat', ['保加利亚分腿蹲', '保加利亚蹲'], 'lunge', ['后脚搭在凳上，前脚站到一大步远', '身体垂直下蹲，前腿大腿接近平行', '前脚跟发力站起'], ['前脚离凳太近膝盖压力大', '身体前倾太多'], '先徒手找平衡，再负重'],
  ['jumping jack', ['开合跳'], 'jump', ['站直，跳起同时双腿打开、双手上举', '再跳回并拢，节奏均匀', '前脚掌落地，膝盖微屈缓冲'], ['落地砸脚跟', '膝盖内扣'], '当热身做 30–60 秒'],
  ['burpee', ['波比跳'], 'jump', ['下蹲双手撑地，脚往后跳到平板', '收腿起身跳起，双手过头', '落地缓冲接下一次'], ['塌腰', '落地膝盖内扣'], '累就放慢，别为了数量丢动作'],
  ['mountain climber', ['登山跑'], 'run', ['平板支撑姿势，手在肩下', '交替把膝盖往胸口收', '核心绷住，屁股别上下跳'], ['屁股撅太高', '脚落地太重'], '节奏比速度重要'],
  ['standing hamstring stretch', ['腘绳肌拉伸', '腿后侧拉伸'], 'stretch', ['一脚跟点地，腿伸直，背保持直', '髋往后推，感觉大腿后侧拉开', '保持 30 秒，换边'], ['弓背去够脚尖', '弹震'], '拉到微紧就行'],
  ['cat cow stretch', ['猫牛式', '猫式伸展'], 'rotate', ['四点支撑，手在肩下、膝在髋下', '吸气塌腰抬头，呼气拱背低头', '跟着呼吸慢慢来'], ['速度太快', '手肘锁死'], '久坐党每天来 10 次很舒服'],
];

// 经典动作在数据集里可能叫别的名字：给每个精选动作一组候选关键词（越具体越靠前）
const FEATURE_CANDIDATES = {
  'barbell shoulder press': ['barbell seated shoulder press', 'dumbbell seated shoulder press', 'shoulder press'],
  'crunch': ['crunch (hands overhead)', 'cable kneeling crunch', 'cross body crunch'],
  'leg press': ['sled 45° leg press (back pov)', 'sled 45° leg press', 'leg press'],
  'lying leg curl': ['lever lying leg curl', 'lying leg curl'],
  'lat pulldown': ['cable lateral pulldown (with rope attachment)', 'cable bar lateral pulldown', 'cable pulldown'],
  'seated cable row': ['cable seated row', 'lever seated row', 'seated row', 'cable row'],
  'romanian deadlift': ['barbell romanian deadlift', 'dumbbell romanian deadlift'],
  'bulgarian split squat': ['dumbbell bulgarian split squat', 'bulgarian split squat'],
  'jumping jack': ['jumping jack'],
  'standing hamstring stretch': ['standing hamstring stretch'],
  'cat cow stretch': ['cat cow stretch'],
  'cable triceps pushdown': ['cable triceps pushdown (v-bar)', 'cable pushdown (with rope attachment)', 'cable pushdown'],
  'dumbbell bicep curl': ['dumbbell biceps curl', 'dumbbell standing biceps curl'],
  'hip thrust': ['barbell hip thrust'],
  'plank': ['front plank', 'plank'],
  'push-up': ['push-up'],
};

// 中文步骤缺失时用「按动作模式的通用三步」兜底（宁可说通用做法，也不塞英文原文）
const PATTERN_STEPS = {
  squat: ['器械/重量调整好，双脚与肩同宽站稳，脚尖略外八', '吸气收紧核心，髋和膝一起弯，像往后坐椅子', '下到大腿接近平行地面，脚掌踩实蹬起，站直但别锁死膝盖'],
  hinge: ['站到器械前，双手握稳，膝盖微屈，背挺直', '髋部往后推，让重量贴着腿往下走，感受大腿后侧拉开', '臀腿发力把髋推回，站直夹臀，别用腰往后仰'],
  lunge: ['一脚向前跨出一大步，前脚全脚掌踩稳，躯干立起来', '垂直下蹲，前腿大腿接近平行，后膝靠近地面', '前脚跟发力蹬回站直，换另一边'],
  push_h: ['躺/站到合适位置，肩胛骨后缩稳住，双手握稳重量', '肘部与躯干约 45 度，控制着下放到胸口附近', '推起时呼气，手臂接近伸直但别锁死，保持肩胛稳定'],
  push_v: ['把重量放在锁骨/肩前，握距略宽于肩，核心收紧', '往头顶正上方推，别让腰往后仰代偿', '到头顶后慢慢下放回起点，全程控制'],
  pull_v: ['双手握住把手/横杆，先沉肩，再让背发力', '把重量拉到锁骨或下巴附近，肘部往下走', '控制着放回，手臂别完全松掉，保持背部张力'],
  pull_h: ['屈髋或坐稳，胸口挺起，双手握稳', '肘部贴着身体往后拉，肩胛骨向中间夹', '顶端停一秒，再慢慢送回，背别弓'],
  curl: ['站直或坐稳，大臂夹紧身体两侧', '只动小臂，把重量弯到肩前，顶端收紧', '慢慢下放到手臂接近伸直，别靠惯性甩'],
  extend: ['肘部固定在身体两侧，身体略前倾', '只让小臂往下/往前伸，末端收紧目标肌', '慢慢回到起始角度，保持张力'],
  raise: ['双手持重量垂在体侧，肘微屈，肩膀放松', '往两侧或前方抬到与肩同高', '慢慢下放，别耸肩、别甩'],
  crunch: ['仰卧屈膝，下背贴地，双手轻放耳侧或胸前', '用腹部把肩胛骨卷离地面，呼气', '顶端停一下，慢慢放下，别用手拽脖子'],
  plank: ['肘/手在肩正下方，前臂或手掌撑稳', '头、背、臀、脚跟成一条直线，收紧腹和臀', '保持均匀呼吸，撑到动作变形就停'],
  carry: ['站直，双手或单手提稳重量，挺胸沉肩', '小步往前走，身体别左右晃，核心绷住', '走完规定距离，控制着放下'],
  jump: ['双脚与肩同宽站好，屈髋屈膝下蹲蓄力', '摆臂向上跳起，落地时屈膝缓冲', '前脚掌先着地，膝盖对脚尖，落地要轻'],
  run: ['身体立直略前倾，肩膀放松，手臂自然摆', '按能说短句的节奏跑/踩，呼吸跟上', '结束时慢慢降速，别马上停下'],
  stretch: ['摆好姿势，身体放松，先做几次深呼吸', '慢慢拉到有轻微牵拉感的位置就停住', '保持 20–30 秒，均匀呼吸，然后换边'],
  rotate: ['骨盆稳住，脊柱保持延展', '慢慢转动/拱起胸椎，配合呼吸', '回到中立位，动作全程不要快'],
};

function patternOf(ex) {
  const n = `${ex.name} ${ex.target || ''}`.toLowerCase();
  const cat = ex.category || '';
  if (cat === 'stretching' || cat === 'yoga' || cat === 'mobility' || ex.bodyPart === 'neck') return 'stretch';
  if (/squat|leg press|hack/.test(n)) return 'squat';
  if (/deadlift|good morning|hip thrust|glute bridge|rdl|romanian|pull through/.test(n)) return 'hinge';
  if (/lunge|split squat|step up|step-up|walking lunge/.test(n)) return 'lunge';
  if (/bench press|push up|push-up|pushup|dip|chest press|fly|pec deck|crossover/.test(n)) return 'push_h';
  if (/overhead press|shoulder press|military press|arnold press|push press|jerk|handstand/.test(n)) return 'push_v';
  if (/pull up|pull-up|chin up|pulldown|pull down|lat pull/.test(n)) return 'pull_v';
  if (/row|face pull|rear delt|reverse fly|pullover|shrug/.test(n)) return 'pull_h';
  if (/curl/.test(n)) return 'curl';
  if (/extension|pushdown|kickback|skull/.test(n)) return 'extend';
  if (/raise|lateral|front raise/.test(n)) return 'raise';
  if (/crunch|sit up|sit-up|leg raise|knee raise|russian twist|hollow|ab wheel|rollout/.test(n)) return 'crunch';
  if (/plank|hold|wall sit|isometric/.test(n)) return 'plank';
  if (/carry|farmer|walk/.test(n)) return 'carry';
  if (/jump|hop|plyo|burpee|skip/.test(n)) return 'jump';
  if (/run|jog|sprint|bike|elliptical|treadmill|jump rope|mountain climber/.test(n)) return 'run';
  if (/rotation|twist|cat cow|windmill/.test(n)) return 'rotate';
  if (ex.bodyPart === 'waist') return 'crunch';
  if (ex.bodyPart === 'cardio') return 'run';
  return 'push_h';
}

function levelOf(ex, pattern) {
  const n = ex.name.toLowerCase();
  if (/muscle up|pistol|snatch|clean and jerk|planche|front lever|one arm|single arm handstand|human flag/.test(n)) return 3;
  if (ex.category === 'stretching' || ex.category === 'mobility' || ex.category === 'yoga') return 1;
  if (/assisted|machine|band|smith/.test(n) || ex.equipment === 'leverage machine' || ex.equipment === 'assisted') return 1;
  if (ex.equipment === 'barbell' || ex.equipment === 'olympic barbell' || pattern === 'jump') return 2;
  return 2;
}

function partsOf(ex, partCn) {
  const set = new Set([partCn]);
  const t = `${ex.target || ''} ${(ex.secondaryMuscles || []).join(' ')} ${ex.name}`.toLowerCase();
  if (/glute|hip thrust|bridge/.test(t)) set.add('臀');
  if (/quad|hamstring|lunge|squat|leg|calve|calf/.test(t) && partCn !== '小腿') set.add('腿');
  if (/abs|oblique|core|waist/.test(t)) set.add('核心');
  if (/lat|back|row|pull/.test(t)) set.add('背');
  if (/chest|pec|push up|bench/.test(t)) set.add('胸');
  if (/delt|shoulder|press over/.test(t)) set.add('肩');
  if (/bicep|tricep|curl|arm/.test(t)) set.add('手臂');
  if (ex.category === 'cardio') set.add('有氧');
  return [...set];
}

function cleanName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();
}

function aliasOf(name) {
  const base = cleanName(name);
  const out = new Set([base]);
  const stripped = base.replace(/^(杠铃|哑铃|绳索|器械|史密斯|弹力带|阻力带|壶铃|曲杆|固定器械|助力|悬挂|雪橇|药球|瑞士球|波速球|六角杠|地雷管)/, '');
  if (stripped && stripped !== base) out.add(stripped);
  return [...out];
}

function main() {
  const zh = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', 'zh.json'), 'utf8'));
  const files = fs.readdirSync(path.join(SRC, 'exercises')).filter((f) => f.endsWith('.json'));
  const featuredMap = new Map();
  for (const [en, aliases, pattern, cues, mistakes, note] of FEATURED) {
    featuredMap.set(en, { aliases, pattern, cues, mistakes, note });
  }

  const out = [];
  const seenNames = new Map();
  const enNames = new Set();

  const matchFeatured = (en) => {
    const k = en.toLowerCase();
    if (featuredMap.has(k)) return featuredMap.get(k);
    for (const [key, cands] of Object.entries(FEATURE_CANDIDATES)) {
      const hit = cands.find((c) => k === c.toLowerCase());
      if (hit) return featuredMap.get(key);
    }
    return null;
  };

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SRC, 'exercises', f), 'utf8'));
    enNames.add(String(raw.name || '').toLowerCase());
    const tr = zh[raw.id];
    if (!tr || !tr.name) continue;
    const name = cleanName(tr.name);
    if (!name) continue;
    const partCn = PART_CN[raw.bodyPart] || '全身';
    const feat = matchFeatured(raw.name);
    const pat = feat?.pattern || patternOf(raw);
    const dose = PATTERN_DOSE[pat] || PATTERN_DOSE.push_h;
    const ownSteps = (tr.instructions || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
    const steps = ownSteps.length ? ownSteps : PATTERN_STEPS[pat] || PATTERN_STEPS.push_h;

    const entry = {
      id: raw.id,
      name,
      en: raw.name,
      part: partCn,
      parts: partsOf(raw, partCn),
      target: TARGET_CN[raw.target] || raw.target || partCn,
      equip: EQUIP_CN[raw.equipment] || '自重',
      cat: CAT_CN[raw.category] || '力量',
      level: levelOf(raw, pat),
      pattern: pat,
      steps,
      hasOwnSteps: ownSteps.length > 0,
      cues: feat?.cues || PATTERN_TIPS[pat] || [],
      mistakes: feat?.mistakes || [PATTERN_MISTAKE[pat] || '动作变形、借力'],
      breath: PATTERN_BREATH[pat] || '发力呼气，还原吸气',
      sets: dose.sets,
      reps: dose.reps,
      restSec: dose.restSec,
      tempo: dose.tempo,
      note: feat?.note || '',
      aliases: feat?.aliases ? [name, ...feat.aliases] : aliasOf(name),
      featured: Boolean(feat),
      secondary: (raw.secondaryMuscles || []).map((m) => TARGET_CN[m] || m).slice(0, 4),
    };
    // 同名同器械只留一个（精选优先）
    const key = `${name}|${entry.equip}`;
    if (seenNames.has(key) && !entry.featured) continue;
    seenNames.set(key, entry);
    out.push(entry);
  }

  // 精选动作如果在数据集里一个都没匹配上（英文名改写），补一条纯手写条目，保证一定有
  for (const [en, aliases, pattern, cues, mistakes, note] of FEATURED) {
    const cands = FEATURE_CANDIDATES[en] || [];
    const found = cands.some((c) => enNames.has(c.toLowerCase())) || enNames.has(en.toLowerCase());
    if (found) continue;
    const name = aliases[0];
    const key = `${name}|自重`;
    if (seenNames.has(key)) continue;
    const dose = PATTERN_DOSE[pattern] || PATTERN_DOSE.push_h;
    const entry = {
      id: `custom-${en.replace(/[^a-z0-9]+/gi, '-')}`,
      name,
      en,
      part: /squat|deadlift|lunge|leg|hamstring|calve|calf/i.test(en) ? '腿' : /press|pull|row|curl|lateral|raise|bench|push/i.test(en) ? '全身' : '核心',
      parts: ['全身'],
      target: '',
      equip: '自重',
      cat: '力量',
      level: 2,
      pattern,
      steps: PATTERN_STEPS[pattern],
      hasOwnSteps: false,
      cues,
      mistakes,
      breath: PATTERN_BREATH[pattern],
      sets: dose.sets,
      reps: dose.reps,
      restSec: dose.restSec,
      tempo: dose.tempo,
      note,
      aliases,
      featured: true,
      secondary: [],
    };
    seenNames.set(key, entry);
    out.push(entry);
  }

  out.sort((a, b) => Number(b.featured) - Number(a.featured) || a.part.localeCompare(b.part, 'zh') || a.name.localeCompare(b.name, 'zh'));

  const byPart = {};
  for (const e of out) for (const p of e.parts) byPart[p] = (byPart[p] || 0) + 1;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'openGym (github.com/DuarteSantos8/openGym) catalogue，中文名与步骤来自其 zh i18n',
        generatedAt: new Date().toISOString(),
        count: out.length,
        parts: Object.entries(byPart).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
        exercises: out,
      },
      null,
      0,
    ),
  );
  const size = fs.statSync(OUT).size;
  console.log(`动作库已生成：${OUT}`);
  console.log(`动作 ${out.length} 个 / 精选 ${out.filter((e) => e.featured).length} 个 / ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log('部位分布：', Object.entries(byPart).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
}

main();
