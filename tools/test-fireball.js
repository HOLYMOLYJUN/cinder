const { chromium } = require('playwright');
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  /* --- 파이어볼 --- */
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  console.log('\n[ 무기에 따라 원거리가 달라진다 ]');
  const res = await p.evaluate(() => {
    // 기사는 원거리가 통째로 없다 — 던지기/불덩이는 물리 기반인 리자드로 본다
    chooseHero('lizard');
    startRun();
    state.memories = new Set(['throw']);
    const pl = state.player;
    // 직선 통로를 찾아 표적 셋을 뭉쳐 놓는다
    let dir = null, spot = null, dvec = null;
    for (let attempt = 0; attempt < 40 && !dir; attempt++) {
      for (const [k, d] of Object.entries(DIRS)) {
        let ok = true;
        for (let i = 1; i <= 4; i++) if (!isWalkable(state.map, pl.x+d.dx*i, pl.y+d.dy*i)) ok = false;
        if (!ok) continue;
        // 옆이 트여 있어야 번짐을 시험할 수 있다
        const s = [pl.x+d.dx*3, pl.y+d.dy*3];
        const side2 = d.dx !== 0 ? [[0,1],[0,-1]] : [[1,0],[-1,0]];
        if (!side2.some(([ax,ay]) => isWalkable(state.map, s[0]+ax, s[1]+ay))) continue;
        dir = k; dvec = d; spot = s; break;
      }
      if (!dir) { enterFloor(1); UI.closeIntro(); }   // 다른 층을 뽑아 다시 본다
    }
    if (!dir) return { skip: true };

    const put = () => {
      state.monsters.length = 0;
      const main = makeMonster(MONSTERS.find(x => x.id === 'troll'), spot[0], spot[1]);
      main.hp = main.maxHp = 200;
      state.monsters.push(main);
      // 사격선 위에 놓으면 표적보다 먼저 맞는다 — 반드시 옆으로만
      const side = dvec.dx !== 0 ? [[0,1],[0,-1]] : [[1,0],[-1,0]];
      const near = [];
      for (const [dx,dy] of side) {
        const x = spot[0]+dx, y = spot[1]+dy;
        if (x===pl.x && y===pl.y) continue;
        if (!isWalkable(state.map, x, y) || monsterAt(x,y)) continue;
        const m = makeMonster(MONSTERS.find(z => z.id === 'goblin'), x, y);
        m.hp = m.maxHp = 200; state.monsters.push(m); near.push(m);
        if (near.length >= 2) break;
      }
      return { main, near };
    };

    // 1) 검을 들었을 때 — 던지기
    pl.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검')); recalcStats(pl);
    let { main, near } = put();
    const calls1 = []; const real = Sound.play.bind(Sound); Sound.play = n => { calls1.push(n); return real(n); };
    (state.rangedCd = 0), rangedAttack(dir);
    const sword = { magic: isMagicAttack(pl), mainHit: 200 - main.hp,
                    splash: near.map(m => 200 - m.hp), calls: calls1.slice() };

    // 2) 지팡이를 들었을 때 — 불덩이
    pl.gear.weapon = makeGear(GEAR.find(g => g.name === '재의 지팡이')); recalcStats(pl);
    ({ main, near } = put());
    const calls2 = []; Sound.play = n => { calls2.push(n); return real(n); };
    (state.rangedCd = 0), rangedAttack(dir);
    const staff = { magic: isMagicAttack(pl), mainHit: 200 - main.hp,
                    splash: near.map(m => 200 - m.hp), calls: calls2.slice(),
                    orbs: Render.orbs.length, blasts: Render.blasts.length };
    return { sword, staff };
  });

  if (res.skip) { console.log('  직선 통로를 못 찾음'); }
  else {
    console.log('  검  — 명중', res.sword.mainHit, '주변', JSON.stringify(res.sword.splash), '소리', JSON.stringify(res.sword.calls));
    console.log('  지팡이 — 명중', res.staff.mainHit, '주변', JSON.stringify(res.staff.splash), '소리', JSON.stringify(res.staff.calls));
    check(!res.sword.magic && res.staff.magic, '지팡이를 들면 마법 판정으로 바뀜');
    check(res.sword.splash.every(v => v === 0), '던지기는 하나만 맞힌다');
    check(res.staff.splash.some(v => v > 0), '불덩이는 주변까지 번진다');
    check(res.staff.calls.includes('fireball') && res.staff.calls.includes('blast'), '불덩이 소리가 난다');
    check(res.staff.orbs > 0 && res.staff.blasts > 0, '날아가는 연출과 터지는 연출이 생김');
  }
  await p.waitForTimeout(120);
  await p.screenshot({ path: __dirname + '/shots/24-fireball.png' });

  /* --- 모바일 --- */
  /* ---------- 스스로 겨누는가 ---------- */
  console.log('\n[ 스스로 겨눈다 ]');
  const aimTest = await p.evaluate(() => {
    // 넓은 빈 방을 하나 깔고 그 안에서만 실험한다
    const m = state.map;
    const cx = 20, cy = 12;
    for (let y = cy - 6; y <= cy + 6; y++)
      for (let x = cx - 9; x <= cx + 9; x++) m.tiles[y][x] = T.FLOOR;
    state.player.x = cx; state.player.y = cy;
    state.player.rx = cx; state.player.ry = cy;
    state.memories = new Set(['throw']);
    state.player.gear = { weapon: null, armor: null, trinket: null };
    recalcStats(state.player);
    state.fovRadius = 12;
    const put = (dx, dy) => {
      const mon = makeMonster(MONSTERS[1], cx + dx, cy + dy);
      state.monsters.push(mon);
      return mon;
    };
    const out = {};

    // 1) 대각선만 있을 때 — 예전에는 겨눌 수 없던 자리
    state.monsters.length = 0;
    const diag = put(3, 3);
    refreshFov();
    out.diagBefore = diag.hp;
    (state.rangedCd = 0), rangedAttack(null);
    out.diagAfter = diag.hp;

    // 2) 대각선과 직선이 같이 있을 때 — 가까운 쪽
    state.monsters.length = 0;
    const far = put(0, -5), near = put(2, 1);
    refreshFov();
    (state.rangedCd = 0), rangedAttack(null);
    out.nearHit = near.hp < near.maxHp;
    out.farHit  = far.hp < far.maxHp;

    // 3) 방향키를 같이 누르면 그쪽을 먼저 본다
    state.monsters.length = 0;
    const left = put(-2, 0), right = put(4, 0);
    refreshFov();
    (state.rangedCd = 0), rangedAttack('right');
    out.dirRespected = right.hp < right.maxHp && left.hp === left.maxHp;

    // 4) 벽 너머는 못 겨눈다
    state.monsters.length = 0;
    const behind = put(4, 0);
    m.tiles[cy][cx + 2] = T.WALL;
    refreshFov();
    state.rangedCd = 0;
    out.wallBlocked = rangedAttack(null) === false && behind.hp === behind.maxHp;
    m.tiles[cy][cx + 2] = T.FLOOR;

    // 5) 아무것도 없으면 턴을 쓰지 않는다
    state.monsters.length = 0;
    refreshFov();
    state.rangedCd = 0;
    out.noTargetNoTurn = rangedAttack(null) === false;
    return out;
  });
  check(aimTest.diagAfter < aimTest.diagBefore,
        `대각선에 있어도 맞는다 (${aimTest.diagBefore} → ${aimTest.diagAfter})`);
  check(aimTest.nearHit && !aimTest.farHit, '여럿이면 가까운 쪽을 겨눈다');
  check(aimTest.dirRespected, '방향키를 같이 누르면 그쪽 것을 겨눈다');
  check(aimTest.wallBlocked, '벽 너머는 겨누지 못한다');
  check(aimTest.noTargetNoTurn, '겨눌 것이 없으면 턴을 쓰지 않는다');

  console.log('\n[ 모바일 조작 ]');

  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const mp = await m.newPage();
  mp.on('pageerror', e => errs.push(e.message));
  await mp.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href);
  await mp.evaluate(() => localStorage.clear());
  await mp.reload(); await mp.waitForTimeout(700);
  await mp.click('#btn-start');
  await mp.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await mp.waitForTimeout(400);

  check(await mp.isVisible('#touch-acts'), '행동 버튼이 보인다');
  // 만점 체력에서는 물약을 마시지 않는 게 정상이므로 먼저 다치게 한다
  await mp.evaluate(() => { state.player.hp = 10; UI.updateHud(state); });
  const before = await mp.evaluate(() => state.potions);
  await mp.click('[data-act="potion"]');
  await mp.waitForTimeout(200);
  const after = await mp.evaluate(() => ({ potions: state.potions, label: document.getElementById('t-potion').textContent }));
  check(after.potions === before - 1, `물약 버튼으로 마심 (${before} → ${after.potions})`);
  const healed = await mp.evaluate(() => state.player.hp);
  check(healed > 10, `체력도 실제로 올랐다 (10 → ${healed})`);
  check(after.label === String(after.potions), '버튼의 개수 표시가 따라간다: ' + after.label);

  const lock = await mp.evaluate(() => ({
    aim: document.getElementById('t-aim').classList.contains('locked'),
    ember: document.getElementById('t-ember').classList.contains('locked'),
  }));
  check(lock.aim && lock.ember, '아직 기억하지 못한 기능은 잠겨 보인다');

  // 겨누기 → 방향, 두 번 두드리던 것이 한 번으로 줄었다.
  // 버튼 한 번에 실제로 나가야 한다. 기사는 원거리가 없으므로 리자드로 본다.
  await mp.evaluate(() => { chooseHero('lizard'); startRun(); UI.closeIntro(); });
  await mp.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const aim = await mp.evaluate(() => {
    state.memories = new Set(['throw']);
    recalcStats(state.player);
    paintTouch();
    // 대각선에 한 마리 세워 둔다 — 예전이라면 겨눌 수 없던 자리다
    state.monsters.length = 0;
    const spot = { x: state.player.x + 2, y: state.player.y + 2 };
    const walkable = isWalkable(state.map, spot.x, spot.y);
    if (walkable) state.monsters.push(makeMonster(MONSTERS[1], spot.x, spot.y));
    refreshFov();
    const hpBefore = walkable ? state.monsters[0].hp : 0;
    document.querySelector('[data-act="aim"]').click();
    return { walkable, label: document.getElementById('t-aim').textContent,
             hpBefore, hpAfter: walkable ? state.monsters[0].hp : 0 };
  });
  check(aim.label === '원거리', '원거리 버튼은 늘 「원거리」 하나뿐: ' + aim.label);
  if (aim.walkable) {
    check(aim.hpAfter < aim.hpBefore,
          `버튼 한 번으로 대각선의 것을 맞힘 (${aim.hpBefore} → ${aim.hpAfter})`);
  } else {
    console.log('  - 대각선 자리가 벽이라 이번 판에서는 못 봄');
  }

  await mp.screenshot({ path: __dirname + '/shots/25-mobile.png' });
  await m.close();


  console.log('\n에러:', errs.length ? errs.join('\n') : '없음');
  if (errs.length) fails++;
  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
