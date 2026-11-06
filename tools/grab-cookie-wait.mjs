/**
 * 等用户扫码登录 → 读 Cookie → 存进 danmaku.cookie。
 *   node tools/grab-cookie-wait.mjs [--port 9333] [--wait 300] [--save]
 */
import WebSocket from 'ws';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PORT = arg('port', '9333');
const WAIT = Number(arg('wait', '300'));
const SAVE = process.argv.includes('--save');
const SERVER = 'http://127.0.0.1:8787';

const KEEP = new Set([
  'sessionid', 'sessionid_ss', 'sid_tt', 'uid_tt', 'uid_tt_ss', 'sid_guard',
  'ttwid', 'odin_tt', 'passport_csrf_token', 'passport_csrf_token_default',
  'msToken', 's_v_web_id', 'tt_scid', 'tt_chain_token', 'd_ticket', 'sso_uid_tt',
]);

async function readCookies() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('窗口还没起来');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  const reply = await new Promise((resolve, reject) => {
    const id = 1;
    ws.on('message', (buf) => {
      const m = JSON.parse(buf.toString());
      if (m.id === id) (m.error ? reject(new Error(m.error.message)) : resolve(m.result));
    });
    ws.send(JSON.stringify({ id, method: 'Network.getAllCookies' }));
    setTimeout(() => reject(new Error('CDP 超时')), 8000);
  });
  ws.close();
  return reply.cookies || [];
}

const deadline = Date.now() + WAIT * 1000;
let lastNote = 0;
for (;;) {
  try {
    const all = await readCookies();
    const ours = all.filter((c) => /(^|\.)douyin\.com$/.test(c.domain));
    const login = ours.some((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');
    if (login) {
      const picked = ours.filter((c) => KEEP.has(c.name));
      const line = picked.map((c) => `${c.name}=${c.value}`).join('; ');
      console.log(`已登录：${picked.map((c) => c.name).join(', ')}`);
      console.log(`Cookie 长度 ${line.length}`);
      if (SAVE) {
        const r = await fetch(`${SERVER}/api/config`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patch: { danmaku: { cookie: line } } }),
        });
        console.log('保存：', r.status);
        await new Promise((res) => setTimeout(res, 3000));
        const d = await (await fetch(`${SERVER}/api/danmaku`)).json();
        console.log('通道：', JSON.stringify({ state: d.danmaku.state, hasCookie: d.danmaku.hasCookie, err: d.danmaku.lastError || '' }));
      }
      process.exit(0);
    }
    if (Date.now() - lastNote > 20000) {
      lastNote = Date.now();
      console.log(`等待扫码… 当前 douyin cookie ${ours.length} 个，还没有 sessionid`);
    }
  } catch (err) {
    if (Date.now() - lastNote > 20000) {
      lastNote = Date.now();
      console.log('等待窗口…', err.message);
    }
  }
  if (Date.now() > deadline) {
    console.log('等待超时，没拿到登录态');
    process.exit(2);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
