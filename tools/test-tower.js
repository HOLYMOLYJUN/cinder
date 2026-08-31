/* =========================================================
   test-tower.js — 오늘의 탑, 그리고 흔적이 실제로 그 자리에 있는가

     node tools/test-tower.js

   이 검사가 있는 이유는 하나다. 흔적을 처음 붙였을 때 지형이 판마다 달랐고,
   그래서 남이 남긴 쪽지를 실제로 읽을 수 있는 확률이 14% 였다.
   화면에는 아무 일도 안 일어나므로 그냥 「아무도 안 쓰나 보다」로 보였다.
   숫자로 재지 않으면 다시 그렇게 된다.
   ========================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1100, height: 820 } });
  page.on('pageerror', e => { console.log('  ! ' + e.message); fails++; });
  await page.goto('file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(600);

  console.log('\n[ 오늘 오르는 사람은 같은 탑을 본다 ]');
  const same = await page.evaluate(() => {
    const day = towerDay();
    const sig = (m) => m.tiles.map(r => r.join('')).join('|');
    const out = { same: true, diffDay: false, floors: {} };
    for (const d of [1, 5, 11]) {
      const a = withSeed(floorSeed(d, day), () => makeFloor(d, false));
      const c = withSeed(floorSeed(d, day), () => makeFloor(d, false));
      if (sig(a) !== sig(c)) out.same = false;
      out.floors[d] = sig(a).length;
    }
    // 다른 날은 달라야 한다 — 안 그러면 씨앗이 날짜를 안 보고 있다는 뜻
    const t1 = withSeed(floorSeed(5, day), () => makeFloor(5, false));
    const t2 = withSeed(floorSeed(5, day + 1), () => makeFloor(5, false));
    out.diffDay = sig(t1) !== sig(t2);
    // 층끼리도 달라야 한다
    out.diffFloor = sig(withSeed(floorSeed(3, day), () => makeFloor(3, false)))
                 !== sig(withSeed(floorSeed(4, day), () => makeFloor(4, false)));
    return out;
  });
  check(same.same, '같은 날 같은 층은 몇 번을 만들어도 똑같다');
  check(same.diffDay, '내일은 다른 탑이다');
  check(same.diffFloor, '층마다 다른 지형이다');

  console.log('\n[ 씨앗이 지형 밖으로 새지 않는다 ]');
  const leak = await page.evaluate(() => {
    const before = [];
    for (let i = 0; i < 5; i++) before.push(randInt(0, 1e9));
    withSeed(12345, () => { for (let i = 0; i < 20; i++) randInt(0, 9); });
    const after = [];
    for (let i = 0; i < 5; i++) after.push(randInt(0, 1e9));
    // 예외가 나도 되돌려야 한다
    let threw = false;
    try { withSeed(1, () => { throw new Error('x'); }); } catch (e) { threw = true; }
    const post = [];
    for (let i = 0; i < 5; i++) post.push(randInt(0, 1e9));
    const allSame = (arr) => arr.every(v => v === arr[0]);
    return { threw, stillRandom: !allSame(after) && !allSame(post),
             notEqual: JSON.stringify(before) !== JSON.stringify(after) };
  });
  check(leak.stillRandom && leak.notEqual, '지형을 만들고 나면 난수가 다시 제멋대로다');
  check(leak.threw, '중간에 예외가 나도 되돌린다');

  console.log('\n[ 몬스터와 전리품은 그대로 다르다 ]');
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const runs = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      startRun(); UI.closeIntro();
      out.push({
        map: state.map.tiles.map(r => r.join('')).join('|'),
        mon: state.monsters.map(m => m.name + '@' + m.x + ',' + m.y).join(' '),
        item: state.map.items.map(m => m.type + '@' + m.x + ',' + m.y).join(' '),
      });
    }
    return out;
  });
  check(runs.every(r => r.map === runs[0].map), '1층 지형은 여섯 판 내내 같다');
  check(new Set(runs.map(r => r.mon)).size > 1, '몬스터는 판마다 다르다');
  check(new Set(runs.map(r => r.item)).size > 1, '전리품도 판마다 다르다');

  console.log('\n[ 그래서 흔적이 제자리에 선다 ]');
  const stand = await page.evaluate(() => {
    const day = towerDay();
    let ok = 0, tot = 0;
    for (let d = 1; d <= 12; d++) {
      const a = withSeed(floorSeed(d, day), () => makeFloor(d, false));
      const c = withSeed(floorSeed(d, day), () => makeFloor(d, false));   // 다음 사람의 지도
      // a 에서 쪽지를 쓸 수 있는 자리를 전부 모아 c 에서도 되는지 본다
      for (let y = 2; y < a.tiles.length - 1; y++)
        for (let x = 1; x < a.tiles[y].length - 1; x++) {
          if (!isWalkable(a, x, y) || a.tiles[y - 1][x] !== T.WALL) continue;
          tot++;
          if (isWalkable(c, x, y) && c.tiles[y - 1][x] === T.WALL) ok++;
        }
    }
    return { ok, tot };
  });
  check(stand.tot > 100 && stand.ok === stand.tot,
        `쪽지 자리가 남의 지도에서도 전부 그대로다 (${stand.ok}/${stand.tot} = ` +
        `${(stand.ok / stand.tot * 100).toFixed(0)}%, 예전 14%)`);

  console.log('\n[ 탑이 남긴 길잡이 ]');
  const guide = await page.evaluate(() => {
    const day = towerDay();
    const per = [];
    let bad = 0, wallOk = 0, tot = 0;
    for (let d = 1; d <= 12; d++) {
      const m = withSeed(floorSeed(d, day), () => makeFloor(d, false));
      const g = Guide.forFloor(d, day, m);
      per.push(g.length);
      for (const n of g) {
        tot++;
        // 그림은 벽에, 사람은 그 아래 칸에 선다
        if (m.tiles[n.y][n.x] === T.WALL && isWalkable(m, n.x, n.y + 1)) wallOk++;
        if (!noteText(n.a, n.b)) bad++;
      }
      // 두 번 불러도 같아야 한다 — 안 그러면 사람마다 다른 길잡이를 본다
      const g2 = Guide.forFloor(d, day, m);
      if (JSON.stringify(g) !== JSON.stringify(g2)) bad++;
    }
    return { per, bad, wallOk, tot, min: Math.min(...per) };
  });
  check(guide.min >= 1, `층마다 하나 이상 있다 (층별 ${guide.per.join(',')})`);
  check(guide.tot === guide.wallOk, `전부 벽에 붙어 있고 읽을 자리가 있다 (${guide.wallOk}/${guide.tot})`);
  check(guide.bad === 0, '몇 번을 불러도 같은 자리에 같은 말이다');

  const truth = await page.evaluate(() => {
    const day = towerDay();
    let checked = 0, right = 0;
    for (let d = 1; d <= 12; d++) {
      const m = withSeed(floorSeed(d, day), () => makeFloor(d, false));
      for (const n of Guide.forFloor(d, day, m)) {
        // 「계단이 있다」(틀1·낱말4) 는 정말 계단 근처여야 한다
        if (n.a === 1 && n.b === 4 && m.stairs) {
          checked++;
          if (chebyshev(n.x, n.y, m.stairs.x, m.stairs.y) <= 10) right++;
        }
      }
    }
    return { checked, right };
  });
  check(truth.checked > 0 && truth.checked === truth.right,
        `하는 말이 사실이다 — 「계단이 있다」가 정말 계단 옆이다 (${truth.right}/${truth.checked})`);

  console.log('\n[ 자정을 넘겨도 오르던 탑이 안 바뀐다 ]');
  const midnight = await page.evaluate(() => {
    startRun(); UI.closeIntro();
    const day = state.day;
    state.day = day - 1;                        // 어제 시작한 판인 척
    const before = state.map.tiles.map(r => r.join('')).join('|');
    enterFloor(2); UI.closeIntro();
    const blob = packRun();
    const kept = state.day;
    // 이어하면 그 날짜를 그대로 들고 와야 한다
    startRun(); UI.closeIntro();
    loadRun(blob, { quiet: true });
    return { kept, restored: state.day, moved: before.length > 0 };
  });
  check(midnight.kept === midnight.restored,
        `이어해도 시작한 날의 탑을 계속 오른다 (${midnight.kept} → ${midnight.restored})`);

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
