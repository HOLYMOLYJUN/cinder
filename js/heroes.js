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
    // 상자에서 더 자주 나올 무기 갈래 (items.js 의 weaponKind 와 같은 이름)
    likes: ['blade'],
    base: { atk: 8, sp: 0, def: 3, md: 1, spd: 10, maxHp: 50 },
    grow: { pow: 0.70, maxHp: 4.8, def: 0.40, md: 0.30 },
  },
  {
    id: 'elf', name: '엘프', sprite: 'elf_f',
    line: '발이 먼저 기억한다.',
    note: '활을 들고 시작한다. 빠르지만 얇다.',
    // 활은 엘프의 정체성이라 처음부터 쥐여 준다. 고르는 순간 다른 게임이 되도록.
    startWeapon: '사냥 활',
    likes: ['bow'],
    base: { atk: 5, sp: 0, def: 1, md: 1, spd: 13, maxHp: 30 },
    grow: { pow: 0.54, maxHp: 2.4, def: 0.20, md: 0.20, spd: 0.14 },
  },
  {
    id: 'wizard', name: '마법사', sprite: 'wizzard_m',
    line: '불을 다루던 손이 아직 뜨겁다.',
    note: '처음부터 마법으로 싸운다. 다섯 중 가장 순하다 — 처음 오른다면 이쪽.',
    likes: ['staff'],
    base: { atk: 3, sp: 8, def: 0, md: 4, spd: 10, maxHp: 30 },
    grow: { pow: 0.56, maxHp: 2.6, def: 0.12, md: 0.38 },
  },
  {
    id: 'lizard', name: '리자드', sprite: 'lizard_m',
    line: '비늘이 재를 견딘다.',
    note: '아무것도 안 보일 때 걸으면 스스로 아문다. 단단하고 느리다.',
    /* 다섯 걸음마다 2씩 아문다.

       "단단하고 느리다"만으로는 고를 이유가 안 됐다 — 방어가 높은 것은 숫자로만
       느껴지고, 화면에서는 아무 일도 안 일어난다. 회복은 다르다. 물러서서
       걷는 동안 체력이 차오르는 게 눈에 보이므로, 이 사람만 「도망쳤다가 다시
       붙는 싸움」을 하게 된다. 같은 던전이 다른 리듬으로 읽힌다. */
    /* 다섯 걸음마다 2씩, 다만 **아무것도 보이지 않을 때만.**

       처음에는 조건 없이 아물게 했다. 클리어율이 54%에서 82%로 뛰었다 —
       다섯 중 가장 어려운 사람이 가장 쉬운 사람이 됐다.
       그래서 최대 체력을 52에서 40으로 깎아 봤는데 **84%로 오히려 올랐다.**
       싸우는 내내 차오르면 그릇이 몇이든 상관이 없기 때문이다.
       **깎아야 할 것은 그릇이 아니라 아무는 조건이었다.**

       이제 보이는 것이 하나라도 있으면 아물지 않는다. 물러서서 숨을 돌리는
       동안에만 낫는다 — 물약을 아끼는 대신 싸움 도중에는 남들과 같다.
       화면에 보이는 것으로 규칙이 정해지므로 사람이 눈으로 예측할 수 있다. */
    regen: { every: 5, amount: 2, calmOnly: true },
    /* 값은 공격력으로 치른다.

       그릇(최대 체력)으로는 못 치른다 — 아무는 사람에게 그릇을 깎으면
       차오르는 속도가 같으므로 아무 일도 안 일어난다(실제로 84% 로 올랐다).
       치를 수 있는 곳은 **회복이 못 메우는 자리**뿐이고, 그건 공격력이다.

       보스 앞에서는 보스가 늘 보이므로 아예 아물지 않는다. 그래서 이 사람의
       진짜 시험은 언제나 보스전이고, 거기서 얼마나 빨리 깎느냐가 판을 가른다. */
    likes: ['blade'],
    base: { atk: 5, sp: 0, def: 3, md: 1, spd: 8, maxHp: 48 },
    grow: { pow: 0.40, maxHp: 5.0, def: 0.42, md: 0.12 },
  },
  {
    id: 'dwarf', name: '드워프', sprite: 'dwarf_f',
    line: '깊은 곳이라면 익숙하다.',
    note: '묵직하게 때린다. 대신 굼뜨다.',
    likes: ['blade'],
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
