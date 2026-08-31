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

  /* 용. 주문이 공격보다 높아서 원거리형으로 잡힌다 — 그게 곧 불을 뿜는 것이다.
     맞으면 옷에 불이 붙어 몇 턴 더 탄다. 한 방이 아프기보다 계속 아픈 쪽이라
     "물러설 것인가"를 묻게 된다. */
  { id: 'dragon',  name: '용',           g: 'D', c: '#D9542F', min: 12, hp: 70, atk: 6,  sp: 15, def: 8,  md: 6, spd: 7,  gold: 45,
    burn: true },
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
    // 주문이 공격보다 높으면 원거리형이다 — 판정 규칙과 같은 기준을 쓴다
    ranged: def.sp > def.atk,
    sight: def.sight || 0,     // 0 이면 기본값을 쓴다
    split: def.split || null,  // 쓰러지면 무엇으로 갈라지는가
    chill: !!def.chill,        // 때리면 상대를 굳게 하는가
    burn: !!def.burn,          // 때리면 불을 붙이는가
    casting: 0,
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
