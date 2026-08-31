/* =========================================================
   test-story.js — 되짚기와 스스로 아무는 사람

   되짚기는 결말을 고르기 전에 흘러야 하고(모르고 고르면 동전 던지기다),
   기억을 몇 개 되찾았든 전부 보여야 한다.
   ========================================================= */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  console.log('\n[ 장면이 갖춰져 있는가 ]');
  const shape = await p.evaluate(() => ({
    n: STORY.length,
    keys: STORY.map(s => s.key),
    memKeys: MEMORIES.map(m => m.id),
    allHaveArt: STORY.every(s => !!s.draw),
    allHaveLines: STORY.every(s => s.pages && s.pages.length &&
                                   s.pages.every(pg => pg.length)),
    pages: STORY.reduce((n, s) => n + s.pages.length, 0),
    endsHavePages: Object.values(STORY_END).every(s => s.pages && s.pages.length),
    ends: Object.keys(STORY_END),
  }));
  check(shape.n === 9, `장면 아홉 개 (${shape.n})`);
  check(shape.keys.every(k => shape.memKeys.includes(k)),
        '장면마다 짝이 되는 기억이 있다');
  check(shape.memKeys.every(k => shape.keys.includes(k)),
        '기억 아홉 개가 하나도 빠짐없이 장면을 갖는다');
  check(shape.allHaveArt && shape.allHaveLines, '전부 그림과 글을 갖고 있다');
  check(shape.pages > 30, `쪽으로 나뉘어 넘어간다 (${shape.pages}쪽)`);
  check(shape.ends.includes('light') && shape.ends.includes('leave') && shape.endsHavePages,
        '결말마다 마지막 장면이 하나씩');

  console.log('\n[ 기억이 없어도 전부 보인다 ]');
  const none = await p.evaluate(() => {
    state.memories = new Set();
    Story.show(() => {});
    const n = Story.scenes.length;
    Story.finish();
    return n;
  });
  check(none === 9, `기억 0개로도 아홉 장면 다 흐른다 (${none})`);

  console.log('\n[ 결말보다 먼저 흐른다 ]');
  const order = await p.evaluate(async () => {
    enterFloor(CFG.TOP_FLOOR);
    UI.closeIntro();
    state.boss.hp = 0; kill(state.boss);
    await new Promise(r => setTimeout(r, 1500));
    return {
      story: Story.open(),
      ending: UI.endingOpen(),
      at: Story.at,
    };
  });
  check(order.story, '주인이 무너지면 되짚기가 먼저 뜬다');
  check(!order.ending, '아직 결말을 고르라고 하지 않는다');

  console.log('\n[ 누르고 있으면 빨라진다 ]');
  const spd = await p.evaluate(async () => {
    const t0 = Story.t, a0 = Story.at;
    await new Promise(r => setTimeout(r, 600));
    const slow = (Story.at - a0) * 100 + (Story.t - t0);
    Story.setFast(true);
    const t1 = Story.t, a1 = Story.at;
    await new Promise(r => setTimeout(r, 600));
    const fast = (Story.at - a1) * 100 + (Story.t - t1);
    Story.setFast(false);
    return { slow, fast };
  });
  check(spd.fast > spd.slow * 2, `누르면 빨라진다 (${spd.slow.toFixed(1)} → ${spd.fast.toFixed(1)})`);

  console.log('\n[ 다 흐르면 결말을 고른다 ]');
  const after = await p.evaluate(async () => {
    const last = Story.scenes[Story.scenes.length - 1];
    Story.at = Story.scenes.length - 1;
    Story.page = last.pages.length - 1;
    Story.t = 99; Story.typed = 999;
    await new Promise(r => setTimeout(r, 400));
    return { story: Story.open(), ending: UI.endingOpen() };
  });
  check(!after.story && after.ending, '되짚기가 끝나야 결말 선택이 뜬다');

  const tail = await p.evaluate(async () => {
    chooseEnding('leave');
    await new Promise(r => setTimeout(r, 2500));
    return { story: Story.open(), title: document.getElementById('story-title').textContent };
  });
  check(tail.story, `고른 뒤에도 그 결말의 마지막 장면이 흐른다 (${tail.title})`);
  check(/붙이지/.test(tail.title), '고른 쪽의 장면이 맞다');

  console.log('\n[ 스스로 아무는 사람 ]');
  const regen = await p.evaluate(() => {
    chooseHero('lizard'); startRun(); UI.closeIntro();
    state.monsters.length = 0;            // 아무것도 안 보이는 상태
    refreshFov();
    const p = state.player;
    p.hp = 10;
    state.regen = 0;
    const seen = [];
    for (let i = 1; i <= 10; i++) { regenStep(); seen.push(p.hp); }
    return { seen };
  });
  check(regen.seen[4] === 12 && regen.seen[9] === 14,
        `다섯 걸음마다 2씩 (${regen.seen.join(' ')})`);

  // 보이는 것이 있으면 아물지 않는다 — 이게 이 능력의 유일한 손잡이다
  const watched = await p.evaluate(() => {
    const p = state.player;
    p.hp = 10; state.regen = 0;
    state.monsters.length = 0;
    const m = makeMonster(MONSTERS.find(x => x.id === 'goblin'), p.x + 2, p.y);
    state.monsters.push(m);
    state.fovRadius = 10; refreshFov();
    const before = p.hp;
    for (let i = 0; i < 12; i++) regenStep();
    const during = p.hp;
    // 치우면 다시 아문다
    m.alive = false; refreshFov();
    for (let i = 0; i < 5; i++) regenStep();
    return { before, during, after: p.hp };
  });
  check(watched.during === watched.before,
        `보이는 것이 있으면 안 아문다 (${watched.before} → ${watched.during})`);
  check(watched.after > watched.during,
        `치우고 나면 다시 아문다 (${watched.during} → ${watched.after})`);

  const capped = await p.evaluate(() => {
    const p = state.player;
    state.monsters.length = 0; refreshFov();
    p.hp = p.maxHp; state.regen = 0;
    for (let i = 0; i < 12; i++) regenStep();
    const idle = state.regen;
    p.hp = p.maxHp - 1; state.regen = 0;
    for (let i = 0; i < 5; i++) regenStep();
    return { idle, hp: p.hp, max: p.maxHp };
  });
  check(capped.idle === 0, '가득 찼으면 눈금이 안 찬다 — 다친 뒤 첫 회복이 예측된다');
  check(capped.hp === capped.max, '넘치게 회복하지 않는다');

  const others = await p.evaluate(() => {
    chooseHero('knight'); startRun(); UI.closeIntro();
    const p = state.player;
    state.monsters.length = 0; refreshFov();
    p.hp = 10; state.regen = 0;
    for (let i = 0; i < 12; i++) regenStep();
    return { hp: p.hp, has: !!currentHero().regen };
  });
  check(!others.has && others.hp === 10, '다른 사람은 안 아문다 (기사 체력 그대로 10)');

  const kept = await p.evaluate(() => {
    chooseHero('lizard'); startRun(); UI.closeIntro();
    state.player.hp = 10;
    state.regen = 3;
    state.resumable = true;
    saveRun();
    const d = savedRun();
    state.regen = 0;
    loadRun(d, {});
    return state.regen;
  });
  check(kept === 3, `걸음 눈금이 이어하기에 남는다 (${kept})`);

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
