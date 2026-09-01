/* =========================================================
   items.js — 장비와 상점

   인벤토리는 없다. 밟으면 비교창이 뜨고 교체할지만 정한다.
   가방 관리·무게·정리가 전부 사라져 턴제 리듬이 끊기지 않는다.

   슬롯은 셋: 무기 · 방어구 · 장신구
   무기가 주문을 올리면 공격보다 높아지는 순간 마법사가 된다.
   이게 물리/마법 노선이 갈리는 유일한 장치다.
   ========================================================= */

/* 몸에 걸치는 자리. 장신구는 둘이다 —
   장신구는 원래 성격을 정하는 물건인데 한 칸뿐일 때는 「제일 센 것 하나」로
   끝나서 고를 일이 없었다. 둘이면 속도와 마방을 같이 갈지, 한쪽에 몰지가 갈린다.

   장비의 `slot` 은 「어떤 종류인가」이고, 여기 이름은 「몸의 어느 자리인가」다.
   장신구 하나가 trinket 과 trinket2 중 어디로 가는지는 equipSlotFor 가 정한다. */
const SLOTS = ['weapon', 'armor', 'trinket', 'trinket2'];

const SLOT_NAME = { weapon: '무기', armor: '방어구', trinket: '장신구', trinket2: '장신구' };
const SLOT_GLYPH = { weapon: ')', armor: ']', trinket: '=', trinket2: '=' };

// 이 장비가 들어갈 수 있는 몸의 자리들
function slotsFor(kind) {
  return kind === 'trinket' ? ['trinket', 'trinket2'] : [kind];
}

/* 이 장비를 끼면 어느 자리에 들어가는가.
   빈 자리가 있으면 거기로, 둘 다 찼으면 **값이 낮은 쪽**을 밀어낸다 —
   어느 쪽을 뺄지 또 묻는 창을 띄우면, 인벤토리를 없앤 이유가 사라진다. */
function equipSlotFor(gear, player) {
  const cand = slotsFor(gear.slot);
  if (cand.length === 1) return cand[0];
  for (const s of cand) if (!player.gear[s]) return s;
  return cand.reduce((a, b) =>
    gearPrice(player.gear[b]) < gearPrice(player.gear[a]) ? b : a);
}

// 등급 — '고대의' 가 희귀 등급이고, 나중에 기억을 되찾는 계기가 된다
const RARITY = {
  common:  { name: '',      color: '#9A8B7A', mul: 1.0 },
  fine:    { name: '좋은',  color: '#7FA8C4', mul: 1.9 },
  ancient: { name: '고대의', color: '#E9954A', mul: 4.2 },
  // 정체불명을 열었을 때 나올 수 있는 쪽. 상점에는 안 나오고 바닥에서만 나온다.
  cursed:  { name: '저주받은', color: '#8E6BB0', mul: 0.5 },
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
  // ---- 무기 : 활 (엘프 전용) ----
  // 활은 물리 원거리라는 세 번째 방식이다. 들고 있으면 기억 없이도 Z 로 쏜다.
  // only 가 붙은 장비는 그 사람일 때만 나온다 — 다른 사람에게는 "주워도 못 쓰는
  // 함정 아이템"이 되므로 애초에 굴리지 않는다.
  { slot:'weapon', name:'사냥 활',     min:1,  rarity:'common',  mod:{ atk:3, spd:1 },  bow:true, only:'elf' },
  { slot:'weapon', name:'긴 활',       min:5,  rarity:'fine',    mod:{ atk:6, spd:1 },  bow:true, only:'elf' },
  { slot:'weapon', name:'재의 활',     min:9,  rarity:'ancient', mod:{ atk:9, spd:2 },  bow:true, only:'elf' },
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

  /* ---- 장신구 ----
     자리가 둘로 늘면서 값을 낮췄다. 두 칸을 준 것은 **고를 것을 늘리려는 것**이지
     세지게 하려는 것이 아니다 — 그대로 두었더니 클리어율이 기사 57→73%,
     드워프 50→88%, 마법사 79→98% 가 됐다. 판이 쉬워진 게 아니라 없어졌다.
     둘을 합쳐서 예전 한 칸쯤 되게 맞췄다. */
  { slot:'trinket', name:'가죽 장화',  min:1,  rarity:'common',  mod:{ spd:2 } },
  { slot:'trinket', name:'부적',       min:2,  rarity:'common',  mod:{ md:2 } },
  { slot:'trinket', name:'생명의 반지',min:4,  rarity:'common',  mod:{ maxHp:6 } },
  { slot:'trinket', name:'날랜 장화',  min:6,  rarity:'fine',    mod:{ spd:3 } },
  { slot:'trinket', name:'수정 목걸이',min:6,  rarity:'fine',    mod:{ md:3, sp:2 } },
  { slot:'trinket', name:'등불지기의 반지', min:10, rarity:'ancient', mod:{ maxHp:8, md:2, sp:2 } },

  /* 기억을 굴릴 기회는 「고대의」를 밟는 순간에만 온다. 그런데 위 목록은
     4층까지 후보가 하나도 없고 그마저 무기라, 초반에 죽는 판은 확률이 낮은 게 아니라
     **굴릴 일 자체가 없었다.** 확률을 올려도 안 풀리는 종류의 병목이다.

     그래서 앞쪽에 둘을 둔다. 세기로 앞서는 물건이면 초반 균형이 무너지므로,
     같은 등급이되 값은 얌전하게 잡았다 — 이건 힘이 아니라 기회를 놓는 자리다. */
  { slot:'trinket', name:'재의 부적',   min:2,  rarity:'ancient', mod:{ md:3, sp:1 } },
  { slot:'armor',   name:'재의 조끼',   min:3,  rarity:'ancient', mod:{ def:3, spd:1 } },
];

/* ---------- 갖춰 입기 ----------

   장비를 하나씩 보면 언제나 「숫자가 큰 것」이 정답이라 고를 일이 없다.
   셋을 맞추면 값이 붙는다고 하면, 지금 든 것보다 조금 낮은 물건을 일부러
   집는 판단이 생긴다 — 이게 비교창에 처음으로 「그렇지만」을 만든다.

   새로 그린 것은 없다. 이미 있는 장비에 이름표만 붙였다.
   기사·법사 셋은 좋은 등급이라 모으기 어렵고, 궁수·창병 셋은 평범한 것이
   섞여 있어 일찍 맞출 수 있다 — 어려운 셋일수록 값이 크다. */
const SETS = {
  knight: { name: '기사', pieces: ['대검', '판금 갑옷', '생명의 반지'],
            two: { def: 2 },  three: { def: 3, maxHp: 10 },
            line: '두꺼운 것을 두르고 앞에 선다' },
  wizard: { name: '법사', pieces: ['주술 지팡이', '수호의 로브', '수정 목걸이'],
            two: { sp: 2 },   three: { sp: 4, md: 3 },
            line: '멀리서 태운다' },
  archer: { name: '궁수', pieces: ['긴 활', '가죽 갑옷', '날랜 장화'],
            two: { spd: 2 },  three: { spd: 3, atk: 3 },
            line: '닿기 전에 물러선다' },
  /* 창병 셋은 세 조각이 전부 흔한 것이라 제일 일찍 맞춰진다.
     그래서 값을 제일 얌전하게 잡았다 — 공격은 이 게임에서 제일 센 수치라,
     쉽게 맞춰지는 셋에 크게 얹으면 그 셋 하나가 정답이 된다. */
  spear:  { name: '창병', pieces: ['긴 창', '사슬 갑옷', '가죽 장화'],
            two: { atk: 2 },  three: { atk: 3, spd: 1 },
            line: '한 칸 앞에서 찌른다' },
};

// 이름 → 셋 열쇠. GEAR 에 열쇠를 적어 두면 두 곳이 어긋나므로 여기서 한 번에 만든다.
const SET_OF = {};
for (const [key, s] of Object.entries(SETS))
  for (const n of s.pieces) SET_OF[n] = key;

/* 지금 몇 조각을 걸치고 있는가. { knight: 2, ... } */
function wornSets(player) {
  const out = {};
  for (const slot of SLOTS) {
    const g = player.gear[slot];
    if (!g || g.unknown) continue;          // 정체불명은 열기 전까지 셈에 안 든다
    const k = SET_OF[g.name];
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// 갖춰 입어서 붙는 값. recalcStats 가 마지막에 얹는다.
function setBonus(player) {
  const mod = {};
  for (const [k, n] of Object.entries(wornSets(player))) {
    const s = SETS[k];
    if (!s) continue;
    if (n >= 2) for (const [stat, v] of Object.entries(s.two)) mod[stat] = (mod[stat] || 0) + v;
    if (n >= 3) for (const [stat, v] of Object.entries(s.three)) mod[stat] = (mod[stat] || 0) + v;
  }
  return mod;
}

const STAT_LABEL = { atk:'공격', sp:'주문', def:'방어', md:'마방', spd:'속도', maxHp:'최대 체력' };
const STAT_ORDER = ['atk', 'sp', 'def', 'md', 'spd', 'maxHp'];

/* 무기가 어느 갈래인가.
   전투 판정과 같은 규칙을 쓴다 — 주문이 공격보다 높으면 지팡이다.
   그림을 드는 방식(Render.heldWeapon)도 이 규칙으로 세울 것과 내릴 것을 가르므로,
   한 규칙이 판정·그림·드랍 셋을 함께 정한다. 갈라 두면 반드시 어긋난다. */
function weaponKind(g) {
  if (g.slot !== 'weapon') return null;
  if (g.bow) return 'bow';
  return ((g.mod.sp || 0) > (g.mod.atk || 0)) ? 'staff' : 'blade';
}

/* ---------- 생성 ---------- */

// luck: 기억을 오래 못 얻었을수록 커진다. 고대의 등급이 더 자주 나와
//       기억을 굴릴 기회 자체가 늘어난다.
function rollGear(depth, luck) {
  const hero = currentHero();
  const pool = GEAR.filter(g => g.min <= depth && (!g.only || g.only === hero.id));
  if (!pool.length) return null;

  // 깊이 들어갈수록 좋은 것이 나오지만, 고대의는 항상 드물다.
  // 그리고 최근에 열린 장비일수록 자주 나온다 —
  // 반대로 짜면 10층에서도 낡은 단검이 계속 나와 층을 오르는 보람이 사라진다.
  /* 「고대의」의 기본 가중치가 2 였을 때, 기억을 몇 개 되찾아 luck 이 0 으로
     돌아온 사람은 한 판에 고대의를 두어 번밖에 못 만났다. 굴릴 기회가 그만큼 없으니
     "기억이 안 모인다"가 된다 — 확률이 아니라 기회 쪽 문제라 여기를 올린다. */
  const base = { common: 6, fine: 3, ancient: 3 + clamp(luck || 0, 0, 5) * 2 };
  // 이미 시작한 셋이 있으면 그쪽 조각이 더 자주 나온다 (아래 참고)
  const started = (typeof state !== 'undefined' && state.player) ? wornSets(state.player) : {};
  const weighted = [];
  for (const g of pool) {
    const age = depth - g.min;
    let w = base[g.rarity] * clamp(6 - age, 1, 6);

    /* 고른 사람에게 맞는 무기가 더 자주 나온다.
       마법사가 열 층을 올라가도록 지팡이를 한 번도 못 만나면 고른 의미가 없고,
       기사가 줍는 것마다 지팡이면 그건 무기가 아니라 방해물이다.

       다만 기울이기만 하고 잠그지는 않는다. 이 게임에서 물리와 마법을 가르는
       유일한 장치가 "무엇을 들었는가"라, 안 맞는 무기가 아예 안 나오면
       노선을 갈아타는 판이 사라진다. 그 뜻밖의 한 자루가 판을 바꾸는 쪽이다.
       그래서 최소 하나는 남긴다 — 드물어질 뿐 없어지지는 않는다. */
    const kind = weaponKind(g);
    if (kind) w = Math.max(1, Math.round(w * (hero.likes.includes(kind) ? 3 : 0.4)));

    /* 이미 한 조각을 걸친 셋의 나머지가 더 자주 나온다.
       기울이지 않으면 세 조각이 우연히 모일 일이 없어서, 셋 효과가
       「있다는 것만 아는 것」이 된다 — 그건 없는 것과 같다.
       다만 확정은 아니다. 두 조각째부터 더 세게 기운다. */
    const setKey = SET_OF[g.name];
    if (setKey && started[setKey]) w = Math.round(w * (started[setKey] >= 2 ? 5 : 3));

    for (let i = 0; i < w; i++) weighted.push(g);
  }
  return makeGear(choice(weighted));
}

function makeGear(def) {
  return { ...def, mod: { ...def.mod } };
}

/* ---------- 정체불명 ----------

   비교창이 "숫자가 크면 먹는다"로만 끝나면 그건 판단이 아니라 산수다.
   무엇인지 모르는 물건을 하나 섞으면, 지금 낀 것을 버릴 값어치가 있는가를
   숫자 없이 정해야 한다 — 이 게임에서 장비를 바꾸는 것은 되돌릴 수 없으므로
   그 자체로 충분히 무거운 도박이다.

   좋은 쪽은 확실히 좋아야 한다. 열어 봐야 평범한 것이면 두 번째부터는 아무도 안 연다.
   그래서 좋은 쪽은 고대의 가중치를 크게 얹어 뽑고, 나쁜 쪽은 저주로 뒤집는다. */
function rollUnknown(depth, luck) {
  const cursed = chance(0.34);
  // 나쁜 쪽은 층수만 보고, 좋은 쪽은 운을 크게 얹어 뽑는다
  const base = rollGear(depth, cursed ? 0 : (luck || 0) + 4);
  if (!base) return null;

  if (cursed) {
    base.rarity = 'cursed';
    /* 값을 뒤집되 전부 뒤집지는 않는다. 하나쯤은 남아 있어야
       "쓸 수는 있는데 손해"가 되고, 그게 통째로 꽝인 것보다 낫다. */
    const keys = Object.keys(base.mod);
    for (const k of keys) {
      base.mod[k] = -Math.max(1, Math.round(Math.abs(base.mod[k]) * 0.5));
    }
    if (keys.length > 1) {                       // 하나는 되살린다
      const keep = choice(keys);
      base.mod[keep] = Math.max(1, Math.abs(base.mod[keep]));
    }
  }
  base.unknown = true;                            // 열기 전에는 값을 숨긴다
  return base;
}

// 열어 본 순간. 되돌릴 수 없으므로 이름과 값이 그 자리에서 드러난다.
function revealGear(g) {
  if (!g || !g.unknown) return g;
  g.unknown = false;
  return g;
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
      // 이미 낀 것과 같은 물건은 안 판다 — 장신구는 두 자리를 다 본다
      if (slotsFor(g.slot).some(s => player.gear[s] && player.gear[s].name === g.name)) continue;
      taken.add(g.name);
      stock.push({ kind: 'gear', gear: g, price: gearPrice(g), sold: false });
      break;
    }
  }
  return stock;
}

function gearFullName(g) {
  // 열기 전에는 무엇인지도 말해주지 않는다. 자리만 알려준다.
  if (g.unknown) return '정체불명의 ' + SLOT_NAME[g.slot];
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
  /* 모닥불에서 재를 삼킨 만큼. 장비에 얹으면 그 장비를 버릴 때 같이 사라지므로
     판 상태에 따로 들고 있다가 여기서 더한다 — 스탯을 세우는 곳은 언제나 여기 하나다. */
  if (typeof state !== 'undefined' && state.ashHp) s.maxHp += state.ashHp;
  // 곁에 있는 것이 주는 것도 여기서 (js/pets.js)
  if (typeof PET !== 'undefined') {
    for (const [k, n] of Object.entries(PET.mod())) s[k] = (s[k] || 0) + n;
  }
  // 갖춰 입어서 붙는 값. 장비를 다 더한 뒤에 얹는다 — 조각 수를 세야 하므로
  for (const [k, n] of Object.entries(setBonus(player))) s[k] = (s[k] || 0) + n;

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
