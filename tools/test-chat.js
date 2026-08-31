/* =========================================================
   test-chat.js — 확성기(실시간 채팅) 검증

   실제 크로미움 탭 두 개를 띄워 서로 말을 걸게 한다.
   서버는 로컬 워커를 그대로 쓴다 — 프로토콜을 흉내 내면 검증이 아니다.

   먼저 두 가지를 띄워 놓고 실행한다:
     cd server && npx wrangler dev          (127.0.0.1:8787)
     python3 -m http.server 3000            (저장소 뿌리에서)

     node tools/test-chat.js

   주소를 바꾸려면 GAME · PARTY 환경변수를 준다.

   여기서 제일 중요한 검사는 채팅이 오가는지가 아니라
   "입력칸에 wasd 를 치는 동안 캐릭터가 움직이지 않는지"다.
   채팅을 게임에 붙일 때 반드시 한 번은 터지는 곳이고,
   터져도 조용해서 한참 뒤에나 알아차리게 된다.
   ========================================================= */

const { chromium } = require('playwright');

const GAME  = process.env.GAME  || 'http://127.0.0.1:3000/index.html';
const PARTY = process.env.PARTY || 'http://127.0.0.1:8787';

const ok = [], bad = [];
const check = (name, cond, extra) => {
  (cond ? ok : bad).push(name + (extra ? ' — ' + extra : ''));
};

/* config.js 의 NET.HOST 를 내려가는 길에만 갈아 끼운다. 파일은 건드리지 않는다.
   실제 배포 주소가 박혀 있어도 검사는 로컬 워커를 보게 하고,
   빈 문자열을 넣으면 "서버 주소가 없을 때"를 그대로 재현할 수 있다.
   끝의 쉼표까지 보는 이유는 위 주석에 있는 예시 문장이 먼저 걸리기 때문이다. */
async function withHost(page, host) {
  await page.route('**/js/config.js', async route => {
    const res = await route.fetch();
    const body = (await res.text())
      .replace(/(HOST:\s*)'[^']*'(\s*,)/, "$1'" + host + "'$2");
    await route.fulfill({ response: res, body });
  });
}

async function newTab(browser, host, opt) {
  opt = opt || {};
  const page = await browser.newPage();

  /* 링크를 타고 들어온 사람을 흉내 내려면 페이지가 뜨기 전에 저장값이 있어야 한다 */
  if (opt.saved) {
    await page.addInitScript(v => {
      try { localStorage.setItem('jaetbul.chat.v1', v); } catch (e) {}
    }, JSON.stringify(opt.saved));
  }

  /* 자바스크립트가 터진 것은 무조건 실패다. */
  page.on('pageerror', e => bad.push('페이지 예외: ' + e.message));

  /* 자원을 못 받은 것은 우리 것일 때만 실패로 친다.
     구글 폰트처럼 바깥에서 오는 것은 망이 막힌 곳에서 늘 실패하는데,
     그걸로 검사가 빨개지면 진짜 고장을 못 알아보게 된다.
     (favicon 도 마찬가지 — 정적 서버가 404 를 준다) */
  const ours = url => url.startsWith(new URL(GAME).origin) && !url.endsWith('/favicon.ico');
  page.on('requestfailed', r => {
    if (ours(r.url())) bad.push('자원 실패: ' + r.url() + ' — ' + (r.failure() || {}).errorText);
  });
  page.on('response', r => {
    if (r.status() >= 400 && ours(r.url())) bad.push('자원 ' + r.status() + ': ' + r.url());
  });

  await withHost(page, host);
  await page.goto(GAME + (opt.hash || ''));
  await page.waitForTimeout(700);
  return page;
}

const joined = page => page.waitForFunction(
  () => typeof Net !== 'undefined' && Net.status === 'open', null, { timeout: 8000 });

(async () => {
  /* 크로미움을 따로 깔아 둔 환경(CI·컨테이너)에서는 CHROME 로 경로를 준다.
     비워 두면 playwright 가 스스로 받은 것을 쓴다. */
  const browser = await chromium.launch(
    process.env.CHROME
      ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] }
      : {});

  /* ---------- 1. 서버 주소가 없으면 없는 기능이어야 한다 ---------- */
  const plain = await newTab(browser, '');          // 서버 주소가 없는 판
  check('HOST 가 비면 확성기 탭이 안 보인다', await plain.isHidden('#chat-tab'));
  check('HOST 가 비어도 게임은 시작된다', await plain.isVisible('#btn-start'));
  await plain.keyboard.press('KeyC');
  await plain.waitForTimeout(200);
  check('HOST 가 비면 C 를 눌러도 창이 안 열린다', await plain.isHidden('#chat'));
  await plain.close();

  /* ---------- 2. 주소가 있으면 켜진다 ---------- */
  const a = await newTab(browser, PARTY);
  check('확성기 탭이 보인다', await a.isVisible('#chat-tab'));

  await a.keyboard.press('KeyC');
  await a.waitForTimeout(200);
  check('C 키로 창이 열린다', await a.isVisible('#chat'));

  const room = 'test-' + Math.random().toString(36).slice(2, 7);
  await a.fill('#chat-name', '준');
  await a.fill('#chat-room', room);
  await a.click('#chat-enter');
  await joined(a).then(() => check('A: 방에 붙었다', true))
                 .catch(() => check('A: 방에 붙었다', false, '연결 실패'));

  /* ---------- 3. 둘이 주고받는다 ---------- */
  const b = await newTab(browser, PARTY);
  await b.keyboard.press('KeyC');
  await b.fill('#chat-name', '친구');
  await b.fill('#chat-room', room);
  await b.click('#chat-enter');
  await joined(b).then(() => check('B: 같은 방에 붙었다', true))
                 .catch(() => check('B: 같은 방에 붙었다', false, '연결 실패'));

  await a.fill('#chat-text', '들리냐');
  await a.press('#chat-text', 'Enter');
  await b.waitForTimeout(600);

  const seenByB = await b.textContent('#chat-lines');
  check('B 가 A 의 말을 받는다', seenByB.includes('들리냐'));
  check('보낸 뒤 입력칸이 비워진다', (await a.inputValue('#chat-text')) === '');

  const mine = await a.$$eval('#chat-line-probe, .chat-line.mine', els => els.length);
  check('내 말은 내 것으로 표시된다', mine > 0, mine + '줄');

  /* ---------- 4. 남이 보낸 글자는 글자일 뿐이다 ---------- */
  const nasty = '<img src=x onerror="window.__pwned=1">';
  await b.fill('#chat-text', nasty);
  await b.press('#chat-text', 'Enter');
  await a.waitForTimeout(600);

  check('스크립트가 실행되지 않는다', (await a.evaluate(() => window.__pwned)) === undefined);
  check('꺾쇠가 글자 그대로 보인다', (await a.textContent('#chat-lines')).includes(nasty));
  check('태그가 진짜 요소로 들어가지 않는다',
    (await a.$$eval('#chat-lines img', els => els.length)) === 0);

  /* ---------- 5. 한글 조합 중의 Enter 는 보내는 것이 아니다 ---------- */
  await a.fill('#chat-text', '안녕');
  await a.evaluate(() => {
    // IME 가 글자를 고르는 Enter. keyCode 229 로 온다.
    document.getElementById('chat-text').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
  });
  await a.waitForTimeout(300);
  check('조합 중 Enter 로는 안 나간다', (await a.inputValue('#chat-text')) === '안녕');
  check('조합 중 Enter 가 상대에게 안 갔다',
    !(await b.textContent('#chat-lines')).includes('안녕'));

  // 조합이 끝난 뒤의 Enter 는 보낸다
  await a.press('#chat-text', 'Enter');
  await b.waitForTimeout(500);
  check('조합이 끝나면 보내진다', (await b.textContent('#chat-lines')).includes('안녕'));

  /* ---------- 6. 핵심 — 치는 동안 캐릭터가 움직이면 안 된다 ---------- */
  await a.click('#chat-close');
  await a.click('#btn-start');
  await a.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await a.waitForTimeout(300);

  await a.keyboard.press('KeyC');
  await a.waitForTimeout(200);
  await a.click('#chat-text');

  const before = await a.evaluate(() => ({
    x: state.player.x, y: state.player.y,
    potions: state.potions, ember: state.emberWide, floor: state.floor,
  }));

  // 게임 조작과 정면으로 겹치는 글자들만 골라 친다
  await a.keyboard.type('wasd1fk');
  await a.waitForTimeout(400);

  const after = await a.evaluate(() => ({
    x: state.player.x, y: state.player.y,
    potions: state.potions, ember: state.emberWide, floor: state.floor,
  }));

  check('치는 동안 캐릭터가 안 움직인다',
    before.x === after.x && before.y === after.y,
    `(${before.x},${before.y}) -> (${after.x},${after.y})`);
  check('치는 동안 물약을 안 마신다', before.potions === after.potions,
    before.potions + ' -> ' + after.potions);
  check('치는 동안 불씨가 안 바뀐다', before.ember === after.ember);
  check('친 글자가 입력칸에 그대로 들어갔다',
    (await a.inputValue('#chat-text')) === 'wasd1fk');

  /* ---------- 7. 창을 닫으면 게임 키가 돌아온다 ---------- */
  await a.fill('#chat-text', '');
  await a.click('#chat-close');
  await a.waitForTimeout(200);
  check('창이 닫힌다', await a.isHidden('#chat'));

  const moved = await a.evaluate(async () => {
    const p0 = { x: state.player.x, y: state.player.y };
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      if (state.player.x !== p0.x || state.player.y !== p0.y) return true;
    }
    return false;
  });
  check('닫은 뒤에는 방향키가 다시 먹는다', moved);

  /* ---------- 8. 링크 하나가 곧 초대장이다 ---------- */
  await a.keyboard.press('KeyC');        // 7번에서 닫아 두었다
  await a.waitForTimeout(200);

  // 방 이름은 추측할 수 없어야 한다. 링크로 건네므로 길어도 상관없다.
  const rooms = await a.evaluate(() =>
    Array.from({ length: 20 }, () => Chat.newRoom()));
  check('새 방 이름이 단어+무작위 8글자', rooms.every(r => /^[a-z]+-[a-z0-9]{8}$/.test(r)),
    rooms[0]);
  check('스무 번 만들어도 겹치지 않는다', new Set(rooms).size === 20);
  check('헷갈리는 l·1·o·0 을 쓰지 않는다',
    rooms.every(r => !/[l1o0]/.test(r.split('-')[1])));

  // 들어가면 주소창이 곧 초대장이 된다
  check('방에 들어가면 해시가 붙는다', (await a.evaluate(() => location.hash)) === '#r=' + room,
    await a.evaluate(() => location.hash));
  check('링크가 해시까지 포함해 만들어진다',
    (await a.evaluate(() => Chat.link())).endsWith('#r=' + room));

  // 링크 복사
  await a.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await a.click('#chat-copy');
  await a.waitForTimeout(400);
  const clip = await a.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check('링크 복사 버튼이 주소를 클립보드에 넣는다', clip.endsWith('#r=' + room), clip);

  // 링크를 받은 사람 — 별명이 있으면 바로 들어간다
  const inv = await newTab(browser, PARTY,
    { hash: '#r=' + room, saved: { name: '초대받은이', room: 'somewhere-else', joined: false } });
  let invOk = true;
  await joined(inv).catch(() => { invOk = false; });
  check('링크로 들어오면 그 방에 자동 입장', invOk,
    '상태=' + await inv.evaluate(() => Net.status));
  check('저장된 방이 아니라 링크의 방으로 간다',
    (await inv.evaluate(() => Net.room)) === room,
    await inv.evaluate(() => Net.room));

  await a.fill('#chat-text', '초대 확인');
  await a.press('#chat-text', 'Enter');
  await inv.waitForTimeout(700);
  check('링크로 들어온 사람에게 말이 닿는다',
    (await inv.textContent('#chat-lines')).includes('초대 확인'));
  await inv.close();

  // 별명이 없으면 함부로 넣지 않는다
  const shy = await newTab(browser, PARTY, { hash: '#r=' + room });
  await shy.waitForTimeout(900);
  check('별명이 없으면 링크만으로 입장하지 않는다',
    (await shy.evaluate(() => Net.status)) === 'off',
    await shy.evaluate(() => Net.status));
  check('대신 창을 열고 방을 채워 둔다',
    (await shy.isVisible('#chat')) && (await shy.inputValue('#chat-room')) === room);
  await shy.close();

  /* ---------- 9. 끊겼다 다시 붙는다 ---------- */
  await a.evaluate(() => Net.ws && Net.ws.close());   // 서버가 끊은 것처럼
  await a.waitForTimeout(300);
  await joined(a).then(() => check('끊기면 스스로 다시 붙는다', true))
                 .catch(() => check('끊기면 스스로 다시 붙는다', false, '재접속 실패'));

  await browser.close();

  console.log('\n통과 ' + ok.length + ' / 실패 ' + bad.length);
  ok.forEach(s => console.log('  OK   ' + s));
  bad.forEach(s => console.log('  FAIL ' + s));
  process.exit(bad.length ? 1 : 0);
})();
