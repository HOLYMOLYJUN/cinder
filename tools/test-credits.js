/* =========================================================
   test-credits.js — 크레딧

   결말을 고르면 이름이 흐르고, 그다음에 결과표가 온다.
   순서가 뒤집히거나 크레딧에서 못 빠져나오면 판을 끝낸 사람이 갇힌다.
   ========================================================= */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 780 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);

  console.log('\n[ 타이틀에서 열어 본다 ]');
  await p.click('#btn-credits');
  await p.waitForTimeout(400);
  const open = await p.evaluate(() => ({
    open: UI.creditsOpen(), rolling: UI.creditsRolling(),
    text: document.getElementById('credits-roll').textContent,
    closeHidden: document.getElementById('credits-close').classList.contains('hidden'),
  }));
  check(open.open && open.rolling, '크레딧이 뜨고 흐르기 시작한다');
  check(open.closeHidden, '흐르는 동안에는 닫기 단추가 없다');

  const roles = (open.text.match(/Lee Sangjun/g) || []).length;
  check(roles >= 10, `모든 자리에 같은 이름 (${roles}번)`);
  check(/GAME DESIGN|Game Design/i.test(open.text), '직함이 영어');
  check(/0x72/.test(open.text) && /CC0/.test(open.text), '빌려 쓴 그림의 출처를 적는다');
  check(/Web Audio/.test(open.text), '소리를 어떻게 만들었는지도');

  console.log('\n[ 건너뛰고 닫는다 ]');
  await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  const skipped = await p.evaluate(() => ({
    open: UI.creditsOpen(), rolling: UI.creditsRolling(),
    closeShown: !document.getElementById('credits-close').classList.contains('hidden'),
  }));
  check(skipped.open && !skipped.rolling, '한 번 누르면 끝으로 건너뛴다 (아직 닫히지는 않는다)');
  check(skipped.closeShown, '그때 돌아갈 단추가 나온다');

  await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  check(await p.evaluate(() => !UI.creditsOpen()), '한 번 더 누르면 닫힌다');

  console.log('\n[ 결말 뒤에 흐른다 ]');
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const ended = await p.evaluate(async () => {
    // 옥상까지 올라가 주인을 쓰러뜨린 상태를 만든다
    enterFloor(CFG.TOP_FLOOR);
    UI.closeIntro();
    state.boss.hp = 0; kill(state.boss);
    await new Promise(r => setTimeout(r, 1400));
    const endingUp = UI.endingOpen();
    chooseEnding('leave');
    await new Promise(r => setTimeout(r, 2400));
    return {
      endingUp,
      credits: UI.creditsOpen(),
      // 크레딧이 흐르는 동안에는 결과표가 아직 나오면 안 된다
      resultUp: !document.getElementById('result-screen').classList.contains('hidden'),
    };
  });
  check(ended.endingUp, '주인이 무너지면 결말을 고른다');
  check(ended.credits, '고르고 나면 크레딧이 흐른다');
  check(!ended.resultUp, '크레딧 먼저 — 결과표(숫자)는 아직이다');

  const after = await p.evaluate(async () => {
    UI.endCredits();
    UI.hideCredits();
    await new Promise(r => setTimeout(r, 200));
    return {
      credits: UI.creditsOpen(),
      resultUp: !document.getElementById('result-screen').classList.contains('hidden'),
      title: document.getElementById('result-title').textContent,
    };
  });
  check(!after.credits && after.resultUp, `크레딧이 끝나면 결과표가 온다 (${after.title})`);
  check(/불을 든 채로/.test(after.title), '고른 결말의 결과표가 맞다');

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
