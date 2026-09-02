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
  /* 예전에는 장면과 기억이 1:1 이었다. 「던지던 손」 기억을 없애면서
     그 짝이 하나 끊어졌다 — 장은 남겨 두었다. 붓을 던진 밤의 이야기는
     조작과 상관이 없고, STORY 는 되찾은 기억과 무관하게 전부 흐른다.

     그래도 **기억은 전부 제 장을 가져야 한다** — 되찾았는데 그 이야기가
     없으면 그건 빠뜨린 것이다. 방향을 뒤집어 그쪽을 재다. */
  check(shape.memKeys.every(k => shape.keys.includes(k)),
        '되찾는 기억은 전부 제 장이 있다');
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

  console.log('\n[ 리자드 — 단검의 독 ]');

  /* 예전에는 「스스로 아무는 사람」이었다. 그 검사는 통째로 지웠다 —
     특성이 바뀐 것이지 고장 난 것이 아니므로 낡은 검사를 고쳐 쓰면 안 된다.
     이제 물어야 할 것은 「치고 물러서면 쫓아오는 동안 깎이는가」다. */

  const bite = await p.evaluate(() => {
    chooseHero('lizard'); startRun(); UI.closeIntro();
    const p = state.player;
    state.monsters.length = 0;
    const m = makeMonster(MONSTERS.find(x => x.id === 'goblin'), p.x + 1, p.y);
    m.hp = m.maxHp = 200;                 // 한 대에 안 죽게 — 독만 보려는 것이다
    state.monsters.push(m);
    attack(p, m, { dx: 1, dy: 0 });
    return { kind: weaponKind(p.gear.weapon), poison: m.poison, amount: m.poisonAmount };
  });
  check(bite.kind === 'dagger', `리자드는 단검을 들고 시작한다 (${bite.kind})`);
  check(bite.poison > 0, `단검으로 치면 독이 묻는다 (${bite.poison}턴)`);
  check(bite.amount === 2, `리자드의 독이 더 아프다 (턴당 ${bite.amount})`);

  // 쫓아오는 동안 깎인다 — 몬스터가 제 턴을 쓸 때마다 든다
  const chase = await p.evaluate(() => {
    const m = state.monsters[0];
    const before = m.hp;
    const seen = [];
    for (let i = 0; i < 6; i++) { poisonTick(m); seen.push(m.hp); }
    return { before, seen, left: m.poison };
  });
  check(chase.seen[0] === chase.before - 2, `한 턴에 2씩 든다 (${chase.before} → ${chase.seen[0]})`);
  check(chase.left === 0, '정해진 턴만큼만 들고 멎는다');
  check(chase.seen[4] === chase.seen[3],
        `다 든 뒤에는 안 깎인다 (${chase.seen.join(' ')})`);

  // 단검이 아니면 안 묻는다 — 독은 무기 갈래의 값이다
  const axe = await p.evaluate(() => {
    const p = state.player;
    p.gear.weapon = makeGear(GEAR.find(g => g.name === '손도끼'));
    recalcStats(p);
    const m = makeMonster(MONSTERS.find(x => x.id === 'goblin'), p.x + 1, p.y);
    m.hp = m.maxHp = 200;
    state.monsters.length = 0; state.monsters.push(m);
    attack(p, m, { dx: 1, dy: 0 });
    return { kind: weaponKind(p.gear.weapon), poison: m.poison || 0 };
  });
  check(axe.kind === 'axe' && axe.poison === 0, '도끼로는 독이 안 묻는다');

  // 남이 단검을 들어도 묻는다. 다만 리자드보다 얕다.
  const other = await p.evaluate(() => {
    chooseHero('knight'); startRun(); UI.closeIntro();
    const p = state.player;
    p.gear.weapon = makeGear(GEAR.find(g => g.name === '낡은 단검'));
    recalcStats(p);
    const m = makeMonster(MONSTERS.find(x => x.id === 'goblin'), p.x + 1, p.y);
    m.hp = m.maxHp = 200;
    state.monsters.length = 0; state.monsters.push(m);
    attack(p, m, { dx: 1, dy: 0 });
    return { poison: m.poison, amount: m.poisonAmount, has: !!currentHero().poison };
  });
  check(!other.has && other.poison > 0, `기사가 단검을 들어도 독은 묻는다 (${other.poison}턴)`);
  check(other.amount < 2, `다만 리자드보다 얕다 (턴당 ${other.amount} vs 2)`);

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
