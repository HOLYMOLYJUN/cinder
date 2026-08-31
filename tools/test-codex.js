/* 잿불 — 도감과 업적 검증

   도감의 핵심은 "만난 것만 보인다"이다.
   해금 전에 정보가 새면 처음 보는 적 앞에서 판단할 이유가 사라진다.
   그래서 잠긴 항목이 이름조차 흘리지 않는지부터 확인한다. */

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

  /* ---------- 1. 처음에는 전부 잠겨 있다 ---------- */
  console.log('\n[ 해금 전 ]');
  await page.click('#btn-codex');
  await page.waitForTimeout(300);
  check(await page.isVisible('#codex-screen'), '도감이 열림');

  const locked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#codex-monsters tr')];
    return {
      total: rows.length - 1,
      lockedCount: rows.filter(r => r.classList.contains('locked')).length,
      text: document.getElementById('codex-monsters').textContent,
    };
  });
  check(locked.lockedCount === MONSTER_COUNT(locked.total), `몬스터 ${locked.lockedCount}종 전부 잠김`);
  check(!/고블린|오크|해골/.test(locked.text), '잠긴 항목은 이름조차 새지 않음');

  const itemsLocked = await page.evaluate(() =>
    document.getElementById('codex-items').textContent);
  check(!/단검|지팡이|갑옷/.test(itemsLocked), '아이템 도감도 이름이 새지 않음');

  /* ---------- 2. 탭 전환 ---------- */
  console.log('\n[ 탭 ]');
  for (const t of ['monsters', 'items', 'memories', 'achievements', 'keys']) {
    await page.click(`#codex-tabs [data-tab="${t}"]`);
    await page.waitForTimeout(80);
    const shown = await page.evaluate(t =>
      !document.querySelector(`.codex-body [data-panel="${t}"]`).hidden, t);
    check(shown, `${t} 탭이 열림`);
  }
  await page.click('#codex-tabs [data-tab="achievements"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOT + '/17-codex-locked.png' });

  /* ---------- 3. 마주치면 해금된다 ---------- */
  console.log('\n[ 해금 ]');
  await page.evaluate(() => UI.hideCodex());
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  const unlocked = await page.evaluate(() => {
    rememberMonster('goblin');
    rememberMonster('orc');
    rememberGear(GEAR.find(g => g.name === '짧은 검'));
    UI.showCodex('monsters');
    const rows = [...document.querySelectorAll('#codex-monsters tr')];
    return {
      open: rows.filter(r => !r.classList.contains('locked')).length - 1,
      hasGoblin: /고블린/.test(document.getElementById('codex-monsters').textContent),
      thumbs: document.querySelectorAll('#codex-monsters img.cx-thumb').length,
      itemText: document.getElementById('codex-items').textContent,
    };
  });
  check(unlocked.open === 2, `마주친 2종만 열림 (${unlocked.open})`);
  check(unlocked.hasGoblin, '해금된 몬스터의 이름이 보임');
  check(unlocked.thumbs === 2, `해금된 항목에 그림이 붙음 (${unlocked.thumbs}개)`);
  check(/짧은 검/.test(unlocked.itemText), '손에 넣은 장비가 아이템 도감에 남음');
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOT + '/18-codex-monsters.png' });

  /* ---------- 4. 업적 ---------- */
  console.log('\n[ 업적 ]');
  await page.evaluate(() => UI.hideCodex());

  const ach1 = await page.evaluate(() => {
    unlockAch('first');
    return (loadData().achievements || []);
  });
  check(ach1.includes('first'), '업적이 저장됨');

  const toast = await page.evaluate(() => {
    unlockAch('deep10');
    return document.querySelectorAll('#toasts .toast').length;
  });
  check(toast >= 1, '달성하면 알림이 뜸');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT + '/19-toast.png' });

  const dup = await page.evaluate(() => {
    const before = (loadData().achievements || []).length;
    unlockAch('first');            // 이미 가진 것
    unlockAch('first');
    return { before, after: (loadData().achievements || []).length };
  });
  check(dup.before === dup.after, '이미 가진 업적은 다시 쌓이지 않음');

  // 수집 업적은 도감이 다 차야 열린다
  const collect = await page.evaluate(() => {
    const save = loadData();
    save.codex = MONSTERS.map(m => m.id);
    saveData(save);
    checkCollectionAchievements();
    return (loadData().achievements || []).includes('bestiary');
  });
  check(collect, '모든 몬스터를 만나면 「명부를 채우다」 달성');

  const notYet = await page.evaluate(() => (loadData().achievements || []).includes('armory'));
  check(!notYet, '장비를 다 모으기 전에는 「재의 창고」가 잠겨 있음');

  /* ---------- 5. 달성한 것이 도감에 표시되는가 ---------- */
  const shown = await page.evaluate(() => {
    UI.showCodex('achievements');
    const rows = [...document.querySelectorAll('.ach-row')];
    return {
      total: rows.length,
      got: rows.filter(r => r.classList.contains('got')).length,
      tabLabel: document.querySelector('#codex-tabs [data-tab="achievements"]').textContent,
    };
  });
  check(shown.total === (await page.evaluate(() => ACHIEVEMENTS.length)),
        `업적 목록 ${shown.total}개`);
  check(shown.got === 3, `달성한 3개가 표시됨 (${shown.got})`);
  check(/3\//.test(shown.tabLabel), '탭에 달성 개수가 보임: ' + shown.tabLabel);
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOT + '/20-codex-ach.png' });

  /* ---------- 6. 새로고침 후에도 남는가 ---------- */
  await page.reload();
  await page.waitForTimeout(800);
  const kept = await page.evaluate(() => {
    const s = loadData();
    return { ach: (s.achievements || []).length, codex: (s.codex || []).length,
             total: MONSTERS.length };
  });
  check(kept.ach === 3 && kept.codex === kept.total,
        `새로고침 뒤에도 남음 (업적 ${kept.ach}, 도감 ${kept.codex})`);

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');
  if (errors.length) fails++;

  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();

function MONSTER_COUNT(total) { return total; }
