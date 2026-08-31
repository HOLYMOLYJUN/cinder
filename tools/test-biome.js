/* =========================================================
   test-biome.js — 층에 따라 배경이 바뀌는지

   그림만 갈아 끼우는 기능이라 조용히 어긋난다 — 안 바뀌어도 게임은 멀쩡히 돌고,
   틀린 층에서 바뀌어도 에러가 안 난다. 그래서 눈이 아니라 여기서 본다.
   ========================================================= */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  console.log('\n[ 어느 층에서 바뀌는가 ]');
  const got = await p.evaluate(() => {
    const out = {};
    for (let d = 1; d <= 15; d++) { Render.setBiome(d); out[d] = Render.biome; }
    return out;
  });
  for (let d = 1; d < 11; d++) if (got[d] !== null) check(false, `${d}층은 그대로여야 한다 (${got[d]})`);
  check([1,5,10].every(d => got[d] === null), '10층까지는 돌 던전 그대로');
  check([11,12,13,14].every(d => got[d] === 'sewer'), '11~14층은 하수도');
  check(got[15] === null, '15층(옥상)은 하수도가 아니다 — 난간 너머가 아득한 아래인 곳');

  console.log('\n[ 그림이 실제로 구워져 있는가 ]');
  const keys = await p.evaluate(() => ({
    floor: !!Render.img['sewer.floor'],
    face: !!Render.img['sewer.wallFace'],
    top: !!Render.img['sewer.wallTop'],
    variants: Render.img['sewer.floor'] ? Render.img['sewer.floor'].f.length : 0,
    baseVariants: Render.img['floor'] ? Render.img['floor'].f.length : 0,
  }));
  check(keys.floor && keys.face && keys.top, '하수도 바닥·벽·마감이 sprites.js 에 있다');
  check(keys.variants === keys.baseVariants,
        `바닥 변형 수가 기존과 같다 (${keys.variants}종) — floorVariant 를 그대로 쓴다`);

  console.log('\n[ 키를 고르는 규칙 ]');
  const pick = await p.evaluate(() => {
    Render.setBiome(12);
    const inSewer = { floor: Render.biomeKey('floor'), wall: Render.biomeKey('wallFace'),
                      stairs: Render.biomeKey('stairs'), chest: Render.biomeKey('chest') };
    Render.setBiome(2);
    const inStone = { floor: Render.biomeKey('floor'), wall: Render.biomeKey('wallFace') };
    return { inSewer, inStone };
  });
  check(pick.inSewer.floor === 'sewer.floor' && pick.inSewer.wall === 'sewer.wallFace',
        '하수도에서는 하수도 것을 고른다');
  check(pick.inSewer.stairs === 'sewer.stairs',
        '계단도 층에 따라 갈린다 — 아래층 갈색 바닥에 은빛 쇠는 혼자 튄다');
  check(pick.inSewer.chest === 'chest',
        '바이옴에 없는 것(상자)은 원래 것으로 돌아간다');
  check(pick.inStone.floor === 'floor' && pick.inStone.wall === 'wallFace',
        '아래층에서는 원래 것을 고른다');
  check(await p.evaluate(() => { Render.setBiome(3); return Render.biomeKey('stairs'); }) === 'stairs',
        '아래층 계단은 팩 원래 것 그대로');

  console.log('\n[ 들어가고 이어해도 유지되는가 ]');
  const live = await p.evaluate(() => {
    enterFloor(12); UI.closeIntro();
    return Render.biome;
  });
  check(live === 'sewer', '12층에 들어가면 하수도로 바뀐다');

  const resumed = await p.evaluate(() => {
    state.resumable = true;
    saveRun();
    Render.setBiome(1);                 // 일부러 돌 던전으로 되돌려 놓고
    const d = savedRun();
    loadRun(d, {});
    return { biome: Render.biome, depth: state.depth };
  });
  check(resumed.biome === 'sewer',
        `이어하기로 돌아와도 하수도다 (${resumed.depth}층 · ${resumed.biome})`);

  console.log('\n[ 바닥에는 이끼만, 그리고 밟으면 아프다 ]');
  const props = await p.evaluate(() => {
    // 하수도 층을 여러 번 뽑아 실제로 깔리는 것을 전부 모은다
    const floor = new Set(), wall = new Set();
    for (let i = 0; i < 30; i++) {
      enterFloor(12); UI.closeIntro();
      for (const pr of state.map.props) {
        (state.map.tiles[pr.y][pr.x] === T.WALL ? wall : floor).add(pr.kind);
      }
    }
    // 판정은 게임 쪽 함수로 한다 — 검사에 규칙을 베껴 두면 둘이 어긋난다
    return { floor: [...floor], wall: [...wall],
             allPoison: [...floor].every(k => isPoisonProp(k)) };
  });
  check(props.floor.length > 0 && props.allPoison,
        `바닥에는 이끼만 깔린다 (${props.floor.join(', ')})`);
  check(!props.floor.some(k => /jar|barrel|grate/.test(k)),
        '항아리·통·배수구는 바닥에서 치웠다');
  check(props.wall.length > 0, `벽 장식은 그대로 (${props.wall.length}종)`);

  const bite = await p.evaluate(() => {
    enterFloor(12); UI.closeIntro();
    const pl = state.player;
    // 옆 칸에 이끼를 놓고 그리로 걸어간다
    const m = state.map;
    let to = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (isWalkable(m, pl.x + dx, pl.y + dy)) { to = [dx, dy]; break; }
    }
    if (!to) return { skip: true };
    const tx = pl.x + to[0], ty = pl.y + to[1];
    m.props = [{ x: tx, y: ty, kind: 'sewer_moss_a', seed: 0 }];
    state.monsters.length = 0;
    pl.hp = 30;
    const before = pl.hp;
    onPlayerEnter(tx, ty);
    const after = pl.hp;
    // 지형이 아니라 그림이므로 길을 막지는 않는다
    return { before, after, walkable: isWalkable(m, tx, ty) };
  });
  if (bite.skip) console.log('  옆이 전부 벽이라 건너뜀');
  else {
    check(bite.after === bite.before - 1, `밟으면 1 깎인다 (${bite.before} → ${bite.after})`);
    check(bite.walkable, '막지는 않는다 — 갈 수 있느냐가 아니라 갈 값어치가 있느냐를 묻는다');
  }

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
