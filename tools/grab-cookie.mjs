/**
 * 读直播窗（CDP 9222）里 live.douyin.com / douyin.com 的 Cookie，
 * 拼成一整行，交给 /api/config 存进 danmaku.cookie。
 *
 * 用法：
 *   node tools/grab-cookie.mjs          只打印（不写配置）
 *   node tools/grab-cookie.mjs --save   写进配置并重连弹幕
 */
import WebSocket from 'ws';

const CDP = 'http://127.0.0.1:9222';
const SERVER = 'http://127.0.0.1:8787';
const SAVE = process.argv.includes('--save');

const res = await fetch(`${CDP}/json/list`);
const targets = await res.json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('没找到直播窗页面');

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();

ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
});

const { cookies } = await send('Network.getAllCookies');
const ours = cookies.filter((c) => /(^|\.)douyin\.com$/.test(c.domain));
const names = ours.map((c) => c.name);
const hasLogin = names.includes('sessionid') || names.includes('sessionid_ss');

console.log(`域名 douyin.com 的 cookie 共 ${ours.length} 个`);
console.log(`有没有 sessionid：${hasLogin ? '有 ✅' : '没有 ❌'}`);
console.log(`名字：${names.join(', ')}`);

if (!hasLogin) {
  console.log('\n这个窗口还没登录抖音。请在这个窗口里打开 https://live.douyin.com/ 扫码登录，再重跑。');
  ws.close();
  process.exit(2);
}

/* 只挑直播要用的，避免把一堆无关 cookie 塞进去 */
const KEEP = [
  'sessionid',
  'sessionid_ss',
  'sid_tt',
  'uid_tt',
  'uid_tt_ss',
  'sid_guard',
  'ttwid',
  'odin_tt',
  'passport_csrf_token',
  'passport_csrf_token_default',
  'msToken',
  's_v_web_id',
  'tt_scid',
  'tt_chain_token',
  'd_ticket',
];
const picked = ours.filter((c) => KEEP.includes(c.name));
const line = picked.map((c) => `${c.name}=${c.value}`).join('; ');

console.log(`\n拼好的 Cookie（${picked.length} 个字段，${line.length} 字符）：`);
console.log(`${line.slice(0, 120)}…`);

if (SAVE) {
  const r = await fetch(`${SERVER}/api/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patch: { danmaku: { cookie: line } } }),
  });
  console.log('\n保存到程序：', r.status, (await r.text()).slice(0, 120));
  await new Promise((res) => setTimeout(res, 2500));
  const d = await (await fetch(`${SERVER}/api/danmaku`)).json();
  console.log('弹幕通道：', JSON.stringify({ state: d.danmaku.state, hasCookie: d.danmaku.hasCookie, err: d.danmaku.lastError || '' }));
}

ws.close();
