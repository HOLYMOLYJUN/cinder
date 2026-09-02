/* 잿불 — 기억 시스템 검증
   봇이 우연히 고대의 장비를 줍기를 기다릴 수 없으므로,
   기억을 직접 쥐여주고 각 효과가 실제로 도는지 확인한다. */

const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
const SHOT = __dirname + '/shots';
require('fs').mkdirSync(SHOT, { recursive: true });

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

  /* ---------- 1. 처음에는 아무 기억도 없다 ---------- */
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  // 기본 캐릭터(기사)는 원거리가 통째로 없다 — 기억 검증은 리자드로 돈다
  await page.evaluate(() => { chooseHero('lizard'); startRun(); UI.closeIntro(); });
  // running 은 연출이 닫힌 뒤에야 true 가 된다
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  /* 이제 다섯 사람 모두 무기를 하나 들고 시작하므로(heroes.js 의 startWeapon)
     스탯이 baseStats() 와 같을 수가 없다. 물어야 할 것은 「기억이 없을 때
     기억만큼의 값이 안 붙는가」이지 「맨몸 값인가」가 아니다 —
     그래서 시작 장비까지 더한 값을 기준선으로 삼는다. */
  const fresh = await page.evaluate(() => {
    const want = baseStats();
    for (const slot of SLOTS) {
      const g = state.player.gear[slot];
      if (!g) continue;
      for (const [k, n] of Object.entries(g.mod)) want[k] = (want[k] || 0) + n;
    }
    return {
      mem: [...state.memories], pity: state.pity,
      stats: { ...state.player.stats }, maxHp: state.player.maxHp,
      base: baseStats(), want,
      weapon: state.player.gear.weapon ? state.player.gear.weapon.name : '맨손',
    };
  });
  check(fresh.mem.length === 0, '새 판은 기억 0개로 시작');
  check(fresh.stats.spd === fresh.want.spd && fresh.maxHp === fresh.want.maxHp,
        `기억 없을 때는 시작 장비 값만 붙는다 (${fresh.weapon} — 속${fresh.stats.spd} 체${fresh.maxHp})`);

  /* ---------- 2. 원거리는 잠겨 있다 ---------- */
  const lockedRanged = await page.evaluate(() => {
    const p = state.player;
    for (const [k, d] of Object.entries(DIRS)) {
      if (isWalkable(state.map, p.x + d.dx, p.y + d.dy)) {
        const before = state.turns;
        playerAction(k, 'ranged');
        return { spentTurn: state.turns !== before };
      }
    }
    return null;
  });
  check(lockedRanged && !lockedRanged.spentTurn, '기억 전에는 원거리가 턴도 쓰지 않음');

  /* ---------- 3. 기억을 전부 쥐여주면 효과가 붙는가 ---------- */
  const withAll = await page.evaluate(() => {
    state.memories = new Set(MEMORIES.map(m => m.id));
    recalcStats(state.player);
    return { stats: { ...state.player.stats }, maxHp: state.player.maxHp };
  });
  check(withAll.stats.spd === fresh.want.spd + 2, `「오르던 발」 속도 +2 반영 (${withAll.stats.spd})`);
  check(withAll.maxHp === fresh.base.maxHp + 10, `「첫 번째 이름」 최대 체력 +10 반영 (${withAll.maxHp})`);

  /* ---------- 4. 원거리가 실제로 맞는가 ----------
     원거리는 더 이상 기억이 열지 않는다 — 쓰는 사람으로 본다. */
  const setup = await page.evaluate(() => {
    chooseHero('elf'); startRun(); UI.closeIntro();
    state.running = true; state.awaitingInput = true;
    const p = state.player;
    for (const [k, d] of Object.entries(DIRS)) {
      let clear = true;
      for (let i = 1; i <= 3; i++)
        if (!isWalkable(state.map, p.x + d.dx*i, p.y + d.dy*i)) clear = false;
      if (!clear) continue;
      const mon = makeMonster(MONSTERS.find(m => m.id === 'troll'), p.x + d.dx*3, p.y + d.dy*3);
      state.monsters.push(mon);
      return { dir: k, hp: mon.hp };
    }
    return null;
  });
  if (setup) {
    const KEY = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight' };
    await page.keyboard.down('z');
    await page.keyboard.press(KEY[setup.dir]);
    await page.keyboard.up('z');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() =>
      state.monsters[state.monsters.length - 1].hp);
    check(after < setup.hp, `3칸 밖 트롤에게 명중 (${setup.hp} → ${after})`);
    await page.screenshot({ path: SHOT + '/11-ranged.png' });
  } else {
    check(false, '원거리를 시험할 직선 통로를 못 찾음');
  }

  /* ---------- 4b. 기억을 다 되찾아도 근접은 근접이다 ----------
     예전에는 「던지던 손」이 기사에게 완력(공격 +2)으로 붙는 것을 재었다.
     그 기억을 없앨으므로 이젠 물을 것이 다르다 — **기억으로는 원거리가
     열리지 않는가**이다. 조작이 기억에 달려 있지 않다는 것이 새 규칙이므로,
     하나도 빠짐없이 되찾은 기사도 여전히 못 쏴야 한다. */
  const kn = await page.evaluate(() => {
    chooseHero('knight');
    startRun();
    UI.closeIntro();
    state.memories = new Set(MEMORIES.map(m => m.id));
    recalcStats(state.player);
    const can = canRanged();
    // 다음 절을 위해 리자드로 되돌린다
    chooseHero('lizard');
    startRun();
    UI.closeIntro();
    state.memories = new Set(MEMORIES.map(m => m.id));
    recalcStats(state.player);
    return { can };
  });
  check(kn.can === false, '기억을 다 되찾아도 기사는 못 쏴다');
  check(kn.can === false, '기사는 기억이 있어도 원거리를 못 쓴다');

  /* ---------- 5. 불씨 밝기 ---------- */
  const ember = await page.evaluate(() => {
    const base = state.fovRadius;
    toggleEmber(); const bright = state.fovRadius; const sightBright = monsterSight();
    toggleEmber(); const dim = state.fovRadius; const sightDim = monsterSight();
    toggleEmber();
    return { base, bright, dim, sightBright, sightDim };
  });
  check(ember.bright > ember.base && ember.dim < ember.base,
        `「끄던 손」 시야 조절 (어둡게 ${ember.dim} / 기본 ${ember.base} / 밝게 ${ember.bright})`);
  check(ember.sightBright > ember.sightDim,
        `밝히면 몬스터도 더 멀리서 알아챔 (${ember.sightDim} → ${ember.sightBright})`);

  /* ---------- 6. 부활 ---------- */
  const revive = await page.evaluate(() => {
    state.revived = false;
    state.player.hp = 1;
    kill(state.player);
    const first = { alive: state.player.alive, hp: state.player.hp, revived: state.revived };
    state.player.hp = 1;
    kill(state.player);                       // 두 번째는 진짜 죽어야 한다
    return { first, second: { alive: state.player.alive } };
  });
  check(revive.first.alive && revive.first.hp > 1,
        `「남겨진 온기」 첫 죽음에서 일어남 (체력 ${revive.first.hp})`);
  check(!revive.second.alive, '두 번째 죽음은 그대로 끝남');

  /* ---------- 7. 기억 연출 ---------- */
  await page.evaluate(() => {
    UI.hideResult();
    const m = MEMORIES.find(x => x.id === 'douse');
    UI.showCurtain(m.name, m.line, m.effect, () => {});
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: SHOT + '/12-memory-curtain.png' });
  const curtainTitle = await page.textContent('#intro-floor');
  check(curtainTitle.trim() === '끄던 손', '기억 되찾는 연출이 뜸: ' + curtainTitle.trim());

  /* ---------- 8. 저장과 복원 ---------- */
  await page.evaluate(() => {
    UI.closeIntro();
    state.memories = new Set(['climb', 'douse']);
    state.pity = 3;
    persist();
  });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(900);
  const restored = await page.evaluate(() => {
    const s = loadData();
    startRun();
    return { saved: s.memories, pity: s.pity, inGame: [...state.memories], statePity: state.pity };
  });
  check(restored.saved.length === 2 && restored.inGame.length === 2,
        '기억이 새로고침 뒤에도 남음: ' + restored.inGame.join(', '));
  check(restored.statePity === 3, '누적 확률 보정값도 복원됨 (pity ' + restored.statePity + ')');

  /* ---------- 9. 내 기억 화면 (도감의 한 탭) ---------- */
  await page.evaluate(() => { UI.showCodex('memories'); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT + '/13-memory-list.png' });
  // 기억 수는 속에서 직접 세어 온다 — 숫자를 박아 두면 늘릴 때마다 시험이 깨진다
  const MEMORIES_N = await page.evaluate(() => MEMORIES.length);
  const shown = await page.$$eval('.mem-row', els => ({
    total: els.length,
    got: els.filter(e => e.classList.contains('got')).length,
    hidden: els.filter(e => !e.classList.contains('got'))
              .map(e => e.textContent.trim())[0],
  }));
  check(shown.total === MEMORIES_N && shown.got === 2, `기억 목록 ${MEMORIES_N}개 중 2개 해금 (${shown.got})`);
  check(/기억나지 않/.test(shown.hidden), '못 얻은 기억은 내용이 가려짐');

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');
  if (errors.length) fails++;

  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
