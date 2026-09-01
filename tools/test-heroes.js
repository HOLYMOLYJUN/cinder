const { chromium } = require('playwright');
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(900);

  console.log('\n[ 캐릭터 선택 ]');
  const list = await p.$$eval('.hero', els => els.map(e => e.querySelector('.hero-name').textContent));
  check(list.length === 5, `${list.length}명 표시: ${list.join(', ')}`);
  check(await p.$$eval('.hero img.hero-img', e => e.length) === 5, '전부 그림이 붙어 있다');
  check((await p.$$('.hero.on')).length === 1, '하나가 선택된 상태로 시작');
  await p.screenshot({ path: __dirname + '/shots/26-heroes.png' });

  // 마법사를 고르면 처음부터 마법으로 싸운다
  await p.click('.hero[data-hero="wizard"]');
  await p.waitForTimeout(150);
  const picked = await p.evaluate(() => ({ saved: (loadData()||{}).hero, say: document.getElementById('hero-say').textContent }));
  check(picked.saved === 'wizard', '고른 사람이 저장됨');

  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const wiz = await p.evaluate(() => ({
    stats: { ...state.player.stats }, maxHp: state.player.maxHp,
    magic: isMagicAttack(state.player), sprite: heroSprite(),
  }));
  console.log('  마법사 —', JSON.stringify(wiz.stats), 'maxHp', wiz.maxHp);
  check(wiz.magic, '마법사는 무기 없이도 처음부터 마법으로 싸운다');
  check(wiz.sprite === 'hero.wizard', '그림도 마법사로 바뀜: ' + wiz.sprite);
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/shots/27-wizard.png' });

  // 리자드는 단단하고 느리다
  const liz = await p.evaluate(() => {
    chooseHero('lizard'); startRun();
    return { stats: { ...state.player.stats }, maxHp: state.player.maxHp, magic: isMagicAttack(state.player) };
  });
  console.log('  리자드 —', JSON.stringify(liz.stats), 'maxHp', liz.maxHp);
  check(liz.maxHp > wiz.maxHp && liz.stats.def > wiz.stats.def, '리자드가 더 단단하다');
  check(!liz.magic, '리자드는 물리로 싸운다');

  // 마지막 보스가 내 얼굴을 하고 있는가
  const keeper = await p.evaluate(() => {
    enterFloor(15); UI.closeIntro();
    return { boss: state.boss.name, key: state.boss.defId === 'keeper' ? heroSprite() : null };
  });
  check(keeper.key === 'hero.lizard', `최종 보스가 내 그림을 쓴다 (${keeper.boss} → ${keeper.key})`);

  /* 물약 한도 — 이제 고정값이 아니라 산 주머니만큼 늘어난다.
     한도만 낮추고 늘릴 길을 안 두면 후반 상점에 살 게 장비뿐이라
     안식처가 그냥 지나가는 층이 된다. */
  const pot = await p.evaluate(() => {
    state.pouches = 0;
    const base = potionMax();
    state.pouches = 1; const one = potionMax();
    state.pouches = POUCH_MAX; const full = potionMax();
    state.pouches = 0;
    return { base, one, full, heal: POTION_HEAL, gain: POUCH_GAIN, max: POUCH_MAX };
  });
  check(pot.base === 5, `맨몸 물약 한도 ${pot.base}개`);
  check(pot.heal === 8, `한 병이 채우는 체력 ${pot.heal}`);
  check(pot.one === pot.base + pot.gain, `주머니 하나에 +${pot.gain} (${pot.base} → ${pot.one})`);
  check(pot.full === pot.base + pot.gain * pot.max,
        `주머니는 ${pot.max}개까지 — 끝까지 사도 ${pot.full}개 (예전 10개보다 적다)`);

  console.log('\n에러:', errs.length ? errs.join('\n') : '없음');
  if (errs.length) fails++;
  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
