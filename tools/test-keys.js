/* 잿불 — 키 입력 검증

   함수를 직접 불러서 되는 것과, 실제로 키를 눌러서 되는 것은 다르다.
   모디파이어(Z·X)는 눌린 채로 방향키를 받거나, 방향 없이 떼이거나,
   두 경우가 갈리는 곳이라 여기서만 확인할 수 있는 실수가 난다. */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(GAME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  // 기본 캐릭터(기사)는 원거리가 없다 — Z 검사는 리자드로 돈다
  await page.evaluate(() => { chooseHero('lizard'); startRun(); UI.closeIntro(); });
  // running 은 연출이 닫힌 뒤에야 true 가 된다
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  const setup = await page.evaluate(() => {
    const m = state.map, cx = 20, cy = 12;
    for (let y = cy - 6; y <= cy + 6; y++)
      for (let x = cx - 9; x <= cx + 9; x++) m.tiles[y][x] = T.FLOOR;
    state.player.x = cx; state.player.y = cy; state.player.rx = cx; state.player.ry = cy;
    state.memories = new Set(['throw']);
    state.fovRadius = 12;
    state.monsters.length = 0;
    const mon = makeMonster(MONSTERS[5], cx + 3, cy + 2);   // 대각선
    state.monsters.push(mon);
    refreshFov();
    return { hp: mon.hp, turns: state.turns };
  });

  await page.keyboard.press('KeyZ');            // 방향 없이 Z
  await page.waitForTimeout(300);
  const afterZ = await page.evaluate(() => ({ hp: state.monsters[0].hp, turns: state.turns }));
  check(afterZ.hp < setup.hp, `Z 한 번으로 대각선의 것을 맞힘 (${setup.hp} → ${afterZ.hp})`);
  check(afterZ.turns > setup.turns, '턴이 지나감');

  // Z + 방향은 그대로 움직임이 아니라 원거리여야 한다
  // (직전 검사에서 쐈으므로 재사용 간격을 풀어 준다 — 리듬은 test-classes 가 본다)
  const before2 = await page.evaluate(() => { state.rangedCd = 0; return { hp: state.monsters[0].hp, x: state.player.x }; });
  await page.keyboard.down('KeyZ');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('KeyZ');
  await page.waitForTimeout(300);
  const after2 = await page.evaluate(() => ({ hp: state.monsters[0].hp, x: state.player.x }));
  check(after2.hp < before2.hp, `Z + 방향도 던짐 (${before2.hp} → ${after2.hp})`);
  check(after2.x === before2.x, 'Z + 방향으로 움직이지는 않음');

  // 겨눌 것이 없으면 턴을 안 쓴다
  const none = await page.evaluate(() => {
    state.monsters.length = 0; refreshFov();
    const t = state.turns;
    return { t };
  });
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(250);
  const after3 = await page.evaluate(() => state.turns);
  check(after3 === none.t, '겨눌 것이 없으면 턴을 쓰지 않음');

  // X + 방향은 여전히 "공격 안 하고 이동"
  const px = await page.evaluate(() => {
    const m = state.map;
    m.tiles[state.player.y][state.player.x + 1] = T.FLOOR;
    return state.player.x;
  });
  await page.keyboard.down('KeyX');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('KeyX');
  await page.waitForTimeout(300);
  const moved = await page.evaluate(() => state.player.x);
  check(moved === px + 1, `X + 방향은 그대로 이동 (${px} → ${moved})`);

  console.log('\n에러:', errs.length ? errs.join('\n') : '없음');
  if (errs.length) fails++;
  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
