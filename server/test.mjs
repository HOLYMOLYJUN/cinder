/* =========================================================
   test.mjs — 방 서버 검증

   실제 워커에 소켓을 여러 개 붙여 프로토콜을 그대로 시험한다.

     npx wrangler dev                 # 한 창에서 띄워 두고
     npm test                         # 다른 창에서

   나이 제한(TTL)까지 보려면 서버를 짧은 값으로 띄우고 같은 값을 알려준다:

     npx wrangler dev --var HISTORY_TTL_MS:1500
     HISTORY_TTL_MS=1500 npm test
   ========================================================= */

import WebSocket from 'ws';

// 방마다 storage 가 따로 산다. 판을 새로 열어야 history 가 깨끗하다 —
// 고정 이름을 쓰면 지난 실행의 대화가 남아 있어 첫 검사가 깨진다.
const ROOM = 'test-' + Math.random().toString(36).slice(2, 8);
const HOST = process.env.PARTY || 'ws://127.0.0.1:8787';
const URL = HOST.replace(/^http/, 'ws') + '/parties/cinder-room/' + ROOM;
const ORIGIN = 'http://localhost:3000';
const PROTO = 1;

const log = [];
const ok = [];
const fail = [];
const check = (name, cond, extra = '') => (cond ? ok : fail).push(name + (extra ? ' — ' + extra : ''));

function open(label) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL, { origin: ORIGIN });
    ws.got = [];
    ws.on('message', d => {
      const m = JSON.parse(d.toString());
      ws.got.push(m);
      log.push(`[${label}] <- ${JSON.stringify(m).slice(0, 160)}`);
    });
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}
const send = (ws, o) => ws.send(JSON.stringify(o));
const wait = ms => new Promise(r => setTimeout(r, ms));
const seen = (ws, pred) => ws.got.find(pred);

const a = await open('A');
await wait(300);

check('A: hello 수신', !!seen(a, m => m.t === 'hello'));
const hello = seen(a, m => m.t === 'hello');
check('A: hello 에 방 이름', hello?.room === ROOM, `room=${hello?.room}`);
check('A: 첫 입장이라 history 비어 있음', Array.isArray(hello?.history) && hello.history.length === 0);

// ping/pong
send(a, { v: PROTO, t: 'ping' });
await wait(200);
check('A: ping -> pong', !!seen(a, m => m.t === 'pong'));

// B 입장
const b = await open('B');
await wait(300);
check('B: hello 수신', !!seen(b, m => m.t === 'hello'));
check('A: B 입장으로 presence=2', !!seen(a, m => m.t === 'presence' && m.count === 2));

// 채팅 왕복
send(a, { v: PROTO, t: 'chat', name: '준', text: '들리냐' });
await wait(300);
check('B: A 의 채팅 수신', !!seen(b, m => m.t === 'chat' && m.text === '들리냐'));
check('A: 자기 채팅도 되돌아옴 (에코)', !!seen(a, m => m.t === 'chat' && m.text === '들리냐'));
check('채팅에 이름이 붙음', seen(b, m => m.t === 'chat')?.name === '준');

// 다른 프로토콜 판 번호는 무시
send(a, { v: 99, t: 'chat', name: 'x', text: 'FROM_THE_FUTURE' });
await wait(250);
check('다른 v 는 조용히 버림', !seen(b, m => m.text === 'FROM_THE_FUTURE'));

// 빈 줄은 안 나감
send(a, { v: PROTO, t: 'chat', name: '준', text: '   ' });
await wait(250);
check('공백만 있는 줄은 안 나감', !seen(b, m => m.t === 'chat' && m.text.trim() === ''));

// 길이 자르기
send(a, { v: PROTO, t: 'chat', name: '아주아주아주아주아주아주긴이름입니다정말로', text: 'x'.repeat(500) });
await wait(300);
const long = b.got.filter(m => m.t === 'chat').pop();
check('본문 200자로 잘림', long?.text.length === 200, `len=${long?.text.length}`);
check('이름 16자로 잘림', long?.name.length === 16, `len=${long?.name.length}`);

// 제어문자 눕히기
send(a, { v: PROTO, t: 'chat', name: '준', text: 'a\nb\tc' });
await wait(250);
const ctl = b.got.filter(m => m.t === 'chat').pop();
check('개행/탭이 공백으로 눕음', ctl?.text === 'a b c', JSON.stringify(ctl?.text));

// 레이트 제한
for (let i = 0; i < 25; i++) send(a, { v: PROTO, t: 'chat', name: '준', text: 'spam' + i });
await wait(600);
check('도배하면 error:rate 가 돌아옴', !!seen(a, m => m.t === 'error' && m.reason === 'rate'));
const spam = b.got.filter(m => m.t === 'chat' && m.text.startsWith('spam')).length;
check('도배가 전부 통과하지는 않음', spam < 25, `통과 ${spam}/25`);

// 늦게 들어온 사람은 history 를 받는다
const c = await open('C');
await wait(400);
const helloC = seen(c, m => m.t === 'hello');
check('C: 늦게 들어와도 history 받음', (helloC?.history?.length || 0) > 0, `${helloC?.history?.length}줄`);
check('C: history 가 50줄 상한을 지킴', (helloC?.history?.length || 0) <= 50);

// 나가면 알린다.
// 앞에서도 presence:2 가 오갔으므로, 닫은 뒤에 온 것만 봐야 의미가 있다.
let mark = a.got.length;
b.close();
await wait(400);
check('B 퇴장 뒤 presence 가 다시 옴',
  a.got.slice(mark).some(m => m.t === 'presence' && m.count === 2));
check('이름 없이 나간 사람은 퇴장 문구가 안 뜸',
  !a.got.slice(mark).some(m => m.t === 'system'));

// 한 번이라도 말한 사람은 나갈 때 이름이 불린다
const d = await open('D');
send(d, { v: PROTO, t: 'chat', name: '친구', text: '왔다' });
await wait(300);
mark = a.got.length;
d.close();
await wait(400);
const bye = a.got.slice(mark).find(m => m.t === 'system');
check('말한 사람이 나가면 이름이 불림', bye?.text === '친구 님이 나갔습니다.', JSON.stringify(bye?.text));

/* ---------- 대화 지우기 ---------- */
const w1 = await open('W1');
const w2 = await open('W2');
await wait(300);
send(w1, { v: PROTO, t: 'chat', name: '준', text: '지우기전' });
await wait(300);
check('지우기 전에는 보인다', !!seen(w2, m => m.t === 'chat' && m.text === '지우기전'));

let mk = w2.got.length;
send(w1, { v: PROTO, t: 'clear', name: '준' });
await wait(400);
const cleared = w2.got.slice(mk).find(m => m.t === 'cleared');
check('지우면 방 전체에 알린다', !!cleared);
check('누가 지웠는지 알려 준다', cleared?.name === '준', JSON.stringify(cleared?.name));

const after = await open('AFTER');
await wait(400);
check('지운 뒤 들어온 사람은 아무것도 못 받는다',
  (seen(after, m => m.t === 'hello')?.history || []).length === 0);

// 지운 뒤에도 방은 계속 쓸 수 있어야 한다
send(w1, { v: PROTO, t: 'chat', name: '준', text: '지운뒤' });
await wait(300);
check('지운 뒤에도 대화가 이어진다', !!seen(after, m => m.t === 'chat' && m.text === '지운뒤'));
w1.close(); w2.close(); after.close();

/* ---------- 나이 제한 ---------- */
const TTL = Number(process.env.HISTORY_TTL_MS);
if (TTL > 0) {
  const t1 = await open('T1');
  await wait(300);
  send(t1, { v: PROTO, t: 'chat', name: '준', text: '늙을줄' });
  await wait(300);

  const early = await open('T-EARLY');
  await wait(300);
  check('나이가 안 찼으면 넘겨준다',
    (seen(early, m => m.t === 'hello')?.history || []).some(l => l.text === '늙을줄'));
  early.close();

  await wait(TTL + 400);
  const late = await open('T-LATE');
  await wait(300);
  check('나이가 찬 줄은 안 넘긴다',
    !(seen(late, m => m.t === 'hello')?.history || []).some(l => l.text === '늙을줄'));

  // 늙은 줄은 다음 쓰기에서 저장소에서도 떨어져 나간다
  send(t1, { v: PROTO, t: 'chat', name: '준', text: '새줄' });
  await wait(400);
  const fresh = await open('T-FRESH');
  await wait(300);
  const h = seen(fresh, m => m.t === 'hello')?.history || [];
  check('새 줄만 남는다', h.length === 1 && h[0].text === '새줄', h.length + '줄');
  t1.close(); late.close(); fresh.close();
} else {
  log.push('(HISTORY_TTL_MS 를 주지 않아 나이 제한 검사는 건너뜀)');
}

a.close(); c.close();
await wait(200);

console.log(log.slice(0, 8).join('\n'));
console.log('\n통과 ' + ok.length + ' / 실패 ' + fail.length);
ok.forEach(s => console.log('  OK   ' + s));
fail.forEach(s => console.log('  FAIL ' + s));
process.exit(fail.length ? 1 : 0);
