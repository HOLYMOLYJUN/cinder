/* =========================================================
   items.js — 장비와 상점

   인벤토리는 없다. 밟으면 비교창이 뜨고 교체할지만 정한다.
   가방 관리·무게·정리가 전부 사라져 턴제 리듬이 끊기지 않는다.

   슬롯은 셋: 무기 · 방어구 · 장신구
   무기가 주문을 올리면 공격보다 높아지는 순간 마법사가 된다.
   이게 물리/마법 노선이 갈리는 유일한 장치다.
   ========================================================= */

const SLOTS = ['weapon', 'armor', 'trinket'];

const SLOT_NAME = { weapon: '무기', armor: '방어구', trinket: '장신구' };
const SLOT_GLYPH = { weapon: ')', armor: ']', trinket: '=' };

// 등급 — '고대의' 가 희귀 등급이고, 나중에 기억을 되찾는 계기가 된다
const RARITY = {
  common:  { name: '',      color: '#9A8B7A', mul: 1.0 },
  fine:    { name: '좋은',  color: '#7FA8C4', mul: 1.9 },
  ancient: { name: '고대의', color: '#E9954A', mul: 4.2 },
};

/* min: 이 층부터 나온다 */
const GEAR = [
  // ---- 무기 : 물리 ----
  { slot:'weapon', name:'낡은 단검',   min:1,  rarity:'common',  mod:{ atk:2, spd:1 } },
  { slot:'weapon', name:'짧은 검',     min:1,  rarity:'common',  mod:{ atk:4 } },
  { slot:'weapon', name:'전투 도끼',   min:4,  rarity:'common',  mod:{ atk:6, spd:-1 } },
  { slot:'weapon', name:'긴 창',       min:5,  rarity:'fine',    mod:{ atk:7, spd:1 } },
  { slot:'weapon', name:'대검',        min:8,  rarity:'fine',    mod:{ atk:10, spd:-2 } },
  { slot:'weapon', name:'불씨 단검',   min:4,  rarity:'ancient', mod:{ atk:7, spd:2 } },
  { slot:'weapon', name:'불씨 검',     min:9,  rarity:'ancient', mod:{ atk:12, sp:3 } },
  // ---- 무기 : 마법 ----
  // 지팡이의 주문은 반드시 기본 공격(5)보다 확실히 높아야 한다.
  // 같거나 낮으면 들어도 물리 판정이 유지되어 주울 이유가 없는 함정 아이템이 된다.
  { slot:'weapon', name:'나무 지팡이', min:2,  rarity:'common',  mod:{ sp:9 } },
  { slot:'weapon', name:'주술 지팡이', min:5,  rarity:'fine',    mod:{ sp:12, md:1 } },
  { slot:'weapon', name:'재의 지팡이', min:9,  rarity:'ancient', mod:{ sp:18, md:3 } },

  // ---- 방어구 ----
  { slot:'armor',  name:'가죽 갑옷',   min:1,  rarity:'common',  mod:{ def:2 } },
  { slot:'armor',  name:'사슬 갑옷',   min:3,  rarity:'common',  mod:{ def:4, spd:-1 } },
  { slot:'armor',  name:'마법사 로브', min:3,  rarity:'common',  mod:{ md:4, sp:1 } },
  { slot:'armor',  name:'판금 갑옷',   min:7,  rarity:'fine',    mod:{ def:7, spd:-2 } },
  { slot:'armor',  name:'수호의 로브', min:7,  rarity:'fine',    mod:{ md:7, sp:2 } },
  { slot:'armor',  name:'그을린 갑옷', min:6,  rarity:'ancient', mod:{ def:5, md:3 } },
  { slot:'armor',  name:'재의 외투',   min:10, rarity:'ancient', mod:{ def:6, md:6 } },

  // ---- 장신구 ----
  { slot:'trinket', name:'가죽 장화',  min:1,  rarity:'common',  mod:{ spd:3 } },
  { slot:'trinket', name:'부적',       min:2,  rarity:'common',  mod:{ md:3 } },
  { slot:'trinket', name:'생명의 반지',min:4,  rarity:'common',  mod:{ maxHp:10 } },
  { slot:'trinket', name:'날랜 장화',  min:6,  rarity:'fine',    mod:{ spd:6 } },
  { slot:'trinket', name:'수정 목걸이',min:6,  rarity:'fine',    mod:{ md:5, sp:3 } },
  { slot:'trinket', name:'등불지기의 반지', min:10, rarity:'ancient', mod:{ maxHp:12, md:3, sp:3 } },
];

const STAT_LABEL = { atk:'공격', sp:'주문', def:'방어', md:'마방', spd:'속도', maxHp:'최대 체력' };
const STAT_ORDER = ['atk', 'sp', 'def', 'md', 'spd', 'maxHp'];

/* ---------- 생성 ---------- */

// luck: 기억을 오래 못 얻었을수록 커진다. 고대의 등급이 더 자주 나와
//       기억을 굴릴 기회 자체가 늘어난다.
function rollGear(depth, luck) {
  const pool = GEAR.filter(g => g.min <= depth);
  if (!pool.length) return null;

  // 깊이 들어갈수록 좋은 것이 나오지만, 고대의는 항상 드물다.
  // 그리고 최근에 열린 장비일수록 자주 나온다 —
  // 반대로 짜면 10층에서도 낡은 단검이 계속 나와 층을 오르는 보람이 사라진다.
  const base = { common: 6, fine: 3, ancient: 2 + clamp(luck || 0, 0, 5) * 2 };
  const weighted = [];
  for (const g of pool) {
    const age = depth - g.min;
    const w = base[g.rarity] * clamp(6 - age, 1, 6);
    for (let i = 0; i < w; i++) weighted.push(g);
  }
  return makeGear(choice(weighted));
}

function makeGear(def) {
  return { ...def, mod: { ...def.mod } };
}

// 상인의 매대. 이미 낀 것과 같은 물건이나 매대 안 중복은 팔지 않는다 —
// "변화 없음"이라고 적힌 물건을 파는 상인은 플레이어의 시간을 뺏을 뿐이다.
function rollShopStock(depth, player, count) {
  const taken = new Set();
  const stock = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const g = rollGear(depth);
      if (!g) break;
      if (taken.has(g.name)) continue;
      const worn = player.gear[g.slot];
      if (worn && worn.name === g.name) continue;
      taken.add(g.name);
      stock.push({ kind: 'gear', gear: g, price: gearPrice(g), sold: false });
      break;
    }
  }
  return stock;
}

function gearFullName(g) {
  const r = RARITY[g.rarity];
  return r.name ? r.name + ' ' + g.name : g.name;
}

function gearPrice(g) {
  let v = 0;
  for (const [k, n] of Object.entries(g.mod)) {
    const weight = (k === 'maxHp') ? 1.1 : (k === 'spd' ? 3.4 : 3.0);
    v += n * weight;
  }
  return Math.max(6, Math.round(v * 2.4 * RARITY[g.rarity].mul));
}

/* ---------- 장착과 스탯 ---------- */

// 기준선은 고른 사람이 정한다. 장비와 기억은 그 위에 얹힌다.
function baseStats() {
  return { ...currentHero().base };
}

// 장비를 갈아끼울 때마다 스탯을 처음부터 다시 계산한다.
// 누적으로 더하고 빼면 반드시 어긋난다.
function recalcStats(player) {
  const s = baseStats();
  for (const slot of SLOTS) {
    const g = player.gear[slot];
    if (!g) continue;
    for (const [k, n] of Object.entries(g.mod)) s[k] = (s[k] || 0) + n;
  }
  // 되찾은 기억도 스탯에 얹힌다
  for (const [k, n] of Object.entries(MEM.mod())) s[k] = (s[k] || 0) + n;
  // 이번 판에서 오른 레벨도
  for (const [k, n] of Object.entries(LV.mod())) s[k] = (s[k] || 0) + n;

  const beforeMax = player.maxHp;
  player.maxHp = Math.max(1, s.maxHp);
  // 최대 체력이 늘면 그만큼 현재 체력도 같이 오른다 (반지를 끼자마자 위험해지지 않게)
  if (player.maxHp > beforeMax) player.hp += player.maxHp - beforeMax;
  player.hp = clamp(player.hp, 1, player.maxHp);

  player.stats = { atk: s.atk, sp: s.sp, def: s.def, md: s.md, spd: Math.max(2, s.spd) };
}

// 비교창에 뿌릴 줄 목록. 지금 낀 것과의 차이를 함께 낸다.
function compareRows(newGear, oldGear) {
  const rows = [];
  for (const k of STAT_ORDER) {
    const a = (newGear.mod[k] || 0);
    const b = oldGear ? (oldGear.mod[k] || 0) : 0;
    if (a === 0 && b === 0) continue;
    rows.push({ key: k, label: STAT_LABEL[k], now: b, next: a, diff: a - b });
  }
  return rows;
}
