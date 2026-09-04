/* =========================================================
   items.js — 장비와 상점

   인벤토리는 없다. 밟으면 비교창이 뜨고 교체할지만 정한다.
   가방 관리·무게·정리가 전부 사라져 턴제 리듬이 끊기지 않는다.

   슬롯은 셋: 무기 · 방어구 · 장신구
   무기가 주문을 올리면 공격보다 높아지는 순간 마법사가 된다.
   이게 물리/마법 노선이 갈리는 유일한 장치다.
   ========================================================= */

/* 몸에 걸치는 자리 다섯. 투구 · 방어구 · 신발 · 장신구 · 무기.

   예전에는 넷이었고 그중 둘이 똑같은 「장신구」였다. 같은 칸이 둘이면 각 칸에
   성격이 없어서 「둘 다 제일 센 것」으로 끝난다 — 화면에도 「장신구 없음」이
   두 번 떴다. 신발과 장신구로 가르고 투구를 새로 두면 다섯 자리가 다 다른
   물음을 던진다: 머리를 지킬까 · 몸을 지킬까 · 빨라질까 · 무엇을 더할까 · 무엇을 들까.

   장비의 `slot` 이 곧 몸의 자리다 (예전에는 장신구만 둘로 갈라져서 달랐다). */
const SLOTS = ['helm', 'armor', 'boots', 'trinket', 'weapon'];

const SLOT_NAME = { helm: '투구', armor: '방어구', boots: '신발', trinket: '장신구', weapon: '무기' };
const SLOT_GLYPH = { helm: '^', armor: ']', boots: 'u', trinket: '=', weapon: ')' };

/* 장신구 두 칸(trinket·trinket2)을 신발과 장신구로 갈랐다.

   같은 칸이 둘일 때는 각 칸에 성격이 없었다 — 화면에 「장신구 없음 장신구 없음」이
   두 번 뜨고, 무엇을 낄지가 「둘 다 제일 센 것」으로 끝났다. 자리로 가르면
   「속도를 챙길까 마방을 챙길까」가 칸으로 갈린다.

   투구는 새로 생긴 자리다. 방어구 하나로 몸 전체를 덮던 것을 머리와 몸으로
   나눈 셈인데, 그만큼 방어구 하나하나의 값은 낮게 잡는다 (아래 GEAR 참고). */
function slotsFor(kind) {
  return [kind];
}

/* ---------- 가방 ----------

   예전에는 가방이 없었다. 밟으면 비교창이 뜨고 「교체할까 말까」만 정했다.
   그 설계에는 이유가 있었다 — 가방 관리가 없으면 턴제 리듬이 안 끊긴다.

   그런데 실제로 해 보니 아픈 자리가 하나 있었다. **셋(SETS)을 모을 수가 없다.**
   세 조각을 동시에 낄 수 없으니 「지금은 약하지만 나중에 맞출 것」을 들고
   갈 방법이 없고, 그래서 셋은 우연히 맞춰지는 것 말고는 노릴 수가 없었다.
   상황에 따라 바꿔 끼는 것(마방 높은 층에서 로브로)도 마찬가지다.

   그래서 가방을 둔다. 대신 **비교창을 없앤다** — 둘 다 두면 주울 때마다
   창이 뜨고 가방에서 또 고르게 되어 결정이 두 번이 된다.
   주우면 가방에 들어가고, 낄지는 가방을 열어서 정한다. */
const BAG_MAX = 12;

/* 가방이 꽉 찼는가. 12칸을 넘겨 담지 않는다 — 무제한이면 「무엇을 버릴까」가
   사라지고, 그러면 가방은 결정이 아니라 창고가 된다. */
function bagFull() {
  return (state.bag || []).length >= BAG_MAX;
}

function bagAdd(gear) {
  if (!gear || bagFull()) return false;
  state.bag = state.bag || [];
  state.bag.push(gear);
  return true;
}

function bagRemove(i) {
  if (!state.bag || i < 0 || i >= state.bag.length) return null;
  return state.bag.splice(i, 1)[0];
}

/* 가방의 것을 몸에 낀다. 끼고 있던 것은 가방으로 돌아간다 —
   버리지 않는다. 바꿔 끼는 것과 버리는 것은 다른 결정이라 따로 물어야 한다.

   가방이 꽉 차 있으면 자리를 바꿔 치기만 한다(빼낸 자리에 벗은 것이 들어간다).
   그래야 「가방이 꽉 차서 장비를 못 바꾼다」는 막다른 길이 안 생긴다. */
function bagEquip(i) {
  const p = state.player;
  const g = state.bag && state.bag[i];
  if (!g) return null;
  /* 정체불명은 **여기서** 드러난다. 예전에는 비교창이 열어 주고 이 함수는
     아예 거절했는데(`if (g.unknown) return null`), 비교창이 사라지면서 여는
     길이 통째로 없어졌다 — 주우면 가방에서 ? 로 앉아 버리는 수밖에 없었다.
     끼는 것과 여는 것을 갈라 두면 또 한쪽만 남으므로 한 함수 안에 둔다. */
  const wasUnknown = !!g.unknown;
  if (wasUnknown) revealGear(g);
  const slot = equipSlotFor(g, p);
  const old = p.gear[slot] || null;
  state.bag.splice(i, 1, ...(old ? [old] : []));
  p.gear[slot] = g;
  recalcStats(p);
  return { gear: g, old, slot, revealed: wasUnknown };
}

// 몸에서 벗어 가방으로. 가방이 꽉 찼으면 못 벗는다 — 갈 곳이 없으므로.
function bagUnequip(slot) {
  const p = state.player;
  const g = p.gear[slot];
  if (!g || bagFull()) return null;
  p.gear[slot] = null;
  state.bag.push(g);
  recalcStats(p);
  return g;
}

/* 발밑에 버린다. 되돌릴 수 있어야 하므로 없애지 않고 바닥에 놓는다 —
   「봤다」 표시를 달아 두면 무엇이었는지 바닥에서도 보인다.

   **정체불명은 예외다.** 아직 안 열어 본 것이라 나도 모르는 물건인데,
   seen 을 달면 바닥에 제 그림이 깔려서 버리는 것만으로 정체가 드러났다.
   그러면 「버렸다 줍는다」가 공짜 감정이 되어 도박이 통째로 사라진다. */
function bagDrop(i) {
  const g = bagRemove(i);
  if (!g) return null;
  const p = state.player;
  state.map.items.push({ x: p.x, y: p.y, type: 'gear', gear: g, seen: !g.unknown });
  return g;
}

/* 이 장비를 끼면 어느 자리에 들어가는가.
   자리마다 한 칸씩이라 고를 것이 없다 — 예전에는 장신구가 두 칸이라
   「어느 쪽을 밀어낼까」를 여기서 정해야 했다. */
function equipSlotFor(gear, player) {
  return slotsFor(gear.slot)[0];
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
  /* ---- 무기 : 근접 ----

     갈래(kind)가 닿는 자리를 정한다 — WEAPON_REACH 를 보라. 예전에는 넷이
     이름만 다르고 전부 같은 무기였다. 「단검·검·도끼·창」이 적혀 있는데
     화면에서 하는 일이 똑같으면 그건 무기가 넷인 게 아니라 하나다.

     숫자는 갈래의 값을 치르는 자리다:
       단검 — 제일 약하고 제일 빠르다. 대신 독을 바른다.
       검   — 중간. 대신 한 번에 세 칸을 쓸어 여럿에게 닿는다.
       창   — 중간. 대신 두 칸 밖에서 찌른다(맞지 않고 때린다).
       도끼 — 제일 세고 제일 굼뜨다. 대신 앞 한 칸뿐이다. */

  // 단검 — 정면 한 칸, 독
  { slot:'weapon', kind:'dagger', name:'낡은 단검', min:1,  rarity:'common',  mod:{ atk:2, spd:2 } },
  { slot:'weapon', kind:'dagger', name:'사냥칼',   min:4,  rarity:'fine',    mod:{ atk:4, spd:2 } },
  { slot:'weapon', kind:'dagger', name:'불씨 단검', min:4,  rarity:'ancient', mod:{ atk:6, spd:3 } },
  // 검 — 정면 + 대각선 셋을 쓸어낸다
  { slot:'weapon', kind:'sword',  name:'짧은 검',   min:1,  rarity:'common',  mod:{ atk:4 } },
  { slot:'weapon', kind:'sword',  name:'카타나',    min:5,  rarity:'fine',    mod:{ atk:6, spd:1 } },
  { slot:'weapon', kind:'sword',  name:'대검',      min:8,  rarity:'fine',    mod:{ atk:8, spd:-2 } },
  { slot:'weapon', kind:'sword',  name:'불씨 검',   min:9,  rarity:'ancient', mod:{ atk:10, sp:3 } },
  /* 창 — 두 칸 밖에서 찌른다. 갈래 하나에 무기 하나뿐인데, 그건 모자란 것이
     아니라 이 무기의 자리다. 다섯 사람 중 누구의 추천 무기도 아니라서
     주웠을 때만 써 보게 되는 것이 있어야 무기를 줍는 일에 뜻이 생긴다. */
  { slot:'weapon', kind:'spear',  name:'긴 창',     min:3,  rarity:'fine',    mod:{ atk:7, spd:1 } },
  // 도끼·망치 — 앞 한 칸, 대신 제일 아프다
  { slot:'weapon', kind:'axe',    name:'손도끼',    min:1,  rarity:'common',  mod:{ atk:5, spd:-1 } },
  { slot:'weapon', kind:'axe',    name:'전투 도끼', min:4,  rarity:'common',  mod:{ atk:7, spd:-1 } },
  { slot:'weapon', kind:'axe',    name:'쇠망치',    min:7,  rarity:'fine',    mod:{ atk:11, spd:-2 } },
  { slot:'weapon', kind:'axe',    name:'재의 도끼', min:9,  rarity:'ancient', mod:{ atk:14, spd:-2 } },
  // ---- 무기 : 활 (엘프 전용) ----
  // 활은 물리 원거리라는 세 번째 방식이다. 들고 있으면 기억 없이도 Z 로 쏜다.
  // only 가 붙은 장비는 그 사람일 때만 나온다 — 다른 사람에게는 "주워도 못 쓰는
  // 함정 아이템"이 되므로 애초에 굴리지 않는다.
  { slot:'weapon', kind:'bow', name:'사냥 활', min:1,  rarity:'common',  mod:{ atk:3, spd:1 },  bow:true, only:'elf' },
  { slot:'weapon', kind:'bow', name:'긴 활',   min:5,  rarity:'fine',    mod:{ atk:6, spd:1 },  bow:true, only:'elf' },
  { slot:'weapon', kind:'bow', name:'재의 활', min:9,  rarity:'ancient', mod:{ atk:9, spd:2 },  bow:true, only:'elf' },
  // ---- 무기 : 마법 ----
  /* 지팡이의 주문은 반드시 **기사의 기본 공격(6)보다 높아야** 한다.
     같기만 해도 물리 판정이 유지되어 주울 이유가 없는 함정 아이템이 된다.
     성장(grow.pow)은 공격과 주문에 같이 붙으므로 레벨이 올라도 차이는 그대로다 —
     그래서 1레벨에서 넘기면 끝까지 넘고, 같으면 끝까지 막힌다.
     (tools/test-levels.js 가 다섯 레벨에서 이걸 재고 있다) */
  // 같거나 낮으면 들어도 물리 판정이 유지되어 주울 이유가 없는 함정 아이템이 된다.
  /* 마법사가 손에 쥐고 시작하는 것. 나무 지팡이(주문 9)를 그대로 쥐여 주면
     1층부터 주문 17 로 출발하는데, 마법사는 이미 다섯 중 제일 순한 사람이라
     그 위에 더 얹을 자리가 없다. 시작 무기는 **그 갈래에서 제일 약한 것**이어야
     한다 — 시작을 정하는 물건이지 앞서게 하는 물건이 아니다.

     주문이 4 뿐이라 「주문은 기본 공격(5)보다 높아야 한다」는 아래 규칙에
     어긋난다 — 그래서 활처럼 only 로 마법사에게만 묶는다. 남에게는 애초에
     안 나오므로 함정이 될 일이 없고, 마법사는 기본 주문(4)에 얹어 쓴다. */
  /* 지팡이는 4·9·12·18 이었다(지금 4·7·9·13). 검이 4·6·8·10, 도끼가 5·7·11·14 인 것을 생각하면
     꼭대기가 거의 두 배다. 그런데 몸스터의 마방(평균 2.9)과 방어(2.8)는 같아서
     **그 두 배를 막아 주는 것이 없었다.**

     마법사 200판 클리어 66.5%가 여기서 나왔다. 사거리를 줄이고 위력을 깎아 봤는데
     소수점도 안 움직였다 — 원거리가 아니라 그냥 더 세게 때렸던 것이다.

     도끼(최고 14) 밑으로 내린다. 지팡이는 멀리서도 쓰고 번지기까지 하므로
     순수 수치로 제일 높을 이유가 없다. 시작 지팡이(4)는 그대로 둔다 —
     첫 칸의 세기는 맞게 맞춰져 있었다. */
  { slot:'weapon', kind:'staff', name:'낡은 지팡이', min:1,  rarity:'common',  mod:{ sp:4 }, only:'wizard' },
  { slot:'weapon', kind:'staff', name:'나무 지팡이', min:2,  rarity:'common',  mod:{ sp:7 } },   // 6 은 기사 공격과 같아서 함정이 됐다
  { slot:'weapon', kind:'staff', name:'주술 지팡이', min:5,  rarity:'fine',    mod:{ sp:9, md:1 } },
  { slot:'weapon', kind:'staff', name:'재의 지팡이', min:9,  rarity:'ancient', mod:{ sp:13, md:3 } },

  /* ---- 투구 ----
     새로 생긴 자리다. 몸 하나로 덮던 것을 머리와 몸으로 나눈 셈이므로
     **방어구 쪽 값을 그만큼 낮춘다** — 안 낮추면 방어가 통째로 한 단계 오른다.
     투구는 방어구보다 얇게, 대신 마방을 조금 얹는다. 머리를 지키는 것이
     물리보다 「알아채는 것」에 가깝다는 쪽이 이 게임의 결에 맞는다. */
  { slot:'helm',   name:'가죽 두건',   min:1,  rarity:'common',  mod:{ def:1 } },
  { slot:'helm',   name:'쇠 투구',     min:4,  rarity:'common',  mod:{ def:2, spd:-1 } },
  { slot:'helm',   name:'마법사 후드', min:3,  rarity:'common',  mod:{ md:3 } },
  { slot:'helm',   name:'뿔 투구',     min:7,  rarity:'fine',    mod:{ def:4, spd:-1 } },
  { slot:'helm',   name:'어둠의 후드', min:7,  rarity:'fine',    mod:{ md:5, sp:1 } },
  { slot:'helm',   name:'재의 투구',   min:9,  rarity:'ancient', mod:{ def:3, md:4 } },

  /* ---- 방어구 ----
     투구가 생기면서 값을 한 단계씩 낮췄다. 머리와 몸을 합친 값이
     예전 방어구 하나쯤 되게 맞춘 것이다. */
  { slot:'armor',  name:'가죽 갑옷',   min:1,  rarity:'common',  mod:{ def:2 } },
  { slot:'armor',  name:'사슬 갑옷',   min:3,  rarity:'common',  mod:{ def:3, spd:-1 } },
  { slot:'armor',  name:'마법사 로브', min:3,  rarity:'common',  mod:{ md:3, sp:1 } },
  { slot:'armor',  name:'판금 갑옷',   min:7,  rarity:'fine',    mod:{ def:5, spd:-2 } },
  { slot:'armor',  name:'수호의 로브', min:7,  rarity:'fine',    mod:{ md:5, sp:2 } },
  { slot:'armor',  name:'그을린 갑옷', min:6,  rarity:'ancient', mod:{ def:4, md:2 } },
  { slot:'armor',  name:'재의 외투',   min:10, rarity:'ancient', mod:{ def:5, md:5 } },

  /* ---- 신발 ----
     장신구에서 갈라져 나온 자리. 여기는 **속도가 사는 곳**이다 —
     속도는 이 게임에서 곧 생존이라(chill 이 체력보다 아픈 이유가 그것이다)
     한 자리를 통째로 주면 「빨라질까 버틸까」가 장비 고르는 축이 된다. */
  { slot:'boots',  name:'가죽 장화',   min:1,  rarity:'common',  mod:{ spd:2 } },
  { slot:'boots',  name:'무거운 장화', min:4,  rarity:'common',  mod:{ def:2, spd:-1 } },
  { slot:'boots',  name:'날랜 장화',   min:6,  rarity:'fine',    mod:{ spd:3 } },
  { slot:'boots',  name:'재의 장화',   min:9,  rarity:'ancient', mod:{ spd:4, md:2 } },

  /* ---- 장신구 ----
     신발이 빠져나가면서 여기는 마방·체력·주문만 남았다. 성격이 하나로
     모이니 「무엇을 더할까」가 또렷해진다. */
  { slot:'trinket', name:'부적',       min:2,  rarity:'common',  mod:{ md:2 } },
  { slot:'trinket', name:'생명의 반지',min:4,  rarity:'common',  mod:{ maxHp:6 } },
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
  /* 궁수 셋은 **제일 일찍 맞춰지는데 제일 크게 줬었다.** 두 조각에 속도 2,
     다 맞추면 속도 5 · 공격 3 — 속도는 한 턴의 행동 횟수라 이 게임에서 값이
     제일 무겁고, 이 셋을 입는 사람은 이미 제일 빠른 엘프(13)다.
     제일 쉬운 것에 제일 센 값이 붙어 있으면 고를 일이 다시 없어진다.

     성격은 그대로 두되(빠른 셋), 두 조각짜리 값을 반으로 줄이고 큰 몫을
     **세 번째 조각**으로 옮겼다. 셋 맞추기의 재미는 마지막 하나에 있다.
     다 맞춘 값은 속도 3 · 공격 3 — 창병(공격 5 · 속도 1)과 크기가 같다. */
  archer: { name: '궁수', pieces: ['긴 활', '가죽 갑옷', '날랜 장화'],
            two: { spd: 1 },  three: { spd: 2, atk: 3 },
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
  if (!g || g.slot !== 'weapon') return null;
  if (g.kind) return g.kind;
  // 갈래가 안 적힌 옛 저장이나 손으로 만든 물건 — 예전 규칙으로 갈라 준다
  if (g.bow) return 'bow';
  return ((g.mod.sp || 0) > (g.mod.atk || 0)) ? 'staff' : 'sword';
}

/* ---------- 닿는 자리 ----------

   정면을 (1,0) 으로 놓고 적은 **상대 좌표**다. 실제 방향은 meleeTiles() 가
   돌려서 만든다 — 네 방향을 네 번 적으면 반드시 한 군데가 어긋난다.

   init 이 붙은 칸은 「거기 있는 적을 보고 공격을 시작할 수 있는」 자리다.
   검의 대각선에는 안 붙였는데, 붙이면 옆에 적이 있을 때마다 앞으로 못 걷는다 —
   빈 칸을 향해 걸었는데 사람이 칼을 휘두르면 그건 범위가 아니라 고장이다.
   검의 대각선은 **정면을 칠 때 함께 쓸리는** 자리고, 창의 두 칸째는
   **거기부터 찌를 수 있는** 자리다. 이 차이가 두 무기의 전부다.

   mult 는 그 칸에 들어가는 피해 배율이다. */
const WEAPON_REACH = {
  dagger: { poison: true,
            tiles: [{ dx: 1, dy: 0, mult: 1, init: true }] },
  sword:  { tiles: [{ dx: 1, dy: 0, mult: 1, init: true },
                    { dx: 1, dy: -1, mult: 0.6 },
                    { dx: 1, dy: 1, mult: 0.6 }] },
  spear:  { tiles: [{ dx: 1, dy: 0, mult: 1, init: true },
                    { dx: 2, dy: 0, mult: 0.85, init: true }] },
  axe:    { tiles: [{ dx: 1, dy: 0, mult: 1, init: true }] },
  // 원거리는 여기 규칙을 안 쓴다 (rangedAttack 이 따로 본다)
  bow:    null,
  staff:  null,
};

/* 갈래의 이름과, 그 갈래가 하는 일 한 줄.

   범위를 만들어 놓고 화면 어디에도 안 적으면 사람은 그런 게 있는 줄 모른다.
   비교창의 「무기」 자리에 이걸 대신 적는다 — 무엇을 얻고 무엇을 잃는지가
   숫자 아래 한 줄로 붙어야, 도끼를 버리고 검을 드는 것이 판단이 된다. */
const KIND_NAME = {
  dagger: '단검', sword: '검', spear: '창', axe: '도끼', bow: '활', staff: '지팡이',
};
const KIND_NOTE = {
  dagger: '앞 한 칸 · 독을 바른다',
  sword:  '앞과 그 양옆 · 세 칸을 쓴다',
  spear:  '두 칸 밖에서 찌른다',
  axe:    '앞 한 칸 · 제일 아프다',
  bow:    '멀리 쏜다',
  staff:  '주문으로 싸운다',
};

function kindName(g) {
  const k = weaponKind(g);
  return (k && KIND_NAME[k]) || SLOT_NAME[g.slot];
}
function kindNote(g) {
  const k = weaponKind(g);
  return (k && KIND_NOTE[k]) || '';
}

// 맨손. 무기를 잃은 상태에서도 앞은 칠 수 있어야 한다.
const BARE_REACH = { tiles: [{ dx: 1, dy: 0, mult: 1, init: true }] };

function reachOf(gear) {
  const k = weaponKind(gear);
  return (k && WEAPON_REACH[k]) || BARE_REACH;
}

/* 이 무기로 dir 방향을 쳤을 때 닿는 칸들 — 세계 좌표로.
   정면을 앞으로, 그 왼손 쪽을 옆으로 놓고 돌린다. */
function meleeTiles(x, y, dir, gear) {
  const fx = dir.dx, fy = dir.dy;      // 앞
  const sx = -dir.dy, sy = dir.dx;     // 옆 (오른쪽)
  return reachOf(gear).tiles.map(t => ({
    x: x + fx * t.dx + sx * t.dy,
    y: y + fy * t.dx + sy * t.dy,
    mult: t.mult,
    init: !!t.init,
  }));
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
      stock.push({ kind: 'gear', gear: g, price: priceFor(gearPrice(g)), sold: false });
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

/* 값을 깎는 사람 (드워프의 discount).

   가격을 매기는 곳은 여러 군데인데(상점·대장간·되팔기) 깎는 규칙은 하나여야 한다.
   여기 한 함수를 지나가게 해 두면 나중에 값 붙는 자리가 늘어도 어긋나지 않는다.

   equipSlotFor 는 이 함수를 **안 쓴다** — 거기서 필요한 것은 "둘 중 어느 쪽이
   값진가"이고, 둘 다 같은 비율로 깎이면 답이 안 바뀌기 때문이다. */
function priceFor(n) {
  const d = currentHero().discount;
  return d ? Math.max(1, Math.round(n * d)) : n;
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

  /* 층이 깊어질수록 저절로 두꺼워지는 사람 (드워프의 defPerFloor).

     피해가 `max(1, 공격 - 방어)` 라 뺄셈이므로, 방어를 처음에 몰아 주면
     초반은 전부 1 데미지로 공짜가 되고 후반에는 몬스터 공격이 넘어서서
     아무 소용이 없어진다. 레벨 성장은 레벨을 올려야 붙으니 그 기울기를
     못 따라간다 — 그래서 **층 자체에** 매단다. */
  const perFloor = currentHero().defPerFloor;
  if (perFloor && typeof state !== 'undefined' && state.depth) {
    s.def = (s.def || 0) + Math.floor((state.depth - 1) * perFloor);
  }

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
