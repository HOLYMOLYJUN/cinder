/* 잿불 — 보스 검증

   가장 중요한 명제 하나를 확인한다:
   "예고된 칸을 벗어나면 맞지 않는다."
   피할 방법이 없는 기술은 밸런싱 문제가 아니라 설계 실패이므로,
   회피가 실제로 동작하는지를 기술마다 직접 시험한다. */

const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
const SHOT = __dirname + '/shots';
require('fs').mkdirSync(SHOT, { recursive: true });

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

async function gotoFloor(page, n) {
  await page.evaluate((n) => { startRun(); enterFloor(n); }, n);
  await page.evaluate(() => UI.closeIntro());
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(GAME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);

  /* ---------- 1. 보스층에만 보스가 있고, 계단이 잠긴다 ---------- */
  console.log('\n[ 층 구성 ]');
  for (const f of [4, 5, 9, 10, 14, 15]) {
    await gotoFloor(page, f);
    const info = await page.evaluate(() => {
      const s = state.map.stairs;
      return {
        boss: state.boss ? state.boss.name : null,
        bossHp: state.boss ? state.boss.maxHp : 0,
        stairsTile: state.map.tiles[s.y][s.x],
        bossOnStairs: state.boss ? (state.boss.x === s.x && state.boss.y === s.y) : null,
        monsters: state.monsters.length,
      };
    });
    const shouldHaveBoss = [5, 10, 15].includes(f);
    check(!!info.boss === shouldHaveBoss,
      `${f}층 — ${info.boss ? info.boss + ' (체력 ' + info.bossHp + ')' : '보스 없음'}`);
    if (shouldHaveBoss) {
      check(info.stairsTile !== 2, `${f}층 계단이 잠겨 있음`);
      check(info.bossOnStairs, `${f}층 보스가 계단 자리를 지키고 있음`);
    }
  }

  /* ---------- 2. 예고를 보고 물러서면 피해진다 (문지기 · 근접 강타) ---------- */
  console.log('\n[ 문지기 — 주변 강타 ]');
  await gotoFloor(page, 5);

  const slamMiss = await page.evaluate(() => {
    const b = state.boss, p = state.player;
    // 보스 옆에 붙는다
    const spot = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => [b.x+dx, b.y+dy])
      .find(([x,y]) => isWalkable(state.map, x, y) && !monsterAt(x, y));
    p.x = spot[0]; p.y = spot[1]; p.rx = p.x; p.ry = p.y;
    p.hp = p.maxHp;

    b.charge = b.bossDef.interval - 1;
    bossTurn(b);                                   // 예고
    const marked = b.marks ? b.marks.length : 0;
    const wasInside = b.marks.some(([x,y]) => x === p.x && y === p.y);

    // 표시된 칸 밖으로 물러난다
    const away = [];
    for (let r = 2; r <= 5 && !away.length; r++)
      for (const [dx,dy] of [[r,0],[-r,0],[0,r],[0,-r]]) {
        const x = b.x+dx, y = b.y+dy;
        if (isWalkable(state.map, x, y) && !b.marks.some(([mx,my]) => mx===x && my===y)) {
          away.push([x, y]); break;
        }
      }
    if (away.length) { p.x = away[0][0]; p.y = away[0][1]; }
    const before = p.hp;
    bossTurn(b);                                   // 발동
    return { marked, wasInside, moved: !!away.length, before, after: p.hp };
  });
  check(slamMiss.marked > 0, `예고된 칸이 표시됨 (${slamMiss.marked}칸)`);
  check(slamMiss.wasInside, '보스 옆은 예고 범위 안');
  check(slamMiss.moved && slamMiss.after === slamMiss.before,
        `물러서니 맞지 않음 (체력 ${slamMiss.before} → ${slamMiss.after})`);

  const slamHit = await page.evaluate(() => {
    const b = state.boss, p = state.player;
    const spot = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => [b.x+dx, b.y+dy])
      .find(([x,y]) => isWalkable(state.map, x, y) && !monsterAt(x, y));
    p.x = spot[0]; p.y = spot[1]; p.hp = p.maxHp;
    b.charge = b.bossDef.interval - 1;
    bossTurn(b);
    const before = p.hp;
    bossTurn(b);                                   // 그 자리에 그대로 서 있는다
    return { before, after: p.hp };
  });
  check(slamHit.after < slamHit.before,
        `가만히 있으면 맞음 (체력 ${slamHit.before} → ${slamHit.after})`);

  // 연출 확인용 한 장 — 좌표를 직접 옮겼으므로 시야도 다시 계산해준다
  await page.evaluate(() => {
    const b = state.boss, p = state.player;
    const spot = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => [b.x+dx, b.y+dy])
      .find(([x,y]) => isWalkable(state.map, x, y) && !monsterAt(x, y));
    p.x = spot[0]; p.y = spot[1]; p.rx = p.x; p.ry = p.y;
    p.hp = p.maxHp;
    b.seen = true;
    refreshFov();
    UI.updateHud(state);
    b.charge = b.bossDef.interval - 1;
    bossTurn(b);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT + '/14-boss-telegraph.png' });

  /* ---------- 3. 이름을 가진 것 — 저주는 부른 자리에 떨어진다 ---------- */
  console.log('\n[ 이름을 가진 것 — 저주 ]');
  await gotoFloor(page, 10);
  const curse = await page.evaluate(() => {
    const b = state.boss, p = state.player;
    // 시선이 닿는 곳으로 옮긴다
    p.x = b.x; p.y = b.y;
    const spot = [[2,0],[-2,0],[0,2],[0,-2]]
      .map(([dx,dy]) => [b.x+dx, b.y+dy])
      .find(([x,y]) => isWalkable(state.map, x, y) && !monsterAt(x, y));
    p.x = spot[0]; p.y = spot[1]; p.hp = p.maxHp;

    b.charge = b.bossDef.interval - 1;
    bossTurn(b);
    const centered = b.marks.some(([x,y]) => x === p.x && y === p.y);

    // 부른 자리를 벗어난다
    const away = [];
    for (let r = 2; r <= 6 && !away.length; r++)
      for (const [dx,dy] of [[r,0],[-r,0],[0,r],[0,-r]]) {
        const x = p.x+dx, y = p.y+dy;
        if (isWalkable(state.map, x, y) && !b.marks.some(([mx,my]) => mx===x && my===y)) {
          away.push([x, y]); break;
        }
      }
    const before = p.hp;
    if (away.length) { p.x = away[0][0]; p.y = away[0][1]; }
    bossTurn(b);
    return { centered, moved: !!away.length, before, after: p.hp };
  });
  check(curse.centered, '저주가 예고 시점의 내 자리에 표시됨');
  check(curse.moved && curse.after === curse.before,
        `그 자리를 떠나니 빗나감 (체력 ${curse.before} → ${curse.after})`);

  /* ---------- 4. 보스를 잡으면 계단이 열린다 ---------- */
  console.log('\n[ 보스 격파 ]');
  await gotoFloor(page, 10);
  const opened = await page.evaluate(() => {
    const s = state.map.stairs;
    const beforeTile = state.map.tiles[s.y][s.x];
    state.boss.hp = 0;
    kill(state.boss);
    return { beforeTile, afterTile: state.map.tiles[s.y][s.x], bossAlive: state.boss.alive };
  });
  check(opened.beforeTile !== 2 && opened.afterTile === 2,
        '보스를 쓰러뜨리자 계단이 드러남');
  check(!opened.bossAlive, '보스가 죽은 상태로 기록됨');

  /* ---------- 5. 최종 보스와 결말 ---------- */
  console.log('\n[ 최종 보스와 결말 ]');
  await gotoFloor(page, 15);
  await page.evaluate(() => { state.boss.hp = 0; kill(state.boss); });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: SHOT + '/15-ending.png' });
  check(await page.isVisible('#ending-screen'), '결말 선택 화면이 뜸');

  const picks = await page.$$eval('.ending-pick b', els => els.map(e => e.textContent.trim()));
  check(picks.length === 2, '선택지 두 개: ' + picks.join(' / '));

  await page.click('[data-ending="leave"]');
  // 결과표는 바로 덮이지 않는다 — 선택창만 걷고 옥상을 1.9초 보여준 뒤,
  // 그다음 크레딧이 흐르고, 그것이 끝나야 숫자가 온다 (test-credits 가 그 순서를 본다)
  await page.waitForTimeout(2400);
  await page.evaluate(() => { UI.endCredits(); UI.hideCredits(); });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    resultVisible: !document.getElementById('result-screen').classList.contains('hidden'),
    title: document.getElementById('result-title').textContent,
    save: loadData(),
  }));
  check(after.resultVisible, '결말을 고르면 결과 화면으로: ' + after.title);
  check((after.save.endings || []).includes('leave'), '고른 결말이 저장됨');
  check(after.save.cleared === true, '클리어 기록이 남음');
  await page.screenshot({ path: SHOT + '/16-ending-result.png' });

  // 나머지 하나도
  await gotoFloor(page, 15);
  await page.evaluate(() => { state.boss.hp = 0; kill(state.boss); });
  await page.waitForTimeout(1500);
  await page.click('[data-ending="light"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { UI.endCredits(); UI.hideCredits(); });
  const both = await page.evaluate(() => (loadData().endings || []));
  check(both.length === 2, '두 결말 모두 기록됨: ' + both.join(', '));

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');
  if (errors.length) fails++;

  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
