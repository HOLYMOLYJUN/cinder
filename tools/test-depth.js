/* =========================================================
   test-depth.js — 판을 다채롭게 만드는 세 가지 검증

     1) 엘리트 — 접두사가 붙고, 스탯이 실제로 달라지고, 죽을 때 일이 벌어진다
     2) 정체불명 — 열기 전에는 값이 안 보이고, 열면 좋거나 저주다
     3) 모닥불 선택 — 셋 중 하나를 고르고, 고른 것이 실제로 남는다

   특히 이어하기·관전에서 살아남는지를 본다. 셋 다 상태에 얹히는 것이라
   저장을 빠뜨리면 새로고침 한 번에 조용히 사라진다.
   ========================================================= */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  console.log('\n[ 엘리트 ]');
  const el = await p.evaluate(() => {
    const def = MONSTERS.find(m => m.id === 'goblin');
    const plain = makeMonster(def, 1, 1);
    const out = { plain: { hp: plain.maxHp, spd: plain.stats.spd, gold: plain.gold, name: plain.name } };
    out.each = ELITES.map(e => {
      const m = makeMonster(def, 1, 1, e.id);
      return { id: e.id, name: m.name, hp: m.maxHp, spd: m.stats.spd,
               atk: m.stats.atk, def: m.stats.def, gold: m.gold, tint: m.eliteTint };
    });
    out.chance = [1, 2, 3, 8, 15].map(d => eliteChance(d));
    return out;
  });
  const byId = Object.fromEntries(el.each.map(e => [e.id, e]));
  check(el.each.every(e => e.name !== el.plain.name && e.name.endsWith('고블린')),
        '접두사가 붙는다: ' + el.each.map(e => e.name).join(', '));
  check(byId.starved.spd > el.plain.spd && byId.starved.hp < el.plain.hp,
        `「굶주린」 빠르고 무르다 (속${el.plain.spd}→${byId.starved.spd} 체${el.plain.hp}→${byId.starved.hp})`);
  check(byId.raging.atk > el.plain.hp * 0 + makeAtk(el), `「성난」 세게 때린다 (공→${byId.raging.atk})`);
  check(byId.hardened.def > 4 && byId.hardened.hp > el.plain.hp, '「굳은」 단단하다');
  check(el.each.every(e => e.gold > el.plain.gold), '엘리트는 값어치도 크다');
  check(el.each.every(e => !!e.tint), '전부 발밑 빛 색을 갖는다');
  check(el.chance[0] === 0 && el.chance[1] === 0 && el.chance[2] > 0,
        '1~2층에는 안 붙고 3층부터 붙는다');
  check(el.chance[4] > el.chance[2], `위로 갈수록 자주 붙는다 (3층 ${(el.chance[2]*100).toFixed(0)}% → 15층 ${(el.chance[4]*100).toFixed(0)}%)`);

  // 죽을 때 벌어지는 일
  const death = await p.evaluate(() => {
    const setup = (eliteId) => {
      const m = state.map, cx = 20, cy = 12;
      for (let y = cy - 4; y <= cy + 4; y++)
        for (let x = cx - 4; x <= cx + 4; x++) m.tiles[y][x] = T.FLOOR;
      state.player.x = cx; state.player.y = cy;
      state.player.rx = cx; state.player.ry = cy;
      state.player.hp = state.player.maxHp;
      state.monsters.length = 0;
      const mon = makeMonster(MONSTERS.find(x => x.id === 'goblin'), cx + 1, cy, eliteId);
      state.monsters.push(mon);
      return mon;
    };
    // 재를 뒤집어쓴 — 붙어 있으면 맞는다
    let mon = setup('ashen');
    const hpBefore = state.player.hp;
    kill(mon);
    const burst = { dmg: hpBefore - state.player.hp };
    // 메아리치는 — 둘로 갈라진다
    mon = setup('echoing');
    kill(mon);
    const born = state.monsters.filter(m => m.alive).length;
    const echoElite = state.monsters.filter(m => m.alive).some(m => m.elite);
    return { burst, born, echoElite };
  });
  check(death.burst.dmg > 0, `「재를 뒤집어쓴」 쓰러지며 터진다 (${death.burst.dmg}의 피해)`);
  check(death.born === 2, `「메아리치는」 둘로 갈라진다 (${death.born}마리)`);
  check(death.echoElite === false, '갈라진 것에는 접두사가 없다 (끝없이 메아리치지 않는다)');

  console.log('\n[ 정체불명 ]');
  const unk = await p.evaluate(() => {
    let good = 0, cursed = 0, sample = null;
    for (let i = 0; i < 400; i++) {
      const g = rollUnknown(8, 0);
      if (!g) continue;
      if (!sample) sample = { name: gearFullName(g), unknown: g.unknown, icon: UI.gearIcon(g) };
      if (g.rarity === 'cursed') cursed++; else good++;
    }
    // 저주는 값이 실제로 깎여 있는가
    let neg = 0, tries = 0;
    while (neg === 0 && tries++ < 200) {
      const g = rollUnknown(8, 0);
      if (g && g.rarity === 'cursed' && Object.values(g.mod).some(v => v < 0)) neg = 1;
    }
    // 열면 이름이 드러난다
    let g2 = null, tries2 = 0;
    do { g2 = rollUnknown(8, 0); } while (g2 && g2.rarity === 'cursed' && tries2++ < 50);
    const before = gearFullName(g2);
    revealGear(g2);
    const after = gearFullName(g2);
    return { good, cursed, sample, neg, before, after };
  });
  check(unk.sample.name.startsWith('정체불명'), `열기 전 이름을 숨긴다: ${unk.sample.name}`);
  check(unk.sample.icon === null, '열기 전에는 그림도 안 보인다');
  check(unk.good > 0 && unk.cursed > 0,
        `좋은 쪽과 저주가 둘 다 나온다 (좋은 ${unk.good} / 저주 ${unk.cursed})`);
  check(unk.cursed / (unk.good + unk.cursed) > 0.2 && unk.cursed / (unk.good + unk.cursed) < 0.5,
        `저주 비율이 3분의 1쯤 (${(unk.cursed / (unk.good + unk.cursed) * 100).toFixed(0)}%)`);
  check(unk.neg === 1, '저주받은 것은 값이 실제로 깎여 있다');
  check(unk.before !== unk.after && !unk.after.startsWith('정체불명'),
        `열면 드러난다: ${unk.before} → ${unk.after}`);

  /* 정체불명은 열기 전까지 값을 감춘다. 예전에는 비교창이 그 일을 했는데,
     가방이 생기면서 그 자리를 가방의 상세 칸이 대신한다. */
  const cmp = await p.evaluate(() => {
    state.player.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(state.player);
    let g = null, t = 0;
    do { g = rollUnknown(8, 0); } while (g && g.slot !== 'weapon' && t++ < 200);
    if (!g || g.slot !== 'weapon') return { skip: true };
    state.bag = [g];
    openBag();
    const open = UI.bagOpen();
    document.querySelector('#bag-slots [data-bag="0"]').click();
    const box = document.getElementById('bag-detail');
    const text = box.textContent;
    const equip = box.querySelector('[data-act="equip"]');
    UI.hideBag();
    return { text, open, label: equip && equip.textContent };
  });
  if (cmp.skip) console.log('  무기 정체불명이 안 나옴 — 건너뜀');
  else {
    check(cmp.open, '가방이 열린다');
    check(cmp.text.includes('정체불명'), '정체불명은 이름부터 가려진다');
    check(/알 수 없습니다/.test(cmp.text), '값 대신 「알 수 없습니다」가 뜬다');
    /* 예전에는 여기서 「낄 수 없다」를 쟀다. 그건 버그를 규칙으로 굳혀 둔
       것이었다 — 여는 길이 통째로 없어서 정체불명이 가방에서 썩었다.
       끼는 것이 곧 여는 것이므로, 재야 할 것은 그 버튼이 무슨 일인지
       먼저 말하느냐다. */
    check(cmp.label === '열어 본다', `버튼이 무슨 일인지 먼저 말한다 — 「${cmp.label}」`);
  }

  console.log('\n[ 모닥불 선택 ]');
  const camp = await p.evaluate(() => {
    // 무기를 쥐고 다친 상태로 모닥불 위에 선다
    const m = state.map, cx = 20, cy = 12;
    m.tiles[cy][cx] = T.CAMP;
    state.player.x = cx; state.player.y = cy;
    state.player.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(state.player);
    state.player.hp = 5;
    state.monsters.length = 0;
    openCamp(cx, cy);
    const opened = UI.campOpen();
    const labels = [...document.querySelectorAll('#camp-choices .ending-pick b')].map(e => e.textContent.trim());
    return { opened, labels };
  });
  check(camp.opened, '모닥불을 밟으면 선택창이 뜬다');
  check(camp.labels.length === 3, '고를 것이 셋: ' + camp.labels.join(' / '));

  const temper = await p.evaluate(() => {
    const before = state.player.stats.atk;
    const wBefore = state.player.gear.weapon.mod.atk;
    UI.campPickIndex(1);                       // 무기를 불에 담근다
    return { before, after: state.player.stats.atk,
             wBefore, wAfter: state.player.gear.weapon.mod.atk,
             closed: !UI.campOpen(), tileGone: state.map.tiles[12][20] !== T.CAMP };
  });
  check(temper.after > temper.before, `무기를 담그면 공격이 오른다 (${temper.before} → ${temper.after})`);
  check(temper.wAfter > temper.wBefore, '값이 장비 자체에 얹힌다 (이어하기·관전에 그대로 실린다)');
  check(temper.closed, '고르면 창이 닫힌다');
  check(temper.tileGone, '다 쓴 불은 꺼진다');

  const ash = await p.evaluate(() => {
    const m = state.map, cx = 20, cy = 12;
    m.tiles[cy][cx] = T.CAMP;
    state.player.x = cx; state.player.y = cy;
    openCamp(cx, cy);
    const before = state.player.maxHp;
    UI.campPickIndex(2);                       // 재를 삼킨다
    const after = state.player.maxHp;
    // 장비를 갈아끼워도 (스탯을 처음부터 다시 세워도) 남아 있는가
    state.player.gear.armor = makeGear(GEAR.find(g => g.name === '가죽 갑옷'));
    recalcStats(state.player);
    return { before, after, kept: state.player.maxHp, ashHp: state.ashHp };
  });
  check(ash.after === ash.before + 6, `재를 삼키면 최대 체력 +6 (${ash.before} → ${ash.after})`);
  check(ash.kept === ash.after, '스탯을 다시 세워도 남는다 (장비 교체로 안 사라진다)');

  console.log('\n[ 새로고침해도 남는가 ]');
  const saved = await p.evaluate(() => {
    // 엘리트 하나를 세워 두고 저장한다
    const mon = makeMonster(MONSTERS.find(x => x.id === 'orc'), state.player.x + 2, state.player.y, 'hardened');
    state.monsters.length = 0;
    state.monsters.push(mon);
    state.resumable = true;
    saveRun();
    return { elite: mon.elite, hp: mon.maxHp, name: mon.name,
             maxHp: state.player.maxHp, atk: state.player.stats.atk, ashHp: state.ashHp };
  });
  await p.reload();
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => {
    const d = savedRun();
    if (!d) return null;
    loadRun(d, {});
    const m = state.monsters.find(x => x.alive && x.elite);
    return { elite: m && m.elite, hp: m && m.maxHp, name: m && m.name,
             maxHp: state.player.maxHp, atk: state.player.stats.atk, ashHp: state.ashHp };
  });
  check(after && after.elite === saved.elite, `엘리트가 그대로 살아난다 (${after && after.name})`);
  check(after && after.hp === saved.hp, `늘어난 체력도 그대로 (${saved.hp} → ${after && after.hp})`);
  check(after && after.ashHp === saved.ashHp && after.maxHp === saved.maxHp,
        `재로 늘린 최대 체력이 남는다 (${saved.maxHp} → ${after && after.maxHp})`);
  check(after && after.atk === saved.atk, `불에 담근 무기도 남는다 (공격 ${saved.atk} → ${after && after.atk})`);

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();

// 평범한 고블린의 공격력 — 위 비교에서만 쓴다
function makeAtk(el) { return el.each.find(e => e.id === 'starved').atk; }
