/* =========================================================
   heroes.js — 고를 수 있는 사람들

   고르는 것이 의미가 있으려면 숫자가 아니라 "플레이가" 달라야 한다.
   그래서 마법사는 처음부터 주문이 공격보다 높다 —
   시작하자마자 마법으로 싸우고, 방어가 두꺼운 적에게 강하고,
   마방을 가진 적에게 약하다. 무기를 줍기 전부터 다른 게임이 된다.

   grow 는 레벨이 오를 때마다 붙는 값이다. 소수로 적어 두고 누적해서 내림하므로
   0.5 는 두 레벨에 1, 0.34 는 세 레벨에 1이 붙는다는 뜻이다.
   pow 는 공격과 주문에 함께 붙는다 — 자세한 이유는 js/levels.js 머리말에.

   그림은 전부 0x72 Dungeon Tileset II 에 들어 있는 것이다.
   ========================================================= */

const HEROES = [
  {
    id: 'knight', name: '기사', sprite: 'knight_m',
    line: '무엇을 지키던 사람이었는지는 기억나지 않는다.',
    note: '원거리를 쓰지 않는다. 대신 단단하고, 맞부딪히면 세다.',
    // 난이도: 표준. 아래 리자드·드워프가 도전, 마법사가 입문이다 — README 밸런싱 절 참고.
    /* melee: 원거리 자체가 없다. 활도 지팡이 던지기도 아니고 Z 가 통째로 없다 —
       대신 기본기와 성장이 한 급 위다. 「던지던 손」은 기사에겐 완력으로 붙는다. */
    melee: true,
    base: { atk: 8, sp: 0, def: 3, md: 1, spd: 10, maxHp: 50 },
    grow: { pow: 0.70, maxHp: 4.8, def: 0.40, md: 0.30 },
  },
  {
    id: 'elf', name: '엘프', sprite: 'elf_f',
    line: '발이 먼저 기억한다.',
    note: '활을 들고 시작한다. 빠르지만 얇다.',
    // 활은 엘프의 정체성이라 처음부터 쥐여 준다. 고르는 순간 다른 게임이 되도록.
    startWeapon: '사냥 활',
    base: { atk: 5, sp: 0, def: 1, md: 1, spd: 13, maxHp: 30 },
    grow: { pow: 0.54, maxHp: 2.4, def: 0.20, md: 0.20, spd: 0.14 },
  },
  {
    id: 'wizard', name: '마법사', sprite: 'wizzard_m',
    line: '불을 다루던 손이 아직 뜨겁다.',
    note: '처음부터 마법으로 싸운다. 다섯 중 가장 순하다 — 처음 오른다면 이쪽.',
    base: { atk: 3, sp: 8, def: 0, md: 4, spd: 10, maxHp: 30 },
    grow: { pow: 0.56, maxHp: 2.6, def: 0.12, md: 0.38 },
  },
  {
    id: 'lizard', name: '리자드', sprite: 'lizard_m',
    line: '비늘이 재를 견딘다.',
    note: '단단하고 느리다. 맞아가며 밀고 올라간다.',
    base: { atk: 6, sp: 0, def: 4, md: 1, spd: 8, maxHp: 52 },
    grow: { pow: 0.55, maxHp: 5.8, def: 0.62, md: 0.12 },
  },
  {
    id: 'dwarf', name: '드워프', sprite: 'dwarf_f',
    line: '깊은 곳이라면 익숙하다.',
    note: '묵직하게 때린다. 대신 굼뜨다.',
    base: { atk: 8, sp: 0, def: 2, md: 0, spd: 8, maxHp: 46 },
    grow: { pow: 0.88, maxHp: 5.2, def: 0.45, md: 0.20 },
  },
];

// 지금 고른 사람. 저장에 남아 다음에도 그대로 시작한다.
/* 관전 중에는 남의 사람으로 스탯을 세워야 한다. 그렇다고 chooseHero 를 부르면
   관전자의 저장값에 그 사람이 박혀 버린다 — 남의 판을 보다가 내 캐릭터가 바뀌는 셈이다.
   그래서 저장하지 않고 잠깐 덮어쓰는 자리를 따로 둔다. */
let heroOverride = null;

function setHeroOverride(id) {
  heroOverride = id ? (HEROES.find(h => h.id === id) || null) : null;
}

function currentHero() {
  if (heroOverride) return heroOverride;
  const save = loadData() || {};
  return HEROES.find(h => h.id === save.hero) || HEROES[0];
}

function chooseHero(id) {
  const save = loadData() || {};
  save.hero = id;
  saveData(save);
}

// 그림 열쇠. 마지막 보스도 이걸 그대로 쓴다 — 당신의 얼굴을 하고 있으므로.
function heroSprite() {
  return 'hero.' + currentHero().id;
}
