/* =========================================================
   test-classes.js — 클래스 무기 규칙 검증

   기사는 원거리가 통째로 없고(기억이 있어도), 대신 「던지던 손」이
   완력(공격 +2)으로 붙는다. 엘프는 활을 들고 시작해 기억 없이 쏘고,
   활은 엘프에게만 드랍된다. 마법사(비근접)는 기존 기억 경로 그대로다.

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
    state.memories = new Set(['throw']);
    recalcStats(state.player);
    const canWithMem = canRanged();
    const atkWithThrow = state.player.stats.atk;
    state.memories = new Set([]);
    recalcStats(state.player);
    const atkBase = state.player.stats.atk;
    grantThrowIfDue(5);
    const granted = state.memories.has('throw');
    let bowDrops = 0;
    for (let i = 0; i < 300; i++) { const g = rollGear(10, 0); if (g && g.bow) bowDrops++; }
    const shot = rangedAttack(null);
    paintTouch();
    return { hero: currentHero().id, canWithMem, granted, bowDrops, shot,
             aimHidden: document.getElementById('t-aim').hidden,
             atkBase, atkWithThrow };
  });
  check(kn.hero === 'knight', '기본 캐릭터는 기사');
  check(kn.canWithMem === false, '「던지던 손」이 있어도 canRanged=false');
  check(kn.atkWithThrow === kn.atkBase + 2, `기사의 「던지던 손」은 공격 +2 (${kn.atkBase} → ${kn.atkWithThrow})`);
  check(kn.granted === false, '3층 보장 지급을 건너뜀');
  check(kn.bowDrops === 0, '활이 드랍되지 않음 (300회)');
  check(kn.shot === false, 'rangedAttack 거부');
  check(kn.aimHidden === true, '모바일 원거리 버튼 숨김');

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
      // 한 턴 다른 일을 하면 돌아온다
      spendPlayerTurn();
      cdBack = rangedAttack(null) === true && (100 - m.hp) > hit;
    }
    pl.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(pl);
    const canWithSword = canRanged();
    state.memories = new Set(['throw']);
    const canThrow = canRanged();
    state.memories = new Set([]);
    let bowDrops = 0;
    for (let i = 0; i < 300; i++) { const g = rollGear(10, 0); if (g && g.bow) bowDrops++; }
    paintTouch();
    return { w: w && w.name, bow: w && !!w.bow, canFresh, shot, arrowFlew, hit,
             cdBlocked, cdBack, canWithSword, canThrow, bowDrops,
             aimHidden: document.getElementById('t-aim').hidden };
  });
  check(el.w === '사냥 활' && el.bow, `사냥 활을 들고 시작 (${el.w})`);
  check(el.canFresh === true, '기억 없이도 canRanged=true');
  check(el.shot === true && el.hit > 0, `화살로 피해를 줌 (${el.hit})`);
  check(el.arrowFlew, '화살 투사체가 날아감');
  check(el.cdBlocked === true, '쏜 다음 턴에는 손이 안 돌아옴 (턴도 안 씀)');
  check(el.cdBack === true, '한 턴 쉬면 다시 쏨');
  check(el.canWithSword === false, '검으로 바꾸면 (기억 없이) 못 쏨');
  check(el.canThrow === true, '「던지던 손」이 있으면 검으로도 던짐');
  check(el.bowDrops > 0, `엘프에게는 활이 드랍됨 (300회 중 ${el.bowDrops})`);
  check(el.aimHidden === false, '모바일 원거리 버튼 보임');

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
    chooseHero('lizard'); startRun(); UI.closeIntro();
    state.memories = new Set(['throw']);
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

  console.log('\n[ 마법사 — 기존 기억 경로 유지 ]');
  const wz = await p.evaluate(() => {
    chooseHero('wizard');
    startRun();
    UI.closeIntro();
    const before = canRanged();
    grantThrowIfDue(5);
    return { before, granted: state.memories.has('throw'), after: canRanged() };
  });
  check(wz.before === false, '기억 전에는 못 쏨');
  check(wz.granted === true, '3층 보장은 그대로');
  check(wz.after === true, '기억 후에는 쏨');

  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
