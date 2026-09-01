/* =========================================================
   test-gear.js — 장신구 두 칸 · 갖춰 입기 · 대장장이 · 매대 다시 깔기,
                  그리고 새로 붙인 업적들

     python -m http.server 8123
     node tools/test-gear.js

   업적은 「안 했다」가 조건이라 잘못 만들면 거저 열린다.
   실제로 안식처(몬스터 없음)에서 「스치지 않고」가 그냥 달성되고 있었다.
   그래서 여기서는 열려야 할 때 열리는지뿐 아니라 **안 열려야 할 때 안 열리는지**를 본다.
   ========================================================= */
const { chromium } = require('playwright');

const GAME = process.env.GAME || 'http://127.0.0.1:8123/index.html';

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };
const UI_HEART_MAX = 12;      // js/ui.js 의 UI.HEART_MAX 와 같아야 한다

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1100, height: 820 } });
  page.on('pageerror', e => { console.log('  ! ' + e.message); fails++; });
  await page.goto(GAME);
  await page.waitForTimeout(700);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await page.waitForTimeout(500);

  console.log('\n[ 장신구는 두 칸이다 ]');
  const slots = await page.evaluate(() => {
    const p = state.player;
    for (const s of SLOTS) p.gear[s] = null;
    const a = GEAR.find(g => g.name === '가죽 장화');
    const c = GEAR.find(g => g.name === '부적');
    const first = equipSlotFor(a, p);
    p.gear[first] = makeGear(a);
    const second = equipSlotFor(c, p);
    p.gear[second] = makeGear(c);
    recalcStats(p);
    // 둘 다 찼을 때 또 하나를 들면 값이 낮은 쪽이 밀린다
    const third = equipSlotFor(GEAR.find(g => g.name === '날랜 장화'), p);
    return {
      count: SLOTS.filter(s => s.startsWith('trinket')).length,
      first, second, third,
      spd: p.stats.spd, md: p.stats.md,
      cheaper: gearPrice(p.gear.trinket) < gearPrice(p.gear.trinket2) ? 'trinket' : 'trinket2',
    };
  });
  check(slots.count === 2, `장신구 자리가 둘이다 (${slots.count})`);
  check(slots.first !== slots.second, `둘을 같이 낀다 (${slots.first} + ${slots.second})`);
  check(slots.third === slots.cheaper,
        `둘 다 찼으면 값이 낮은 쪽이 밀린다 (${slots.third})`);

  const both = await page.evaluate(() => {
    const p = state.player;
    for (const s of SLOTS) p.gear[s] = null;
    recalcStats(p);
    const bare = { spd: p.stats.spd, md: p.stats.md };
    // 값은 데이터에서 읽는다 — 숫자를 적어 두면 밸런스를 만질 때마다 검사가 깨진다
    const boot = GEAR.find(g => g.name === '가죽 장화');
    const amul = GEAR.find(g => g.name === '부적');
    p.gear.trinket = makeGear(boot);
    p.gear.trinket2 = makeGear(amul);
    recalcStats(p);
    return { bare, spd: p.stats.spd, md: p.stats.md,
             wantSpd: boot.mod.spd, wantMd: amul.mod.md };
  });
  check(both.spd === both.bare.spd + both.wantSpd && both.md === both.bare.md + both.wantMd,
        `두 칸이 모두 스탯에 얹힌다 (속도 +${both.wantSpd}, 마방 +${both.wantMd})`);

  console.log('\n[ 갖춰 입기 ]');
  const sets = await page.evaluate(() => {
    const p = state.player;
    const wear = (names) => {
      for (const s of SLOTS) p.gear[s] = null;
      for (const n of names) {
        const def = GEAR.find(g => g.name === n);
        p.gear[equipSlotFor(def, p)] = makeGear(def);
      }
      recalcStats(p);
    };
    const S = SETS.spear;                    // 긴 창 · 사슬 갑옷 · 가죽 장화
    wear([]);                 const none = { atk: p.stats.atk, spd: p.stats.spd };
    wear([S.pieces[0]]);      const one  = { atk: p.stats.atk };
    wear(S.pieces.slice(0, 2)); const two = { atk: p.stats.atk, worn: wornSets(p).spear };
    wear(S.pieces);           const three = { atk: p.stats.atk, spd: p.stats.spd,
                                              worn: wornSets(p).spear };
    // 한 조각만 든 것과 두 조각을 든 것의 차이에서 장비 자체의 값을 뺀다
    const armorAtk = GEAR.find(g => g.name === S.pieces[1]).mod.atk || 0;
    return { none, one, two, three, armorAtk, twoBonus: S.two.atk,
             pieces: Object.values(SETS).map(s => s.pieces.length),
             allExist: Object.values(SETS).every(s =>
               s.pieces.every(n => GEAR.some(g => g.name === n))) };
  });
  check(sets.allExist, '네 셋의 아홉 조각이 전부 실제로 있는 장비다');
  check(sets.pieces.every(n => n === 3), `셋마다 세 조각 (${sets.pieces.join(',')})`);
  check(sets.two.worn === 2 && sets.three.worn === 3,
        `걸친 조각 수를 센다 (${sets.two.worn} → ${sets.three.worn})`);
  check(sets.two.atk - sets.one.atk - sets.armorAtk === sets.twoBonus,
        `둘 갖추면 장비 값 말고 공격 +${sets.twoBonus} 가 더 붙는다`);
  check(sets.three.spd > sets.none.spd, '셋 다 갖추면 값이 더 붙는다');

  const bias = await page.evaluate(() => {
    const p = state.player;
    for (const s of SLOTS) p.gear[s] = null;
    p.gear.weapon = makeGear(GEAR.find(g => g.name === '긴 창'));
    recalcStats(p);
    // 창병 셋을 시작한 상태에서 100번 굴려 나머지 조각이 얼마나 나오는가
    let hit = 0;
    for (let i = 0; i < 400; i++) {
      const g = rollGear(8);
      if (g && SET_OF[g.name] === 'spear') hit++;
    }
    return hit;
  });
  check(bias > 0, `시작한 셋의 나머지 조각이 실제로 나온다 (400번에 ${bias}번)`);

  console.log('\n[ 대장장이 ]');
  const forge = await page.evaluate(() => {
    const p = state.player;
    for (const s of SLOTS) p.gear[s] = null;
    p.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(p);
    state.gold = 5000; state.depth = 6;
    const before = p.stats.atk;
    const p1 = forgePrice('weapon', 0);
    forgeGear('weapon');
    const mid = p.stats.atk, gold1 = state.gold;
    const p2 = forgePrice('weapon', 1);
    forgeGear('weapon');
    UI.hideCamp();
    return { before, mid, after: p.stats.atk, p1, p2, gold1,
             times: p.gear.weapon.forged, traded: state.traded };
  });
  check(forge.mid > forge.before, `두드리면 세진다 (공격 ${forge.before} → ${forge.mid})`);
  check(forge.p2 > forge.p1, `값이 손볼수록 오른다 (${forge.p1} → ${forge.p2} G)`);
  check(forge.times === 2, `몇 번 손봤는지 장비에 남는다 (${forge.times}번)`);
  check(forge.traded, '대장장이도 거래로 친다 — 「빚 없이」가 여기서도 닫힌다');

  const poor = await page.evaluate(() => {
    state.gold = 0;
    const opts = forgeOptions();
    return opts.filter(o => o.disabled).length === opts.length;
  });
  check(poor, '골드가 없으면 전부 잠긴다');

  console.log('\n[ 매대를 다시 깐다 ]');
  const reroll = await page.evaluate(() => {
    state.depth = 6; state.gold = 5000; state.shopRerolls = 0;
    state.shopStock = rollShopStock(8, state.player, 3);
    state.shopStock.push({ kind: 'potion', price: 20, stock: 8, sold: false });
    const before = state.shopStock.filter(e => e.kind === 'gear').map(e => e.gear.name).join(',');
    const p1 = rerollPrice();
    rerollShop();
    const after = state.shopStock.filter(e => e.kind === 'gear').map(e => e.gear.name).join(',');
    const p2 = rerollPrice();
    UI.hideShop();
    return { before, after, p1, p2,
             potion: state.shopStock.some(e => e.kind === 'potion'),
             spent: 5000 - state.gold };
  });
  check(reroll.spent === reroll.p1, `값을 치른다 (${reroll.spent} G)`);
  check(reroll.p2 > reroll.p1, `다시 깔수록 비싸진다 (${reroll.p1} → ${reroll.p2} G)`);
  check(reroll.potion, '물약 줄은 남는다 — 언제나 사도 되는 것이라');

  console.log('\n[ 보물방 문은 하나다 ]');
  const doors = await page.evaluate(() => {
    let many = 0, none = 0, made = 0;
    for (let i = 0; i < 60; i++) {
      const m = makeFloor(6, true);
      if (!m.vault) continue;
      made++;
      if (m.doors.length !== 1) many++;
      // 지도에 실제로 놓인 문 칸도 세어 본다
      let onMap = 0;
      for (let y = 0; y < m.tiles.length; y++)
        for (let x = 0; x < m.tiles[y].length; x++)
          if (m.tiles[y][x] === T.DOOR) onMap++;
      if (onMap !== 1) none++;
    }
    return { made, many, none };
  });
  check(doors.made > 20, `보물방을 ${doors.made}번 만들어 봤다`);
  check(doors.many === 0, '문이 둘 이상인 방이 없다');
  check(doors.none === 0, '지도에 놓인 문 칸도 언제나 하나다');

  console.log('\n[ 업적이 거저 열리지 않는다 ]');
  const ach = await page.evaluate(() => {
    localStorage.removeItem(CFG.SAVE_KEY);
    startRun(); UI.closeIntro();
    // 안식처로 바로 올라가 계단을 밟는다
    enterFloor(3); UI.closeIntro(); state.running = true;
    const rest = state.restFloor;
    const s = state.map.stairs;
    state.player.x = s.x; state.player.y = s.y;
    onPlayerEnter(s.x, s.y);
    const got = (loadData() || {}).achievements || [];
    return { rest, unhurt: got.includes('unhurt') };
  });
  check(ach.rest, '3층은 안식처다');
  check(!ach.unhurt, '안식처를 지나는 것만으로는 「스치지 않고」가 안 열린다');

  const real = await page.evaluate(() => {
    enterFloor(4); UI.closeIntro(); state.running = true;
    const s = state.map.stairs;
    state.player.x = s.x; state.player.y = s.y;
    onPlayerEnter(s.x, s.y);
    return ((loadData() || {}).achievements || []).includes('unhurt');
  });
  check(real, '몬스터가 있는 층을 무사히 지나면 그때 열린다');

  const gate = await page.evaluate(() => {
    // 기사는 원거리가 아예 없다 — 「손으로만」이 거저 열리면 안 된다
    chooseHero('knight');
    startRun(); UI.closeIntro();
    state.usedMelee = true;
    checkClearAchievements();
    const knight = ((loadData() || {}).achievements || []).includes('meleeOnly');

    chooseHero('elf');
    startRun(); UI.closeIntro();
    state.couldRanged = true; state.usedRanged = false; state.usedMelee = true;
    checkClearAchievements();
    const elf = ((loadData() || {}).achievements || []).includes('meleeOnly');
    return { knight, elf };
  });
  check(!gate.knight, '기사로는 「손으로만」이 안 열린다 — 원거리가 애초에 없으니까');
  check(gate.elf, '쏠 수 있는 사람이 안 쏘고 오르면 그때 열린다');

  const rest2 = await page.evaluate(() => {
    localStorage.removeItem(CFG.SAVE_KEY);
    startRun(); UI.closeIntro();
    state.usedCamp = true; state.traded = true; state.usedMelee = true;
    checkClearAchievements();
    const a = (loadData() || {}).achievements || [];
    return { camp: a.includes('noCamp'), shop: a.includes('noShop') };
  });
  check(!rest2.camp, '모닥불을 썼으면 「불을 쬐지 않고」가 안 열린다');
  check(!rest2.shop, '거래를 했으면 「빚 없이」가 안 열린다');

  console.log('\n[ 도감에 잡은 수가 쌓인다 ]');
  const tally = await page.evaluate(() => {
    localStorage.removeItem(CFG.SAVE_KEY);
    tallyKill('goblin'); tallyKill('goblin'); tallyKill('orc');
    const t = (loadData() || {}).killCount || {};
    UI.showCodex('monsters');
    const html = document.getElementById('codex-monsters').innerHTML;
    UI.hideCodex();
    return { goblin: t.goblin, orc: t.orc, hasCol: /잡음/.test(html) };
  });
  check(tally.goblin === 2 && tally.orc === 1, `종류별로 센다 (고블린 ${tally.goblin}, 오크 ${tally.orc})`);
  check(tally.hasCol, '도감에 「잡음」 칸이 있다');

  /* 하트는 최대 체력이 자랄수록 늘어나는데, 좁은 화면에서 여러 줄로 접히면
     HUD 가 아래를 밀어내고 로그가 한 줄로 눌린다. 그리고 마지막 한 칸이
     한 칸을 다 못 채우는 경우(50 = 8칸 + 2)에는 가득 찬 상태인데도 반 칸으로 그려졌다. */
  console.log('\n[ 하트 ]');
  const hearts = await page.evaluate(() => {
    const p = state.player, out = [];
    for (const max of [30, 50, 62, 120, 240]) {
      p.maxHp = max; p.hp = max;
      UI.updateHearts(p);
      const imgs = [...document.getElementById('hearts').children];
      out.push({
        max, n: imgs.length,
        allFull: imgs.every(i => i.src === SPRITES.heartFull.f[0]),
        rows: new Set(imgs.map(i => Math.round(i.getBoundingClientRect().top))).size,
      });
    }
    // 한 대 맞으면 마지막 칸부터 준다
    p.maxHp = 50; p.hp = 49; UI.updateHearts(p);
    const imgs = [...document.getElementById('hearts').children];
    const notFull = imgs.filter(i => i.src !== SPRITES.heartFull.f[0]).length;
    return { out, notFull };
  });
  check(hearts.out.every(o => o.allFull),
        '가득 차 있으면 모든 하트가 가득이다 — 마지막 한 칸까지');
  check(hearts.out.every(o => o.n <= UI_HEART_MAX),
        `하트가 아무리 늘어도 ${UI_HEART_MAX}개를 안 넘는다 (${hearts.out.map(o => o.n).join(',')})`);
  check(hearts.out.every(o => o.rows <= 2),
        `줄이 두 줄을 안 넘는다 (${hearts.out.map(o => o.rows).join(',')})`);
  check(hearts.notFull > 0, '한 점이라도 깎이면 그건 티가 난다');

  console.log('\n[ 두고 간 장비는 무엇인지 보인다 ]');
  const left = await page.evaluate(() => {
    startRun(); UI.closeIntro(); state.running = true;
    const p = state.player;
    state.pendingGear = makeGear(GEAR.find(g => g.name === '짧은 검'));
    resolveGear(false);                     // 두고 간다
    const it = state.map.items.find(i => i.type === 'gear' && i.x === p.x && i.y === p.y);
    return { seen: !!(it && it.seen), icon: !!SPRITES['gear.짧은 검'] };
  });
  check(left.seen, '두고 간 것에 「봤다」 표시가 붙는다');
  check(left.icon, '그 장비의 그림이 있다 — 상자 대신 이걸 깐다');

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();

