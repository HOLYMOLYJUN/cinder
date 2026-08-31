/* =========================================================
   test-pet.js — 따라오는 것

   5층 문지기를 넘으면 하나를 고르고, 그것이 따라다니며 사람을 낫게 만든다.
   버프가 recalcStats 를 타므로 저장을 빠뜨리면 조용히 약해진다 — 그 자리를 본다.
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

  console.log('\n[ 처음에는 없다 ]');
  const fresh = await p.evaluate(() => ({ pet: state.pet, has: PET.has(),
                                          mod: PET.mod(), fov: PET.fovBonus() }));
  check(fresh.pet === null && !fresh.has, '새 판은 동행 없이 시작');
  check(Object.keys(fresh.mod).length === 0 && fresh.fov === 0, '없으면 아무 보정도 안 붙는다');

  console.log('\n[ 5층 문지기를 넘으면 고른다 ]');
  const opened = await p.evaluate(async () => {
    enterFloor(5); UI.closeIntro();
    return new Promise(r => {
      state.boss.hp = 0; kill(state.boss);
      setTimeout(() => r({
        open: UI.campOpen(),
        labels: [...document.querySelectorAll('#camp-choices .ending-pick b')]
                  .map(e => e.textContent.trim()),
        say: document.getElementById('camp-say').textContent,
      }), 1300);
    });
  });
  check(opened.open, '보스가 무너지면 선택창이 뜬다');
  check(opened.labels.length === 2, '둘 중 하나: ' + opened.labels.join(' / '));
  check(!/불이 아직/.test(opened.say), '모닥불이 아니라 그 자리의 말을 한다');

  console.log('\n[ 고르면 붙는다 ]');
  const took = await p.evaluate(() => {
    const before = { spd: state.player.stats.spd, fov: state.fovRadius };
    UI.campPickIndex(0);                       // 고양이
    return { before, id: state.pet && state.pet.id,
             spd: state.player.stats.spd, fov: state.fovRadius,
             closed: !UI.campOpen(),
             at: state.pet ? { x: state.pet.x, y: state.pet.y } : null,
             px: state.player.x, py: state.player.y };
  });
  check(took.id === 'cat', `고양이를 데려간다 (${took.id})`);
  check(took.spd === took.before.spd + 2, `속도 +2 (${took.before.spd} → ${took.spd})`);
  check(took.fov === took.before.fov + 1, `불씨가 한 칸 더 (${took.before.fov} → ${took.fov})`);
  check(took.closed, '고르면 창이 닫힌다');
  check(took.at.x === took.px && took.at.y === took.py, '사람 자리에서 시작한다');

  console.log('\n[ 따라온다 ]');
  const walk = await p.evaluate(() => {
    const m = state.map, cx = 20, cy = 12;
    for (let y = cy - 3; y <= cy + 3; y++)
      for (let x = cx - 8; x <= cx + 8; x++) m.tiles[y][x] = T.FLOOR;
    state.player.x = cx; state.player.y = cy;
    state.pet.x = cx - 5; state.pet.y = cy;       // 멀리 떨어뜨려 놓고
    const start = { ...state.pet };
    const seen = [];
    for (let i = 0; i < 4; i++) { PET.step(); seen.push({ x: state.pet.x, y: state.pet.y }); }
    const near = chebyshev(state.pet.x, state.pet.y, state.player.x, state.player.y);
    // 붙었으면 더는 겹치지 않는다
    PET.step();
    const onTop = state.pet.x === state.player.x && state.pet.y === state.player.y;
    return { start, seen, near, onTop };
  });
  check(walk.near <= 1, `네 턴이면 곁에 붙는다 (거리 ${walk.near})`);
  check(!walk.onTop, '사람과 같은 칸에는 올라서지 않는다');

  const far = await p.evaluate(() => {
    state.pet.x = 2; state.pet.y = 2;            // 다른 방에 남겨진 상황
    PET.step();
    return chebyshev(state.pet.x, state.pet.y, state.player.x, state.player.y);
  });
  check(far === 0, '너무 벌어지면 곁으로 돌아온다 (계단을 탄 뒤를 위해)');

  console.log('\n[ 싸움에 끼지 않는다 ]');
  const combat = await p.evaluate(() => {
    state.monsters.length = 0;
    state.memories = new Set(['throw']);
    state.pet.x = state.player.x + 2; state.pet.y = state.player.y;
    state.rangedCd = 0;
    refreshFov();
    const target = rangedTarget(null);
    const hpBefore = state.player.hp;
    // 몬스터가 없으므로 동행을 겨눠서는 안 된다
    return { target, monsters: state.monsters.length, hpBefore };
  });
  check(combat.target === null, '원거리가 동행을 겨누지 않는다');

  console.log('\n[ 층을 옮기고 새로고침해도 남는가 ]');
  const across = await p.evaluate(() => {
    enterFloor(6); UI.closeIntro();
    return { id: state.pet && state.pet.id,
             at: { x: state.pet.x, y: state.pet.y },
             px: state.player.x, py: state.player.y,
             spd: state.player.stats.spd };
  });
  check(across.id === 'cat', '층을 옮겨도 따라온다');
  check(across.at.x === across.px && across.at.y === across.py, '계단을 같이 내려온다');

  const saved = await p.evaluate(() => {
    state.resumable = true; saveRun();
    return { spd: state.player.stats.spd, fov: state.fovRadius, id: state.pet.id };
  });
  await p.reload(); await p.waitForTimeout(700);
  const after = await p.evaluate(() => {
    const d = savedRun();
    if (!d) return null;
    loadRun(d, {});
    return { id: state.pet && state.pet.id, spd: state.player.stats.spd, fov: state.fovRadius };
  });
  check(after && after.id === saved.id, `새로고침해도 그대로 (${after && after.id})`);
  check(after && after.spd === saved.spd, `속도 보정도 남는다 (${saved.spd} → ${after && after.spd})`);
  check(after && after.fov === saved.fov, `불씨 반경도 남는다 (${saved.fov} → ${after && after.fov})`);

  console.log('\n[ 판이 끝나면 사라진다 ]');
  const reset = await p.evaluate(() => { startRun(); return state.pet; });
  check(reset === null, '새 판은 다시 혼자다 — 기억과 달리 판을 넘지 않는다');

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
