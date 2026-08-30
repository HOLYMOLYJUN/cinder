/* 잿불 — 레벨업 검증

   레벨은 판 안에서만 사는 성장이다. 그래서 확인할 것이 셋이다.
     1) 경험치가 실제로 쌓이고 레벨이 오르는가
     2) 오른 만큼 스탯이 붙고, 마법/물리 판정이 뒤집히지 않는가
     3) 판이 끝나면 사라지고, 이어하기로는 남는가

   두 번째가 이 시스템에서 제일 부서지기 쉬운 곳이다 —
   레벨이 공격만 올리면 8레벨 기사에게 주술 지팡이가 함정 아이템이 된다. */

const { chromium } = require('playwright');
const GAME = 'file:///c:/Users/vlck1/Desktop/dev/game/index.html';

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(GAME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  /* ---------- 1. 오르는가 ---------- */
  console.log('\n[ 오르는가 ]');
  const start = await page.evaluate(() => ({
    level: state.level, xp: state.xp,
    atk: state.player.stats.atk, maxHp: state.player.maxHp,
  }));
  check(start.level === 1 && start.xp === 0, '판을 시작하면 1레벨 0경험치');

  const one = await page.evaluate(() => {
    gainXp(LV.need(1) - 1);
    return { level: state.level, xp: state.xp };
  });
  check(one.level === 1, '한 점 모자라면 오르지 않음');

  const two = await page.evaluate(() => {
    gainXp(1);
    return { level: state.level, xp: state.xp,
             atk: state.player.stats.atk, maxHp: state.player.maxHp };
  });
  check(two.level === 2, '채우면 오름');
  check(two.xp === 0, '남은 경험치는 다음 레벨로 넘어감');
  check(two.maxHp > start.maxHp, `최대 체력이 늘어남 (${start.maxHp} → ${two.maxHp})`);

  const many = await page.evaluate(() => {
    const before = state.level;
    gainXp(9999);
    return { before, after: state.level, max: LV.MAX };
  });
  check(many.after > many.before + 1, `한 번에 여러 레벨이 오름 (${many.before} → ${many.after})`);
  check(many.after <= many.max, `최대치를 넘지 않음 (${many.after} / ${many.max})`);

  /* ---------- 2. 지팡이가 여전히 지팡이인가 ---------- */
  console.log('\n[ 마법·물리 순서 ]');
  const staffs = await page.evaluate(() => {
    const out = [];
    for (const h of HEROES) {
      chooseHero(h.id);
      for (const lv of [1, 5, 10, 15, 20]) {
        state.level = lv;
        const p = makePlayer();
        p.gear = { weapon: null, armor: null, trinket: null };
        recalcStats(p);
        const barehandMagic = isMagicAttack(p);
        // 지팡이만 본다. 「불씨 검」처럼 주문이 붙은 검은 물리로 남는 게 맞다.
        for (const g of GEAR.filter(x => x.slot === 'weapon' && x.mod.sp && !x.mod.atk)) {
          p.gear.weapon = makeGear(g);
          recalcStats(p);
          if (!isMagicAttack(p)) out.push(`${h.name} ${lv}레벨 · ${g.name}`);
        }
        p.gear.weapon = null;
        recalcStats(p);
        if (isMagicAttack(p) !== barehandMagic) out.push(`${h.name} ${lv}레벨 · 맨손 판정이 바뀜`);
      }
    }
    chooseHero('knight');
    state.level = 1;
    return out;
  });
  check(staffs.length === 0,
        staffs.length ? '레벨이 오르면 죽는 지팡이: ' + staffs.join(', ')
                      : '어느 사람이 몇 레벨이어도 지팡이는 마법으로 바뀜');

  /* ---------- 3. 사람마다 다르게 자라는가 ---------- */
  console.log('\n[ 사람마다 ]');
  const grown = await page.evaluate(() => {
    const out = {};
    for (const h of HEROES) {
      chooseHero(h.id);
      state.level = 12;
      const p = makePlayer();
      p.gear = { weapon: null, armor: null, trinket: null };
      recalcStats(p);
      out[h.name] = { hp: p.maxHp, atk: p.stats.atk, def: p.stats.def,
                      md: p.stats.md, spd: p.stats.spd };
    }
    chooseHero('knight');
    state.level = 1;
    return out;
  });
  console.log('    12레벨 스탯:', JSON.stringify(grown, null, 0).replace(/","/g, '", "'));
  const hps = Object.values(grown).map(g => g.hp);
  check(new Set(hps).size > 1, '사람마다 체력이 다르게 자람');
  check(grown['리자드'].hp > grown['마법사'].hp, '리자드가 마법사보다 두껍게 자람');
  check(grown['마법사'].md > grown['기사'].md, '마법사가 마방을 더 얻음');

  /* ---------- 4. 판이 끝나면 사라진다 ---------- */
  console.log('\n[ 판을 넘어가는가 ]');
  const reset = await page.evaluate(() => {
    state.level = 9; state.xp = 40;
    startRun();
    return { level: state.level, xp: state.xp };
  });
  check(reset.level === 1 && reset.xp === 0, '새 판은 1레벨부터 — 레벨은 판을 넘지 않음');

  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const saved = await page.evaluate(() => {
    gainXp(LV.need(1) + LV.need(2) + 5);
    saveRun();
    return { level: state.level, xp: state.xp, maxHp: state.player.maxHp,
             atk: state.player.stats.atk };
  });
  await page.reload();
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => {
    resumeRun();
    return { level: state.level, xp: state.xp, maxHp: state.player.maxHp,
             atk: state.player.stats.atk };
  });
  check(back.level === saved.level && back.xp === saved.xp,
        `이어하기로 레벨이 돌아옴 (${back.level}레벨 ${back.xp}점)`);
  check(back.maxHp === saved.maxHp && back.atk === saved.atk,
        `레벨로 오른 스탯도 그대로 (체력 ${back.maxHp}, 공격 ${back.atk})`);

  /* ---------- 5. 화면에 보이는가 ---------- */
  console.log('\n[ 화면 ]');
  const hud = await page.evaluate(() => {
    gainXp(1);
    return {
      level: document.getElementById('stat-level').textContent,
      width: document.getElementById('xp-fill').style.width,
      state: state.level,
    };
  });
  check(hud.level === String(hud.state), `HUD 에 레벨이 보임 (${hud.level})`);
  check(/%/.test(hud.width), '경험치 막대가 채워짐: ' + hud.width);

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');
  if (errors.length) fails++;

  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
