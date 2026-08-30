/* 잿불 — 실제 브라우저에서 자동 플레이시키며 확인 */

const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file:///c:/Users/vlck1/Desktop/dev/game/index.html';
const SHOT = __dirname + '/shots';
require('fs').mkdirSync(SHOT, { recursive: true });

const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const errors = [];
  const logs = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    logs.push(m.type() + ': ' + m.text());
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });

  await page.goto(GAME);
  await page.waitForTimeout(1200);   // 폰트 로딩

  /* ---------- 1. 타이틀 ---------- */
  await page.screenshot({ path: SHOT + '/1-title.png' });
  const titleVisible = await page.isVisible('#title-screen');
  console.log('타이틀 표시:', titleVisible);

  /* ---------- 2. 시작 → 층 진입 연출 ---------- */
  await page.click('#btn-start');
  await page.waitForTimeout(900);    // 타이핑 도중
  await page.screenshot({ path: SHOT + '/2-intro.png' });

  const introText = await page.textContent('#intro-line');
  const introFloor = await page.textContent('#intro-floor');
  console.log('진입 연출 —', introFloor, '/', JSON.stringify(introText.trim()));

  // 연출이 스스로 닫히는지
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 })
    .then(() => console.log('연출 자동 종료: 정상'))
    .catch(() => console.log('연출 자동 종료: 실패 (닫히지 않음)'));

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT + '/3-floor1.png' });

  /* ---------- 3. 캔버스가 실제로 그려졌는지 ---------- */
  const canvasInfo = await page.evaluate(() => {
    const c = document.getElementById('view');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) {      // 듬성듬성 표본
      const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
      colors.add(k);
      if (d[i] > 20 || d[i+1] > 20 || d[i+2] > 20) nonBg++;
    }
    return { w: c.width, h: c.height, sampled: Math.floor(d.length / (4*37)),
             nonBg, distinctColors: colors.size };
  });
  console.log('캔버스:', JSON.stringify(canvasInfo));

  /* ---------- 4. 입력이 먹는지 ---------- */
  const before = await page.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  // 걸을 수 있는 방향을 하나 찾아서 눌러본다
  const walkDir = await page.evaluate(() => {
    const p = state.player;
    for (const [k, d] of Object.entries(DIRS)) {
      if (isWalkable(state.map, p.x + d.dx, p.y + d.dy) && !monsterAt(p.x + d.dx, p.y + d.dy)) return k;
    }
    return null;
  });
  await page.keyboard.press(KEY[walkDir]);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  console.log(`입력 테스트 — ${walkDir} 눌러 (${before.x},${before.y}) → (${after.x},${after.y})`,
              (before.x !== after.x || before.y !== after.y) ? '이동함' : '움직이지 않음');

  /* ---------- 5. 자동 플레이 ---------- */
  console.log('\n=== 층별 기록 ===');
  const floorStats = [];
  let lastDepth = 1;
  let floorStart = Date.now();
  let floorSteps = 0;
  let shotGear = false, shotShop = false, shopDone = false, stuck = 0;

  // 층 진입 시점의 기초 정보
  const snapFloor = () => page.evaluate(() => {
    const m = state.map;
    let floors = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.tiles[y][x] !== T.WALL) floors++;
    // 계단까지 최단 걸음 (BFS)
    const q = [[state.player.x, state.player.y, 0]];
    const seen = new Set([state.player.y * m.w + state.player.x]);
    let shortest = -1;
    while (q.length) {
      const [x, y, d] = q.shift();
      if (x === m.stairs.x && y === m.stairs.y) { shortest = d; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy, k = ny*m.w+nx;
        if (nx<0||ny<0||nx>=m.w||ny>=m.h||seen.has(k)) continue;
        if (m.tiles[ny][nx] === T.WALL || m.tiles[ny][nx] === T.DOOR) continue;   // 잠긴 문은 못 지나간다
        seen.add(k); q.push([nx, ny, d+1]);
      }
    }
    return { depth: state.depth, w: m.w, h: m.h, floorTiles: floors,
             rooms: m.rooms.length, monsters: state.monsters.length,
             shortest, tag: state.floorTag && state.floorTag.id,
             fov: state.fovRadius };
  });

  let info = await snapFloor();

  for (let step = 0; step < 2600; step++) {
    const st = await page.evaluate(() => ({
      running: state.running, awaiting: state.awaitingInput,
      depth: state.depth, hp: state.player.hp, alive: state.player.alive,
      potions: state.potions, kills: state.kills, turns: state.turns,
      introActive: UI.intro.active,
      gearOpen: UI.gearOpen(), shopOpen: UI.shopOpen(),
      gold: state.gold,
    }));

    if (!st.alive) { console.log('  → 사망 (', st.depth, '층 )'); break; }

    // 장비 비교창
    if (st.gearOpen) {
      if (!shotGear) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: SHOT + '/9-gear.png' });
        const nm = await page.textContent('#gear-name');
        console.log('  [장비] 비교창:', nm.trim());
        shotGear = true;
      }
      await page.keyboard.press('KeyZ');       // 항상 교체해본다
      await page.waitForTimeout(140);
      continue;
    }

    // 상점
    if (st.shopOpen) {
      if (!shotShop) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: SHOT + '/10-shop.png' });
        const rows = await page.$$eval('.shop-row', els =>
          els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
        console.log('  [상점] 골드', st.gold, '/ 매물:');
        rows.forEach(r => console.log('        ', r));
        shotShop = true;
      }
      // 살 수 있는 건 다 산다 — 골드는 판이 끝나면 사라지므로
      const bought = await page.evaluate(() => {
        const before = state.gold;
        state.shopStock.forEach((e, i) => { if (!e.sold && state.gold >= e.price) buyFromShop(i); });
        return before - state.gold;
      });
      if (bought > 0) console.log('  [상점] 골드', bought, '어치 구입');
      await page.evaluate(() => UI.hideShop());
      shopDone = true;
      await page.waitForTimeout(140);
      continue;
    }

    if (st.introActive) { await page.keyboard.press('Space'); await page.waitForTimeout(120); continue; }
    if (!st.running) { await page.waitForTimeout(120); continue; }

    // 층이 바뀌었으면 기록
    if (st.depth !== lastDepth) {
      const explored = await page.evaluate(() => {
        const m = state.map; let e = 0, f = 0;
        for (let y=0;y<m.h;y++) for (let x=0;x<m.w;x++) {
          if (m.tiles[y][x] !== T.WALL) { f++; if (m.explored[y][x]) e++; }
        }
        return Math.round(e / f * 100);
      });
      floorStats.push({ ...info, steps: floorSteps, sec: ((Date.now()-floorStart)/1000).toFixed(1), explored });
      console.log(`  ${info.depth}층 ${info.w}x${info.h} 방${info.rooms} 몹${info.monsters} 시야${info.fov}` +
                  ` ${info.tag ? '['+info.tag+']' : ''} — 최단 ${info.shortest}걸음, 실제 ${floorSteps}걸음, ${((Date.now()-floorStart)/1000).toFixed(1)}초`);
      lastDepth = st.depth;
      floorStart = Date.now();
      floorSteps = 0;
      shopDone = false;
      info = await snapFloor();
      if (st.depth === 4) await page.screenshot({ path: SHOT + '/4-floor4.png' });
      if (st.depth === 6) await page.screenshot({ path: SHOT + '/5-rest6.png' });
      continue;
    }

    // 체력이 위험하면 물약
    if (st.hp <= 12 && st.potions > 0) {
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(80);
      continue;
    }

    // 계단으로 가는 다음 한 걸음 (BFS, 몬스터는 통과 대상으로 취급 → 부딪히면 싸운다)
    // 붙어 있는 적은 때리고, 근처 물건은 줍고, 없으면 계단으로 —
    // 사람이 하는 것과 비슷하게 굴려야 장비·상점이 실제로 검증된다.
    const dir = await page.evaluate((needShop) => {
      const m = state.map, p = state.player;

      // 1) 붙어 있는 적부터
      for (const [dx, dy, name] of [[1,0,'right'],[-1,0,'left'],[0,1,'down'],[0,-1,'up']]) {
        if (monsterAt(p.x + dx, p.y + dy)) return name;
      }

      // 플레이어에서 전체 BFS. 처음엔 몬스터를 벽처럼 돌아가고,
      // 그래서 아무 데도 못 가면 몬스터를 뚫고 가는 경로를 다시 찾는다
      // (좁은 복도를 막고 선 적 때문에 영원히 대기하는 일이 없도록).
      const search = (avoidMonsters) => {
        const prev = new Map(), dist = new Map();
        const q = [[p.x, p.y]];
        dist.set(p.y*m.w + p.x, 0);
        while (q.length) {
          const [x, y] = q.shift();
          const d = dist.get(y*m.w + x);
          for (const [dx, dy, name] of [[1,0,'right'],[-1,0,'left'],[0,1,'down'],[0,-1,'up']]) {
            const nx=x+dx, ny=y+dy, k=ny*m.w+nx;
            if (nx<0||ny<0||nx>=m.w||ny>=m.h||dist.has(k)) continue;
            if (m.tiles[ny][nx] === T.WALL || m.tiles[ny][nx] === T.DOOR) continue;   // 잠긴 문은 못 지나간다
            if (avoidMonsters && monsterAt(nx, ny)) continue;
            dist.set(k, d+1); prev.set(k, [x, y, name]); q.push([nx, ny]);
          }
        }
        const reach = (t) => t && dist.has(t.y*m.w + t.x);

        // 이미 그 칸에 서 있는 목표는 고르지 않는다 (경로 길이 0 → 방향 없음 → 무한 대기)
        const here = (t) => t && t.x === p.x && t.y === p.y;

        let goal = null;
        if (needShop && !here(m.shop) && reach(m.shop)) goal = m.shop;
        if (!goal && m.camp && !here(m.camp) && p.hp < p.maxHp && reach(m.camp)) goal = m.camp;
        if (!goal) {
          const items = m.items.filter(it => reach(it) && !here(it))
            .map(it => ({ it, d: dist.get(it.y*m.w + it.x) }))
            .sort((a, b) => (a.it.type === 'gear' ? -100 : 0) + a.d
                          - ((b.it.type === 'gear' ? -100 : 0) + b.d));
          if (items.length && items[0].d <= 16) goal = items[0].it;
        }
        if (!goal && reach(m.stairs)) goal = m.stairs;
        if (!goal) return null;

        let cx = goal.x, cy = goal.y, dirName = null;
        while (!(cx === p.x && cy === p.y)) {
          const e = prev.get(cy*m.w + cx);
          if (!e) return null;
          dirName = e[2]; cx = e[0]; cy = e[1];
        }
        return dirName;
      };

      return search(true) || search(false);
    }, !shopDone);

    if (!dir) {
      stuck++;
      if (stuck > 12) {
        const why = await page.evaluate(() => {
          const m = state.map, p = state.player;
          const dist = new Map([[p.y*m.w+p.x, 0]]);
          const q = [[p.x, p.y]];
          while (q.length) {
            const [x, y] = q.shift(); const d = dist.get(y*m.w+x);
            for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx=x+dx, ny=y+dy, k=ny*m.w+nx;
              if (nx<0||ny<0||nx>=m.w||ny>=m.h||dist.has(k)) continue;
              if (m.tiles[ny][nx] === T.WALL || m.tiles[ny][nx] === T.DOOR) continue;   // 잠긴 문은 못 지나간다
              dist.set(k, d+1); q.push([nx, ny]);
            }
          }
          return {
            at: [p.x, p.y], tile: m.tiles[p.y][p.x],
            stairs: m.stairs,
            stairsReachable: dist.has(m.stairs.y*m.w + m.stairs.x),
            stairsDist: dist.get(m.stairs.y*m.w + m.stairs.x),
            reachableTiles: dist.size,
            items: m.items.map(it => ({ t: it.type, at: [it.x, it.y],
                                        d: dist.get(it.y*m.w + it.x) })),
            awaiting: state.awaitingInput, running: state.running,
            pendingGear: !!state.pendingGear,
          };
        });
        console.log('  [멈춤] 길을 못 찾음:', JSON.stringify(why));
        break;
      }
      await page.keyboard.press('Space');
      floorSteps++;
      await page.waitForTimeout(45);
      continue;
    }
    stuck = 0;
    await page.keyboard.press(KEY[dir]);
    floorSteps++;
    await page.waitForTimeout(45);

    // 지나온 곳이 "기억"으로 남는지 확인할 만큼 걸었을 때 한 장
    if (lastDepth === 1 && floorSteps === 17) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: SHOT + '/3b-memory.png' });
    }
  }

  const final = await page.evaluate(() => ({
    depth: state.depth, hp: state.player.hp, kills: state.kills,
    gold: state.gold, turns: state.turns, alive: state.player.alive,
    stats: state.player.stats, maxHp: state.player.maxHp,
    magic: isMagicAttack(state.player),
    gear: SLOTS.map(s => state.player.gear[s] ? gearFullName(state.player.gear[s]) : '없음'),
  }));
  console.log('\n최종 —', final.depth + '층', final.alive ? '생존' : '사망',
              '/ 처치', final.kills, '/ 골드', final.gold, '/ 걸음', final.turns);
  console.log('  장비:', final.gear.join(' · '));
  console.log('  스탯: 공' + final.stats.atk, '주' + final.stats.sp, '방' + final.stats.def,
              '마' + final.stats.md, '속' + final.stats.spd, '/ 체력', final.maxHp,
              '→', final.magic ? '마법으로 싸움' : '물리로 싸움');

  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT + '/6-end.png' });

  /* ---------- 6. 도움말 ---------- */
  await page.evaluate(() => { UI.hideResult(); UI.showCodex('monsters'); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT + '/7-codex.png' });

  /* ---------- 7. 모바일 ---------- */
  const m = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 3,
  });
  const mp = await m.newPage();
  await mp.goto(GAME);
  await mp.waitForTimeout(1000);
  await mp.click('#btn-start');
  await mp.waitForTimeout(3200);
  await mp.screenshot({ path: SHOT + '/8-mobile.png' });
  const padVisible = await mp.isVisible('#touch-pad');
  console.log('모바일 방향 버튼 표시:', padVisible);
  await m.close();

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');

  await browser.close();
})();
