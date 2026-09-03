/* =========================================================
   test-classes.js — 클래스 무기 규칙 검증

   원거리는 **고른 사람이 정한다** — 마법사와 엘프만 쓰고, 둘 다
   첫 칸부터 손에 들고 시작한다. 기사·리자드·드워프에게는 아예 없는 조작이다.
   활은 엘프에게만 드랍된다.

   원거리 재사용 간격도 여기서 본다 — 쏜 다음 턴에는 못 쏘고,
   다른 행동을 하나 하면 돌아온다.
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

  console.log('\n[ 기사 — 원거리 완전 금지 ]');
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const kn = await p.evaluate(() => {
    UI.closeIntro();
    recalcStats(state.player);
    let bowDrops = 0;
    for (let i = 0; i < 300; i++) { const g = rollGear(10, 0); if (g && g.bow) bowDrops++; }
    const shot = rangedAttack(null);
    paintTouch();
    return { hero: currentHero().id, can: canRanged(), bowDrops, shot,
             aimShown: !document.getElementById('t-aim').hidden,
             label: document.getElementById('t-aim').textContent };
  });
  check(kn.hero === 'knight', '기본 캐릭터는 기사');
  check(kn.can === false, '원거리를 쓰는 사람이 아니다');
  check(kn.bowDrops === 0, '활이 드랍되지 않음 (300회)');
  check(kn.shot === false, 'rangedAttack 거부');
  check(kn.aimShown === true && kn.label === '공격',
        '기사에게도 「공격」 버튼은 보인다 — 근접으로 나간다');

  console.log('\n[ 엘프 — 처음부터 활 ]');
  const el = await p.evaluate(() => {
    chooseHero('elf');
    startRun();
    UI.closeIntro();
    const w = state.player.gear.weapon;
    const canFresh = canRanged();
    const pl = state.player;
    let spot = null;
    for (const [k, d] of Object.entries(DIRS)) {
      if (isWalkable(state.map, pl.x + d.dx * 2, pl.y + d.dy * 2)) { spot = [pl.x + d.dx * 2, pl.y + d.dy * 2]; break; }
    }
    let arrowFlew = false, hit = 0, shot = false, cdBlocked = null, cdBack = null;
    if (spot) {
      state.monsters.length = 0;
      const m = makeMonster(MONSTERS.find(x => x.id === 'goblin'), spot[0], spot[1]);
      m.hp = m.maxHp = 100; state.monsters.push(m);
      state.visible = computeFov(state.map, pl.x, pl.y, 8);
      shot = rangedAttack(null);
      arrowFlew = Render.arrows.length > 0;
      hit = 100 - m.hp;
      // 쏜 직후에는 손이 돌아오지 않았다
      spendPlayerTurn();                       // 쏜 턴의 소비
      cdBlocked = rangedAttack(null) === false && (100 - m.hp) === hit;
      /* 간격이 3 이라 두 턴을 쉬어야 돌아온다 (예전에는 2 — 한 턴이었다).
         원거리 둘과 근접 셋의 간격을 좁힌 것이 이 숫자였다 —
         사거리도 위력도 거의 안 움직였고 간격만 움직였다. */
      spendPlayerTurn();
      const cdStill = rangedAttack(null) === false;
      spendPlayerTurn();
      cdBack = cdStill && rangedAttack(null) === true && (100 - m.hp) > hit;
    }
    /* 검으로 바꿔도 여전히 쏜다 — 원거리는 이제 손에 든 것이 아니라
       고른 사람이 정하므로, 무기를 바꿨다고 조작이 사라지지 않는다.
       예전에는 활을 놓는 순간 못 쐈고, 그건 「무기를 잃으면 조작을 잃는」
       숨은 벌이었다. */
    pl.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(pl);
    const canWithSword = canRanged();
    let bowDrops = 0;
    for (let i = 0; i < 300; i++) { const g = rollGear(10, 0); if (g && g.bow) bowDrops++; }
    paintTouch();
    return { w: w && w.name, bow: w && !!w.bow, canFresh, shot, arrowFlew, hit,
             cdBlocked, cdBack, canWithSword, bowDrops,
             aimShown: !document.getElementById('t-aim').hidden };
  });
  check(el.w === '사냥 활' && el.bow, `사냥 활을 들고 시작 (${el.w})`);
  check(el.canFresh === true, '첫 칸부터 canRanged=true');
  check(el.shot === true && el.hit > 0, `화살로 피해를 줌 (${el.hit})`);
  check(el.arrowFlew, '화살 투사체가 날아감');
  check(el.cdBlocked === true, '쏜 다음 턴에는 손이 안 돌아옴 (턴도 안 씀)');
  check(el.cdBack === true, '한 턴 쉬면 다시 쏨');
  check(el.canWithSword === true, '검으로 바꿔도 쏜다 — 조작은 사람의 것이다');
  check(el.bowDrops > 0, `엘프에게는 활이 드랍됨 (300회 중 ${el.bowDrops})`);
  check(el.aimShown === true, '모바일 공격 버튼 보임');

  console.log('\n[ 직업에 맞는 무기가 더 자주 나온다 ]');
  /* 갈래가 여섯으로 갈렸다 (단검·검·창·도끼·활·지팡이).
     예전에는 근접이 통째로 blade 하나라 「맞는 무기」가 절반을 넘기 쉬웠는데,
     이제 근접만 넷이라 같은 잣대를 그대로 쓰면 안 된다 — 물어야 할 것은
     **자기 갈래가 제일 자주 나오는가**이지 절반을 넘는가가 아니다. */
  const KINDS = ['dagger', 'sword', 'spear', 'axe', 'bow', 'staff'];
  const KIND_NAME = { dagger:'단검', sword:'검', spear:'창', axe:'도끼', bow:'활', staff:'지팡이' };
  const drop = await p.evaluate((kinds) => {
    const out = {};
    for (const h of HEROES) {
      chooseHero(h.id);
      const c = {};
      for (const k of kinds) c[k] = 0;
      for (let i = 0; i < 3000; i++) {
        const g = rollGear(10, 0);
        const k = g && weaponKind(g);
        if (k && k in c) c[k]++;
      }
      const n = kinds.reduce((a, k) => a + c[k], 0);
      const pct = {};
      for (const k of kinds) pct[k] = n ? c[k] / n : 0;
      out[h.id] = { pct, likes: h.likes, raw: c, n };
    }
    return out;
  }, KINDS);
  for (const [id, d] of Object.entries(drop)) {
    const want = d.likes[0];
    const rest = KINDS.filter(k => k !== want);
    const line = KINDS.map(k => `${KIND_NAME[k]} ${(d.pct[k]*100).toFixed(0)}%`).join(' · ');
    check(rest.every(k => d.pct[want] > d.pct[k]), `${KIND_NAME[want]}이(가) 가장 자주 나온다 — ${id}: ${line}`);
    // 여섯이 고르게 나오면 17%. 세 배로 기울였으니 그 두 배는 넘어야 뜻이 있다.
    check(d.pct[want] > 0.34, `${id} — 자기 갈래가 무기 드랍의 3분의 1을 넘는다 (${(d.pct[want]*100).toFixed(0)}%)`);
  }
  // 잠그지는 않는다 — 노선을 갈아타는 판이 사라지면 안 된다
  check(drop.knight.raw.staff > 0, `기사도 지팡이를 만나기는 한다 (3000회 중 ${drop.knight.raw.staff})`);
  const wizardMelee = drop.wizard.raw.dagger + drop.wizard.raw.sword +
                      drop.wizard.raw.spear + drop.wizard.raw.axe;
  check(wizardMelee > 0, `마법사도 날붙이를 만나기는 한다 (3000회 중 ${wizardMelee})`);
  check(drop.knight.raw.bow === 0 && drop.wizard.raw.bow === 0, '활은 여전히 엘프에게만 나온다');

  console.log('\n[ 사거리 — 내가 먼저 쏠 자리가 있는가 ]');
  const rng = await p.evaluate(() => {
    // 사거리를 재는 자리라 원거리를 쓰는 사람이어야 한다
    chooseHero('elf'); startRun(); UI.closeIntro();
    state.player.gear.weapon = null; recalcStats(state.player);
    const plain = rangedRange();
    state.player.gear.weapon = makeGear(GEAR.find(g => g.name === '사냥 활'));
    const bow = rangedRange();
    return { plain, bow, mon: CFG.MONSTER_RANGE };
  });
  check(rng.plain > rng.mon,
        `사람이 원거리 몬스터보다 멀리 쏜다 (${rng.plain} vs ${rng.mon})`);
  check(rng.plain - rng.mon >= 2,
        `먼저 쏘고 물러설 자리가 두 칸 넘게 남는다 (${rng.plain - rng.mon}칸)`);
  check(rng.bow > rng.plain, `활은 한 칸 더 간다 (${rng.plain} → ${rng.bow})`);

  /* 예전에는 「마법사도 기억을 되찾아야 쏜다」를 쟀다. 그 기억(「던지던 손」)을
     없앴으므로 이제 재는 것이 다르다 — **1층에서 이미 쏠 수 있는가**다.
     고르는 화면에서 「처음부터 마법으로 싸운다」고 적어 두었으니 그게 첫 칸부터
     참이어야 한다. */
  console.log('\n[ 마법사 — 첫 칸부터 마법 ]');
  const wz = await p.evaluate(() => {
    chooseHero('wizard');
    startRun();
    UI.closeIntro();
    const w = state.player.gear.weapon;
    return { depth: state.depth, can: canRanged(), memories: state.memories.size,
             weapon: w && w.name, magic: isMagicAttack(state.player) };
  });
  check(wz.depth === 1, '1층에서 본다');
  check(wz.memories === 0, '되찾은 기억이 하나도 없는 상태');
  check(wz.can === true, '그래도 쏜다 — 기억이 아니라 사람이 정한다');
  check(wz.weapon === '낡은 지팡이', `지팡이를 들고 시작 (${wz.weapon})`);
  check(wz.magic === true, '주문이 공격보다 높다 — 처음부터 마법으로 싸운다');

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
