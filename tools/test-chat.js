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

/* 저장소의 config.js 는 HOST 가 비어 있다(그게 기본값이다).
   파일을 고치지 않고, 내려가는 길에만 주소를 끼워 넣는다. */
async function withParty(page) {
  await page.route('**/js/config.js', async route => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/HOST:\s*''/, "HOST: '" + PARTY + "'");
    await route.fulfill({ response: res, body });
  });
}

async function newTab(browser, patched) {
  const page = await browser.newPage();

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

  if (patched) await withParty(page);
  await page.goto(GAME);
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
  const plain = await newTab(browser, false);
  check('HOST 가 비면 확성기 탭이 안 보인다', await plain.isHidden('#chat-tab'));
  check('HOST 가 비어도 게임은 시작된다', await plain.isVisible('#btn-start'));
  await plain.keyboard.press('KeyC');
  await plain.waitForTimeout(200);
  check('HOST 가 비면 C 를 눌러도 창이 안 열린다', await plain.isHidden('#chat'));
  await plain.close();

  /* ---------- 2. 주소가 있으면 켜진다 ---------- */
  const a = await newTab(browser, true);
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
  const b = await newTab(browser, true);
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

  /* ---------- 8. 끊겼다 다시 붙는다 ---------- */
  await a.keyboard.press('KeyC');
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
