/* =========================================================
   test-thief.js — 여섯 번째 사람 검증

   도둑은 **다섯을 다 오른 사람에게만** 열린다. 그래서 이 검사는 두 번
   돈다 — 잠긴 채로 한 번, 연 뒤에 한 번. 잠금은 「안 보인다」로 끝나면
   안 되고 저장·선택·시작까지 전부 같은 답을 해야 한다.

   그 다음 두 가지 규칙을 본다:
     훔치기 — 때린 것에게서 금이 나온다. 한 마리에서 **한 번만**.
     표창   — 손에 든 것을 안 탄다. 단검을 벼려도 표창은 그대로다.

   두 번째가 이 사람의 뼈대다. 무기를 타면 「단검을 든 엘프」가 된다.
   ========================================================= */
const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

const unlock = () => {
  const save = loadData() || {};
  save.achievements = [...new Set([...(save.achievements || []), 'allHeroes'])];
  saveData(save);
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);

  console.log('\n[ 열기 전 — 없는 사람이다 ]');
  const locked = await p.evaluate(() => {
    UI.renderHeroPick();
    const shown = [...document.querySelectorAll('#hero-pick .hero')].map(b => b.dataset.hero);
    const took = chooseHero('thief');
    return { shown, took, cur: currentHero().id,
             pickable: pickableHeroes().map(h => h.id),
             inHeroes: HEROES.some(h => h.id === 'thief') };
  });
  check(locked.inHeroes, 'HEROES 에는 들어 있다');
  check(!locked.shown.includes('thief'), '고르는 자리에는 안 나온다');
  check(!locked.pickable.includes('thief'), 'pickableHeroes 에도 없다');
  check(locked.took === false, 'chooseHero 가 안 받는다');
  check(locked.cur !== 'thief', '저장에 밀어넣어도 도둑으로 안 선다');
  check(locked.shown.length === 5, '다섯만 보인다 — ' + locked.shown.join(', '));

  console.log('\n[ 저장에 억지로 박아 넣어도 ]');
  const forced = await p.evaluate(() => {
    const save = loadData() || {};
    save.hero = 'thief';            // 남의 저장을 옮겨 오거나 손으로 고친 경우
    saveData(save);
    return currentHero().id;
  });
  check(forced !== 'thief', '읽는 쪽도 막는다 — ' + forced + ' 로 선다');

  console.log('\n[ 다섯을 다 오르면 열린다 ]');
  const opened = await p.evaluate((src) => {
    eval('(' + src + ')()');
    UI.renderHeroPick();
    const shown = [...document.querySelectorAll('#hero-pick .hero')].map(b => b.dataset.hero);
    const took = chooseHero('thief');
    return { shown, took, cur: currentHero().id };
  }, unlock.toString());
  check(opened.shown.includes('thief'), '고르는 자리에 나온다');
  check(opened.took === true, 'chooseHero 가 받는다');
  check(opened.cur === 'thief', '도둑으로 선다');

  console.log('\n[ 자기가 자기 조건이 되지 않는다 ]');
  const base = await p.evaluate(() =>
    ({ n: BASE_HEROES.length, ids: BASE_HEROES.map(h => h.id), all: HEROES.length }));
  check(base.n === 5 && base.all === 6,
        '「모두의 탑」은 다섯만 센다 — ' + base.ids.join(', '));

  console.log('\n[ 판을 세운다 ]');
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const start = await p.evaluate(() => {
    UI.closeIntro();
    return { hero: currentHero().id, weapon: (state.player.gear.weapon || {}).name,
             can: canRanged(), hp: state.player.maxHp };
  });
  check(start.hero === 'thief', '도둑으로 시작한다');
  check(start.weapon === '낡은 단검', '단검을 들고 시작한다 — ' + start.weapon);
  check(start.can === true, '던질 줄 안다 (단검을 들고도)');

  console.log('\n[ 훔치기 — 한 마리에서 한 번 ]');
  const steal = await p.evaluate(() => {
    const pl = state.player;
    state.gold = 0;
    // 옆칸에 세워 두고 두 번 친다. 안 죽게 그릇을 키운다.
    const m = state.monsters.find(x => x.alive) ||
              (state.monsters.push(makeMonster(MONSTERS[0], pl.x + 1, pl.y)) && state.monsters.at(-1));
    m.x = pl.x + 1; m.y = pl.y; m.alive = true;
    m.maxHp = m.hp = 9999; m.robbed = false;
    const dir = { dx: 1, dy: 0 };
    attack(pl, m, dir, 1);
    const first = state.gold;
    attack(pl, m, dir, 1);
    const second = state.gold;
    // 다른 것에게서는 또 나온다
    const m2 = makeMonster(MONSTERS[0], pl.x - 1, pl.y);
    m2.maxHp = m2.hp = 9999;
    state.monsters.push(m2);
    attack(pl, m2, { dx: -1, dy: 0 }, 1);
    return { first, second, third: state.gold, depth: state.depth };
  });
  check(steal.first > 0, '때리면 금이 나온다 (+' + steal.first + ')');
  check(steal.second === steal.first, '같은 것을 또 때려도 안 나온다');
  check(steal.third > steal.second, '다른 것에게서는 또 나온다 (+' + (steal.third - steal.second) + ')');

  console.log('\n[ 표창은 손에 든 것을 안 탄다 ]');
  const star = await p.evaluate(() => {
    const pl = state.player;
    /* 같은 자리에 같은 몬스터를 세워 두고, 무기만 갈아서 두 번 던진다.
       위력에 굴림(0.85~1.15)이 있으므로 여러 번 재서 합으로 본다. */
    const run = (weapon) => {
      pl.gear.weapon = weapon;
      recalcStats(pl);
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const m = makeMonster(MONSTERS[0], pl.x + 3, pl.y);
        m.maxHp = m.hp = 99999;
        m.stats.def = 0; m.stats.md = 0;
        state.monsters = [m];
        state.rangedCd = 0;
        rangedAttack('right');
        sum += 99999 - m.hp;
      }
      return { sum, atk: pl.stats.atk };
    };
    const weak   = run(makeGear(GEAR.find(g => g.name === '낡은 단검')));
    const strong = run(makeGear(GEAR.find(g => g.name === '불씨 단검')));
    return { weak, strong };
  });
  const gap = star.strong.atk - star.weak.atk;
  check(gap > 0, '무기를 갈면 근접 공격은 오른다 (' + star.weak.atk + ' → ' + star.strong.atk + ')');
  const drift = Math.abs(star.strong.sum - star.weak.sum) / star.weak.sum;
  check(drift < 0.12,
        '그래도 표창은 그대로다 — 400회 합 ' + star.weak.sum + ' 대 ' + star.strong.sum +
        ' (차이 ' + (drift * 100).toFixed(0) + '%)');

  console.log('\n[ 엘프의 활과는 다른 길이다 ]');
  const elf = await p.evaluate(() => {
    const pl = state.player;
    const bow = GEAR.find(g => g.bow);
    return { bowOnlyElf: bow.only === 'elf',
             thiefGetsBow: (() => {
               let n = 0;
               for (let i = 0; i < 500; i++) { const g = rollGear(10, 0); if (g && g.bow) n++; }
               return n;
             })() };
  });
  check(elf.bowOnlyElf, '활은 여전히 엘프 전용');
  check(elf.thiefGetsBow === 0, '도둑에게는 활이 안 나온다 (500회)');

  console.log('\n에러: ' + (errs.length ? errs.join(' / ') : '없음'));
  if (errs.length) fails += errs.length;
  console.log(fails ? '\n실패 ' + fails + '건' : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
