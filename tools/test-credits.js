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

  console.log('\n[ 누르고 있으면 빨리 감긴다 ]');
  // 같은 시간 동안 얼마나 흘렀는지를 잰다 — 건너뛰는 게 아니라 빨라지는 것이어야 한다
  const pos = () => p.evaluate(() => UI._creditPos);
  const a0 = await pos();
  await p.waitForTimeout(700);
  const a1 = await pos();
  const slow = a1 - a0;

  await p.keyboard.down('Space');
  const b0 = await pos();
  await p.waitForTimeout(700);
  const b1 = await pos();
  await p.keyboard.up('Space');
  const fast = b1 - b0;

  check(fast > slow * 3, `누르면 눈에 띄게 빨라진다 (${slow.toFixed(0)}px → ${fast.toFixed(0)}px / 0.7초)`);
  check(await p.evaluate(() => UI.creditsRolling()), '그래도 계속 흐른다 — 끝으로 건너뛰지 않는다');

  await p.waitForTimeout(400);
  const released = await pos();
  await p.waitForTimeout(700);
  const backToSlow = (await pos()) - released;
  check(backToSlow < fast / 2, `손을 떼면 다시 제 속도 (${backToSlow.toFixed(0)}px / 0.7초)`);

  console.log('\n[ 다 흐르면 닫을 수 있다 ]');
  // 끝까지 감아 놓고 본다
  await p.evaluate(() => { UI._creditPos = UI._creditDist - 1; });
  await p.waitForTimeout(400);
  const done = await p.evaluate(() => ({
    open: UI.creditsOpen(), rolling: UI.creditsRolling(),
    closeShown: !document.getElementById('credits-close').classList.contains('hidden'),
  }));
  check(done.open && !done.rolling, '끝까지 흐르면 멈춘다');
  check(done.closeShown, '그때 돌아갈 단추가 나온다');

  await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  check(await p.evaluate(() => !UI.creditsOpen()), '그다음 누르면 닫힌다');

  console.log('\n[ 결말 뒤에 흐른다 ]');
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const ended = await p.evaluate(async () => {
    // 옥상까지 올라가 주인을 쓰러뜨린 상태를 만든다
    enterFloor(CFG.TOP_FLOOR);
    UI.closeIntro();
    state.boss.hp = 0; kill(state.boss);
    await new Promise(r => setTimeout(r, 1400));
    // 결말 앞에 되짚기가 흐른다 (순서는 test-story 가 본다) — 여기서는 넘긴다
    if (Story.open()) Story.finish();
    await new Promise(r => setTimeout(r, 200));
    const endingUp = UI.endingOpen();
    chooseEnding('leave');
    await new Promise(r => setTimeout(r, 2400));
    if (Story.open()) Story.finish();      // 고른 뒤의 마지막 장면도
    await new Promise(r => setTimeout(r, 200));
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

  console.log('\n[ 끝낸 판은 로비로 나간다 ]');
  const btn = await p.evaluate(() => ({
    label: document.getElementById('btn-retry').textContent,
    toLobby: UI.resultToLobby(),
  }));
  check(/로비/.test(btn.label), `단추가 로비로 간다고 말한다 (${btn.label})`);
  check(btn.toLobby, '결말을 본 판이라고 표시되어 있다');

  await p.click('#btn-retry');
  await p.waitForTimeout(400);
  const lobby = await p.evaluate(() => ({
    title: !document.getElementById('title-screen').classList.contains('hidden'),
    result: !document.getElementById('result-screen').classList.contains('hidden'),
    running: state.running,
    saved: !!savedRun(),
    resumeShown: !document.getElementById('btn-resume').classList.contains('hidden'),
  }));
  check(lobby.title && !lobby.result, '첫 화면으로 나간다 (판을 새로 시작하지 않는다)');
  check(!lobby.running, '판이 돌고 있지 않다');
  check(!lobby.saved && !lobby.resumeShown,
        '끝난 판은 이어하기로 남지 않는다 — 이미 끝난 곳으로 돌아가는 문을 만들지 않는다');

  console.log('\n[ 쓰러진 판은 그대로 다시 오른다 ]');
  const dead = await p.evaluate(async () => {
    startRun();
    UI.closeIntro();
    state.player.hp = 0; kill(state.player);
    await new Promise(r => setTimeout(r, 900));
    return {
      label: document.getElementById('btn-retry').textContent,
      toLobby: UI.resultToLobby(),
      up: !document.getElementById('result-screen').classList.contains('hidden'),
    };
  });
  check(dead.up, '쓰러지면 결과표가 뜬다');
  check(!dead.toLobby && /다시 오른다/.test(dead.label),
        `그때는 단추가 그대로다 (${dead.label})`);

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
