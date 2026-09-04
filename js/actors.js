/* =========================================================
   actors.js — 플레이어와 몬스터

   스탯은 여섯 개: 체력 · 공격 · 주문 · 방어 · 마방 · 속도
   판정 규칙은 하나뿐이다 —
   공격자의 주문이 공격보다 높으면 마법 공격,
   아니면 물리 공격.
   ========================================================= */

const MONSTERS = [
  // 이름은 스프라이트에 맞춰 골랐다 (0x72 Dungeon Tileset II).
// id 는 그림 파일과 이어지는 열쇠이므로 바꾸지 말 것 — js/sprites.js 의 키와 같아야 한다.
// id            이름            글리프  색        최소층  체력 공격 주문 방어 마방 속도  골드
  { id: 'rat',     name: '타다 만 것',   g: 'r', c: '#9A8B7A', min: 1,  hp: 5,  atk: 3,  sp: 0,  def: 0,  md: 0, spd: 13, gold: 2 },
  { id: 'goblin',  name: '고블린',       g: 'g', c: '#7FA05A', min: 1,  hp: 9,  atk: 4,  sp: 0,  def: 1,  md: 1, spd: 10, gold: 4 },
  { id: 'bat',     name: '불티',         g: 'b', c: '#8E7BA8', min: 2,  hp: 5,  atk: 3,  sp: 0,  def: 0,  md: 2, spd: 15, gold: 3 },
  { id: 'kobold',  name: '가면 쓴 것',   g: 'k', c: '#B07A4E', min: 2,  hp: 11, atk: 4,  sp: 0,  def: 1,  md: 2, spd: 11, gold: 6 },
  { id: 'shaman',  name: '재의 주술사',   g: 'h', c: '#6FA8C4', min: 3,  hp: 7,  atk: 1,  sp: 7,  def: 0,  md: 2, spd: 9,  gold: 8 },
  { id: 'orc',     name: '오크',         g: 'o', c: '#6E8F4A', min: 4,  hp: 20, atk: 6,  sp: 0,  def: 2,  md: 3, spd: 8,  gold: 10 },
  { id: 'skeleton',name: '해골 전사',    g: 's', c: '#C8BEA8', min: 5,  hp: 15, atk: 6,  sp: 0,  def: 2,  md: 3, spd: 10, gold: 9 },
  { id: 'wraith',  name: '창백한 망령',  g: 'p', c: '#8FA8C8', min: 6,  hp: 16, atk: 2,  sp: 10, def: 1,  md: 5, spd: 11, gold: 12 },
  { id: 'ooze',    name: '산성 오움',    g: 'm', c: '#7FB08A', min: 7,  hp: 26, atk: 7,  sp: 3,  def: 5,  md: 2, spd: 6,  gold: 11 },
  { id: 'troll',   name: '부푼 것',      g: 'T', c: '#8A6F4E', min: 8,  hp: 32, atk: 9,  sp: 0,  def: 5,  md: 3, spd: 7,  gold: 18 },
  { id: 'darkmage',name: '어둠의 마법사', g: 'M', c: '#9B7BD4', min: 10, hp: 22, atk: 2,  sp: 14, def: 2,  md: 6, spd: 9,  gold: 22 },
  { id: 'golem',   name: '오우거',       g: 'G', c: '#8E8E8E', min: 11, hp: 42, atk: 9,  sp: 0,  def: 8,  md: 4, spd: 5,  gold: 26 },

  /* 뒤늦게 더 넣은 것들. 몇은 싸우는 방식이 다르다 —
     열두 종이 있어도 행동이 둘뿐이면 결국 같은 싸움이 반복된다. */
  { id: 'zombie',  name: '느린 시체',    g: 'z', c: '#7A9A6A', min: 4,  hp: 26, atk: 6,  sp: 0,  def: 2,  md: 2, spd: 5,  gold: 8 },
  { id: 'muddy',   name: '진창',         g: 'u', c: '#6B7A5A', min: 6,  hp: 18, atk: 9,  sp: 0,  def: 3,  md: 2, spd: 7,  gold: 12,
    sight: 2 },                                   // 가까이 올 때까지 움직이지 않는다 — 매복
  { id: 'pumpkin', name: '호박 머리',    g: 'P', c: '#D98A3A', min: 7,  hp: 20, atk: 7,  sp: 0,  def: 3,  md: 3, spd: 10, gold: 14 },
  { id: 'slug',    name: '오움',         g: 'S', c: '#8FB06A', min: 7,  hp: 20, atk: 5,  sp: 0,  def: 3,  md: 2, spd: 6,  gold: 10,
    split: 'tinyslug' },                          // 쓰러지면 둘로 갈라진다
  { id: 'tinyslug',name: '작은 오움',    g: 's', c: '#A8C47F', min: 99, hp: 7,  atk: 4,  sp: 0,  def: 1,  md: 1, spd: 9,  gold: 3 },
  { id: 'icezombie',name: '식은 것',     g: 'i', c: '#7FA8C8', min: 9,  hp: 30, atk: 9,  sp: 0,  def: 4,  md: 3, spd: 6,  gold: 16,
    chill: true },                                // 맞으면 몸이 굳는다
  { id: 'doc',     name: '검은 의원',    g: 'd', c: '#9A8FB0', min: 10, hp: 20, atk: 2,  sp: 12, def: 2,  md: 5, spd: 9,  gold: 20 },
  { id: 'bigdemon',name: '큰 악귀',      g: 'B', c: '#C4553A', min: 14, hp: 52, atk: 12, sp: 0,  def: 7,  md: 5, spd: 8,  gold: 32 },

  /* 용은 **13층의 주인**이다 (js/bosses.js). 예전에는 12층부터 그냥 나오는
     보통 몬스터였는데, 테스터 말로 「개 나약함」이었다 — 용이 복도에서
     그냥 지나가는 것이면 그건 용이 아니다. 목록에서 빼서 보스 자리로 올렸다.
     불이 옷에 옮는 burn 규칙은 그쪽으로 같이 갔다. */
  /* ---------- 탑을 오르다 돌아오지 못한 사람들 ----------

     NPC 팩(Fantasy RPG NPCs)에서 온다. 스물여섯 종 중 둘(대장장이·아이)만 쓰고
     나머지가 놀고 있었다.

     짐승만 있는 탑보다 **사람이 섞인 탑**이 무섭다. 이 게임은 먼저 오른 사람이
     벽에 말을 남기는 게임인데, 그 중 돌아오지 못한 사람이 실제로 서 있어야
     그 말이 무거워진다. 벽의 쪽지 옆에서 이들을 만나면 그게 누구였는지 알게 된다.

     숫자는 같은 층대의 짐승과 나란히 잡되 **성격을 다르게** 준다 —
     같은 층에 체력만 다른 것이 하나 더 있는 것은 몬스터가 는 것이 아니다. */

  // 4층 — 가벼운 갑옷. 짐승보다 단단하고 짐승만큼 빠르다. 첫 「사람」이다.
  { id: 'fallenknight', name: '무너진 기사', g: 'K', c: '#A8B0BF', min: 4,  hp: 22, atk: 7,  sp: 0,  def: 4,  md: 2, spd: 9,  gold: 14 },

  /* 6층 — 활을 든 사냥꾼. 지금까지 멀리서 때리는 것은 전부 주문쟁이라
     마방 하나로 막혔다. 이쪽은 활이라 **방어로 막는다**(bow) — 한쪽만
     올려 둔 사람이 처음으로 다른 물음을 받는 자리다.
     그릇은 얇게 뒀다. 붙으면 죽는 것, 그것이 사냥꾼이다. */
  { id: 'hunter',   name: '재의 사냥꾼',  g: 'a', c: '#9AA86E', min: 6,  hp: 16, atk: 9,  sp: 0,  def: 2,  md: 2, spd: 11, gold: 15, bow: true },

  // 8층 — 큰 도끼. 느리고 물렁한데 한 방이 제일 아프다. 맞을 자리를 고르게 한다.
  { id: 'executioner', name: '처형인',   g: 'E', c: '#B04A4A', min: 8,  hp: 30, atk: 14, sp: 0,  def: 3,  md: 2, spd: 6,  gold: 24 },

  // 10층 — 두꺼운 갑옷. 방어가 높아 물리로는 잘 안 들어간다. 지팡이가 답이다.
  { id: 'heavyknight', name: '무거운 기사', g: 'H', c: '#7F8FA8', min: 10, hp: 40, atk: 10, sp: 0,  def: 10, md: 3, spd: 7,  gold: 30 },

  /* 11층 — 도살자. 피를 보면 빨라진다… 는 규칙까지는 아직 없다.
     대신 체력과 공격이 둘 다 높고 방어가 낮다 — 먼저 치지 않으면 먼저 맞는다. */
  { id: 'butcher',  name: '도살자',      g: 'C', c: '#C4703A', min: 11, hp: 38, atk: 13, sp: 0,  def: 4,  md: 3, spd: 9,  gold: 28 },
];

function makePlayer() {
  return {
    kind: 'player',
    name: '당신',
    glyph: '@',
    color: COLORS.player,
    x: 0, y: 0, rx: 0, ry: 0,
    maxHp: 30, hp: 30,
    stats: { atk: 5, sp: 0, def: 1, md: 0, spd: CFG.BASE_SPEED },
    gear: { weapon: null, armor: null, trinket: null },
    energy: CFG.ENERGY_COST,
    alive: true,
    bump: null, flash: 0, face: 1,
  };
}

/* 스냅샷을 주고받을 때 "이 몬스터가 아까 그 몬스터인가"를 알아야 한다.
   그걸 알아야 관전 화면에서 그려지는 좌표를 이어받아 미끄러지듯 움직인다 —
   못 알아보면 매 턴 새로 태어나므로 순간이동하는 것처럼 보인다. */
let monsterUid = 0;

/* ---------- 엘리트 ----------

   몬스터를 새로 그리는 것보다 있는 것에 접두사를 붙이는 편이 훨씬 싸다.
   같은 고블린이라도 「굶주린」이 붙으면 다른 몬스터처럼 싸워야 한다 —
   표는 그대로 두고 배율 몇 개만 얹는데 체감은 종류가 늘어난 것과 같다.

   그리고 이건 "위층에 가도 같은 것이 나온다"를 직접 푼다.
   층이 오를수록 자주 붙으므로, 익숙한 몬스터가 다시 낯설어진다.

   tint 는 발밑 빛 색이다. 붙었다는 것이 한눈에 보여야
   "왜 갑자기 안 죽지"가 아니라 "저건 다른 놈이다"가 된다. */
const ELITES = [
  { id: 'starved', name: '굶주린', tint: '#C9D66B',
    mul: { spd: 1.7, hp: 0.75 },
    note: '빠르다' },
  { id: 'raging',  name: '성난',   tint: '#E05A3A',
    mul: { atk: 1.5, sp: 1.5, hp: 1.2 },
    note: '세게 때린다' },
  { id: 'hardened',name: '굳은',   tint: '#7FA8C4',
    mul: { hp: 1.5, spd: 0.8 }, add: { def: 4, md: 4 },
    note: '단단하다' },
  // 죽고 나서 한 번 더 일이 벌어지는 둘. 잡았다고 물러서면 안 된다.
  { id: 'ashen',   name: '재를 뒤집어쓴', tint: '#E9954A',
    mul: { hp: 1.1 }, burst: true,
    note: '쓰러지면 터진다' },
  { id: 'echoing', name: '메아리치는',   tint: '#B08BD6',
    mul: { hp: 1.3 }, echo: true,
    note: '쓰러지면 둘로 갈라진다' },
];

// 층이 오를수록 자주 붙는다. 1~2층에는 안 붙는다 — 아직 기본형도 다 못 봤다.
function eliteChance(depth) {
  if (depth < 3) return 0;
  return clamp(0.05 + (depth - 3) * 0.022, 0, 0.30);
}

function makeMonster(def, x, y, eliteId) {
  const e = eliteId ? ELITES.find(v => v.id === eliteId) : null;
  const mul = (e && e.mul) || {};
  const add = (e && e.add) || {};
  const sc = (v, k) => Math.max(1, Math.round(v * (mul[k] || 1) + (add[k] || 0)));

  const hp = sc(def.hp, 'hp');
  return {
    kind: 'monster',
    uid: ++monsterUid,
    defId: def.id,
    name: e ? e.name + ' ' + def.name : def.name,
    glyph: def.g,
    color: def.c,
    x, y, rx: x, ry: y,
    maxHp: hp, hp,
    stats: { atk: sc(def.atk, 'atk'), sp: sc(def.sp, 'sp'),
             def: sc(def.def, 'def'), md: sc(def.md, 'md'), spd: sc(def.spd, 'spd') },
    // 더 오래 버티고 더 아프게 때리므로 값어치도 그만큼 쳐준다
    gold: e ? Math.round(def.gold * 1.8) : def.gold,
    elite: e ? e.id : null,
    eliteTint: e ? e.tint : null,
    burst: !!(e && e.burst),
    echo: !!(e && e.echo),
    energy: randInt(0, CFG.ENERGY_COST - 1),   // 등장 타이밍을 흩뜨린다
    alive: true,
    /* 주문이 공격보다 높으면 원거리형이다 — 판정 규칙과 같은 기준을 쓴다.
       활은 예외다: 멀리서 쏘지만 **주문이 아니라 힘**이라 방어로 막힌다.
       마방만 올려 둔 사람에게 처음으로 다른 물음을 던지는 것이 이 하나다. */
    ranged: def.sp > def.atk || !!def.bow,
    bow: !!def.bow,
    sight: def.sight || 0,     // 0 이면 기본값을 쓴다
    split: def.split || null,  // 쓰러지면 무엇으로 갈라지는가
    chill: !!def.chill,        // 때리면 상대를 굳게 하는가
    burn: !!def.burn,          // 때리면 불을 붙이는가
    casting: 0,
    // 발린 독 — 남은 턴과 한 턴에 드는 값 (game.js 의 poisonMonster)
    poison: 0, poisonAmount: 0, poisonSaid: false,
    bump: null, flash: 0, face: 1,
  };
}

// 그 층에 나올 수 있는 몬스터. 최근 해금된 종류가 더 자주 나온다.
function spawnTable(depth) {
  const pool = MONSTERS.filter(m => m.min <= depth);
  const weighted = [];
  for (const m of pool) {
    const age = depth - m.min;            // 오래된 몬스터일수록 덜 나온다
    const weight = clamp(6 - age, 1, 6);
    for (let i = 0; i < weight; i++) weighted.push(m);
  }
  return weighted;
}

/* ---------- 전투 판정 ---------- */

function isMagicAttack(attacker) {
  return attacker.stats.sp > attacker.stats.atk;
}

function rollDamage(attacker, defender) {
  const magic = isMagicAttack(attacker);
  const power = magic ? attacker.stats.sp : attacker.stats.atk;
  const armor = magic ? defender.stats.md : defender.stats.def;

  let dmg = power - armor;
  dmg = Math.max(1, dmg);                            // 최소 1은 들어간다
  dmg = Math.max(1, Math.round(dmg * (0.85 + Math.random() * 0.3)));
  return { dmg, magic };
}
