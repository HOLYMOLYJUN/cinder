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
  check(pick.inSewer.stairs === 'stairs' && pick.inSewer.chest === 'chest',
        '바이옴에 없는 것(계단·상자)은 원래 것으로 돌아간다');
  check(pick.inStone.floor === 'floor' && pick.inStone.wall === 'wallFace',
        '아래층에서는 원래 것을 고른다');

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

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
