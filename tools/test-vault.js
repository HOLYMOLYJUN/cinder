/* 잿불 — 보물방 검증

   핵심 명제 둘:
     1. 문을 잠근 채로도 계단까지는 갈 수 있다 (판이 막히면 안 된다)
     2. 열쇠 없이는 못 들어가고, 열쇠를 얻으면 들어갈 수 있다 */

const { chromium } = require('playwright');
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto('file:///c:/Users/vlck1/Desktop/dev/game/index.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(700);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  /* ---------- 1. 금고가 붙은 층을 찾아 구조를 본다 ---------- */
  console.log('\n[ 구조 ]');
  const found = await p.evaluate(() => {
    for (let tries = 0; tries < 60; tries++) {
      enterFloor(2 + (tries % 12)); UI.closeIntro();
      if (state.map.vault) {
        const holders = state.monsters.filter(m => m.hasKey);
        const loot = state.map.items.filter(it => {
          const v = state.map.vault;
          return it.x >= v.x && it.x < v.x + v.w && it.y >= v.y && it.y < v.y + v.h;
        });
        return { ok: true, doors: state.map.doors.length, holders: holders.length,
                 loot: loot.map(l => l.type), depth: state.depth };
      }
    }
    return { ok: false };
  });
  check(found.ok, '금고가 있는 층을 찾음 (' + found.depth + '층)');
  check(found.doors >= 1, `잠긴 문 ${found.doors}개`);
  check(found.holders === 1, `열쇠를 든 몬스터가 정확히 하나 (${found.holders})`);
  check(found.loot.length >= 2, '금고 안에 보물: ' + found.loot.join(', '));

  /* ---------- 2. 문을 잠근 채로도 계단은 갈 수 있는가 ---------- */
  const reach = await p.evaluate(() => {
    const m = state.map;
    const walk = (blockDoor) => {
      const seen = new Set([m.start.y * m.w + m.start.x]);
      const q = [[m.start.x, m.start.y]];
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x+dx, ny = y+dy, k = ny*m.w+nx;
          if (nx<0||ny<0||nx>=m.w||ny>=m.h||seen.has(k)) continue;
          const t = m.tiles[ny][nx];
          if (t === T.WALL) continue;
          if (blockDoor && t === T.DOOR) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return seen;
    };
    const closed = walk(true), open = walk(false);
    const vi = m.vault.cy * m.w + m.vault.cx;
    return {
      stairs: closed.has(m.stairs.y * m.w + m.stairs.x),
      vaultClosed: closed.has(vi),
      vaultOpen: open.has(vi),
    };
  });
  check(reach.stairs, '문이 잠겨 있어도 계단까지 갈 수 있다');
  check(!reach.vaultClosed, '문을 통하지 않고는 금고에 못 들어간다');
  check(reach.vaultOpen, '문을 열면 금고에 들어갈 수 있다');

  /* ---------- 3. 열쇠 없이 문을 밀면 ---------- */
  console.log('\n[ 문 ]');
  const noKey = await p.evaluate(() => {
    const m = state.map, pl = state.player, d = m.doors[0];
    // 문 옆에 서서 문 쪽으로 민다
    const side = [[1,0,'left'],[-1,0,'right'],[0,1,'up'],[0,-1,'down']]
      .map(([dx,dy,dir]) => ({ x: d.x+dx, y: d.y+dy, dir }))
      .find(s => isWalkable(m, s.x, s.y));
    if (!side) return { skip: true };
    pl.x = side.x; pl.y = side.y; pl.rx = pl.x; pl.ry = pl.y;
    state.hasKey = false;
    const turns = state.turns;
    playerAction(side.dir, 'move');
    return { tile: m.tiles[d.y][d.x], moved: pl.x !== side.x || pl.y !== side.y,
             spent: state.turns !== turns, dir: side.dir, d };
  });
  check(!noKey.skip && noKey.tile === 5, '열쇠 없이는 문이 그대로 잠겨 있다');
  check(!noKey.moved && !noKey.spent, '헛되이 턴을 쓰지 않는다');

  /* ---------- 4. 열쇠를 얻고 열면 ---------- */
  const withKey = await p.evaluate(() => {
    const m = state.map, d = m.doors[0];
    const calls = []; const real = Sound.play.bind(Sound);
    Sound.play = n => { calls.push(n); return real(n); };
    // 열쇠를 든 것을 쓰러뜨린다
    const holder = state.monsters.find(x => x.hasKey);
    holder.hp = 0; kill(holder);
    const dropped = m.items.some(it => it.type === 'key' && it.x === holder.x && it.y === holder.y);
    // 열쇠를 줍는다.
    // 쓰러진 자리가 계단일 수도 있으므로(밟으면 층이 넘어간다) 평범한 바닥으로 옮겨 놓고 줍는다.
    const key = m.items.find(it => it.type === 'key');
    let spot = null;
    for (let y = 1; y < m.h - 1 && !spot; y++)
      for (let x = 1; x < m.w - 1; x++)
        if (m.tiles[y][x] === T.FLOOR && !monsterAt(x, y) &&
            !m.items.some(it => it !== key && it.x === x && it.y === y)) { spot = { x, y }; break; }
    key.x = spot.x; key.y = spot.y;
    state.player.x = spot.x; state.player.y = spot.y;
    onPlayerEnter(spot.x, spot.y);
    const got = state.hasKey;
    // 문을 연다
    const side = [[1,0,'left'],[-1,0,'right'],[0,1,'up'],[0,-1,'down']]
      .map(([dx,dy,dir]) => ({ x: d.x+dx, y: d.y+dy, dir }))
      .find(s => isWalkable(m, s.x, s.y));
    state.player.x = side.x; state.player.y = side.y;
    // 좌표를 손으로 옮겼으니 판이 돌고 있다고 다시 알려준다
    state.running = true; state.awaitingInput = true;
    const guard = { running: state.running, awaiting: state.awaitingInput,
                    alive: state.player.alive, gearOpen: UI.gearOpen(), shopOpen: UI.shopOpen(),
                    pendingGear: !!state.pendingGear, standingOn: m.tiles[side.y][side.x] };
    playerAction(side.dir, 'move');
    return { dropped, got, tile: m.tiles[d.y][d.x], keyLeft: state.hasKey, calls, guard };
  });
  console.log('  진단:', JSON.stringify(withKey.guard));
  check(withKey.dropped, '쓰러뜨리면 열쇠를 떨어뜨린다');
  check(withKey.got, '열쇠를 주우면 손에 들어온다');
  check(withKey.tile === 1, '열쇠로 문이 열린다');
  check(!withKey.keyLeft, '열쇠는 한 번 쓰면 없어진다');
  check(withKey.calls.includes('key') && withKey.calls.includes('unlock'),
        '줍는 소리와 여는 소리: ' + JSON.stringify(withKey.calls));

  await p.evaluate(() => { refreshFov(); UI.updateHud(state); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: __dirname + '/shots/29-vault.png' });

  console.log('\n에러:', errs.length ? errs.join('\n') : '없음');
  if (errs.length) fails++;
  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
