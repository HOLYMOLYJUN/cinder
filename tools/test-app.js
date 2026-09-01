/* =========================================================
   test-app.js — 앱 빌드와 뒤로가기

   안드로이드 없이 본다. 뒤로가기를 History 로 다루기로 한 덕에
   브라우저에서 `history.back()` 을 부르면 폰에서 버튼을 누른 것과 같은 길로 간다.
   폰에 올려 봐야 아는 코드를 만들지 않으려고 그렇게 짰다.

   먼저 정적 서버를 띄우고 실행한다 (저장소 뿌리에서):
     python3 -m http.server 3000
     node build.js --app
     node tools/test-app.js
   ========================================================= */

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const APP  = BASE + '/dist/app/index.html';
const WEB  = BASE + '/index.html';

const ok = [], bad = [];
const check = (name, cond, extra) => { (cond ? ok : bad).push(name + (extra ? ' — ' + extra : '')); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// 폰의 뒤로가기 버튼. 웹뷰에서는 곧 히스토리 뒤로다.
const back = async p => { await p.evaluate(() => history.back()); await wait(250); };

(async () => {
  const browser = await chromium.launch(
    process.env.CHROME
      ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] }
      : {});

  const open = async url => {
    const p = await browser.newPage({ viewport: { width: 412, height: 892 } });  // 폰 크기
    p.on('pageerror', e => bad.push('페이지 예외: ' + e.message));
    await p.goto(url);
    await p.waitForTimeout(900);
    return p;
  };

  /* ---------- 1. 앱 빌드가 온전한 문서인가 ---------- */
  const app = await open(APP);

  check('앱 빌드가 혼자 열린다', await app.isVisible('#title-screen'));
  check('viewport-fit=cover 가 있다',
    (await app.getAttribute('meta[name=viewport]', 'content')).includes('viewport-fit=cover'));

  const flags = await app.evaluate(() => ({ host: NET.HOST, chat: NET.CHAT, marks: Marks.on() }));
  check('앱 빌드는 확성기가 꺼져 있다', flags.chat === false, 'CHAT=' + flags.chat);
  check('앱 빌드도 서버 주소는 살아 있다', !!flags.host);
  check('흔적은 그대로 켜져 있다', flags.marks === true, 'Marks.on()=' + flags.marks);
  check('확성기 단추가 안 보인다', await app.isHidden('#chat-tab'));
  check('C 를 눌러도 창이 안 열린다', await (async () => {
    await app.keyboard.press('KeyC'); await wait(200);
    return app.isHidden('#chat');
  })());

  // 채팅이 없으면 별명을 넣을 자리도 없다 → 흔적에 붙는 이름이 사람 글자가 아니다
  check('흔적에 붙는 이름이 사람이 쓴 글자가 아니다',
    (await app.evaluate(() => Marks.who())) === '누군가');

  /* ---------- 2. 웹 빌드는 그대로인가 ---------- */
  const web = await open(WEB);
  check('웹 빌드는 확성기가 그대로 있다', await web.isVisible('#chat-tab'));
  await web.close();

  /* ---------- 3. 뒤로가기 ---------- */

  // 타이틀에서는 나간다. 브라우저에는 나갈 데가 없으니 exit() 가 불렸는지로 본다.
  /* 나가는 것만 세도록 바꿔 끼운다. 다만 가짜 페이지는 진짜 exit() 처럼 다시 깔아야 한다 —
     안 그러면 다음 뒤로가기가 문서 자체를 벗어나 페이지가 통째로 사라진다. */
  await app.evaluate(() => {
    window.__exits = 0;
    Shell.exit = () => { window.__exits++; Shell.push(); };
  });
  await back(app);
  check('타이틀에서 뒤로가기는 앱을 나간다',
    (await app.evaluate(() => window.__exits)) === 1);

  // 판을 시작한다
  await app.click('#btn-start');
  await app.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await wait(400);

  // 도감이 열려 있으면 그것부터 닫는다
  await app.evaluate(() => UI.showCodex('keys'));
  await wait(200);
  await back(app);
  check('도감이 열려 있으면 도감부터 닫는다', await app.isHidden('#codex-screen'));
  check('그때는 앱이 안 나간다', (await app.evaluate(() => window.__exits)) === 1);

  // 상점
  await app.evaluate(() => UI.showShop([], 0, state.player, () => {}));
  await wait(200);
  await back(app);
  check('상점이 열려 있으면 상점을 닫는다', await app.isHidden('#shop-modal'));

  /* 모닥불은 닫는 길이 없는 것이 의도다. 불 앞에서 아무것도 안 하고
     지나갈 수 있으면 그건 선택이 아니라 무시해도 되는 창이 된다. */
  await app.evaluate(() => UI.showCamp(
    [{ name: '쉰다' }, { name: '태운다' }, { name: '남긴다' }], () => {}, '', '모닥불'));
  await wait(200);
  await back(app);
  check('모닥불은 뒤로가기로 안 닫힌다', await app.isVisible('#camp-modal'));
  check('그렇다고 앱이 나가지도 않는다', (await app.evaluate(() => window.__exits)) === 1);
  await app.evaluate(() => UI.hideCamp());
  await wait(200);

  /* 판을 하는 중이면 한 번에 안 나간다 — 실수로 한 번 눌러서 닫히면 사고다 */
  await back(app);
  check('판 중에 한 번 누르면 안 나간다', (await app.evaluate(() => window.__exits)) === 1);
  check('대신 한 번 더 누르라고 알린다',
    (await app.evaluate(() => document.body.innerText)).includes('한 번 더'));

  await back(app);
  check('곧바로 한 번 더 누르면 나간다', (await app.evaluate(() => window.__exits)) === 2);

  // 시간이 지나면 다시 처음부터
  await app.evaluate(() => { Shell.lastBack = 0; });
  await back(app);
  check('한참 뒤에 누르면 다시 한 번 더 물어본다',
    (await app.evaluate(() => window.__exits)) === 2);

  /* ---------- 4. 노치 여백은 앱에서만 ---------- */
  const padWeb = await app.evaluate(() => getComputedStyle(document.getElementById('app')).paddingTop);
  check('브라우저에서는 여백을 안 준다', padWeb === '0px', padWeb);

  await app.evaluate(() => document.documentElement.classList.add('in-app'));
  await wait(100);
  const rules = await app.evaluate(() => {
    // safe-area 값은 브라우저에서 0 이라 계산값으로는 못 본다. 규칙이 있는지를 본다.
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch (e) { continue; }
      for (const r of list) {
        if (r.selectorText === '.in-app #app' && /safe-area-inset/.test(r.style.padding || r.cssText)) return true;
      }
    }
    return false;
  });
  check('앱에서는 노치를 피하는 규칙이 걸려 있다', rules);
  check('길게 눌러도 글자가 안 잡힌다',
    (await app.evaluate(() => getComputedStyle(document.getElementById('view')).userSelect)) === 'none');

  await browser.close();
  console.log('\n통과 ' + ok.length + ' / 실패 ' + bad.length);
  ok.forEach(s => console.log('  OK   ' + s));
  bad.forEach(s => console.log('  FAIL ' + s));
  process.exit(bad.length ? 1 : 0);
})();
