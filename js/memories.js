/* =========================================================
   memories.js — 되찾는 기억 (영구 성장)

   기억은 능력이자 서사다. 되찾는 순간 뜨는 문장이 곧 그 능력의 설명이고,
   그래서 따로 된 설명문이 필요 없다.

   「끄던 손」이 이야기가 뒤집히는 지점이다. 그 전까지 플레이어는
   자신이 피해자인 줄 안다. 그리고 그 기억의 효과가 하필 불씨를 끄는
   능력이라는 게 핵심이다 — 끄는 법을 기억해냈으니 끌 수 있게 되는 것이다.
   ========================================================= */

/* 「던지던 손」이 여기 있었다. 원거리 조작을 여는 기억이었는데 없앴다.

   조작을 기억에 매달아 두면 **같은 사람으로 시작해도 판마다 다른 게임**이 된다 —
   운이 좋으면 3층부터 던지고 나쁘면 끝까지 못 던진다. 고르는 화면에서 「이 사람은
   이렇게 싸운다」를 말해 놓고 그걸 주사위에 맡긴 셈이었다.
   원거리는 이제 마법사와 엘프의 것이고, 첫 칸부터 손에 들려 있다 (game.js 의 canRanged).

   되짚기의 「던지던 손」 장(章)은 그대로 둔다. 그건 붓을 던진 밤의 이야기지
   조작이 아니다 — STORY 는 되찾은 기억과 상관없이 전부 흐른다. */
const MEMORIES = [
  { id: 'climb',  name: '오르던 발',
    effect: '속도 +2',
    line: '이 계단을 수없이 올랐다. 몸이 먼저 안다.',
    mod: { spd: 2 } },

  { id: 'fire',   name: '불을 만지던 손',
    effect: '맞으면 상대가 탄다',
    line: '뜨거움은 오래전에 익숙해졌다.' },

  { id: 'roster', name: '명부',
    effect: '처음 보는 것의 수치를 안다',
    line: '당신은 이름을 적는 일을 했다.' },

  { id: 'first',  name: '첫 번째 이름',
    effect: '최대 체력 +10',
    line: '처음 적어 올린 이름이 떠오른다. 어렸다.',
    mod: { maxHp: 10 } },

  { id: 'night',  name: '돌아선 밤',
    effect: '모닥불을 두 번 쓴다',
    line: '열두 번째 층에서 돌아선 적이 있다. 그날은 적지 않았다.' },

  { id: 'douse',  name: '끄던 손',
    effect: '불씨 밝기를 바꾼다 — F',
    line: '불을 끈 것은 당신이었다.' },

  { id: 'warmth', name: '남겨진 온기',
    effect: '쓰러져도 한 번 일어난다',
    line: '누군가 당신을 위해 불을 피워두었다.' },

  { id: 'face',   name: '당신의 얼굴',
    effect: '층의 성격을 미리 안다',
    line: '위에 있는 것이 무엇인지 알게 되었다.' },
];

const MEM = {
  has(id) { return state.memories && state.memories.has(id); },

  def(id) { return MEMORIES.find(m => m.id === id); },

  // 아직 되찾지 못한 기억 중 하나
  nextCandidate() {
    const left = MEMORIES.filter(m => !state.memories.has(m.id));
    return left.length ? choice(left) : null;
  },

  // 기억으로 붙는 스탯 보정. 사람에 따라 다르게 붙는 기억(heroMod)이 있다.
  mod() {
    const out = {};
    const hero = currentHero().id;
    for (const m of MEMORIES) {
      if (!this.has(m.id)) continue;
      const mod = (m.heroMod && m.heroMod[hero]) || m.mod;
      if (!mod) continue;
      for (const [k, n] of Object.entries(mod)) out[k] = (out[k] || 0) + n;
    }
    return out;
  },
};

/* ---------- 누적 확률 보정 ----------
   확률에만 맡기면 운 나쁜 판은 성장 없이 끝난다.
   그게 반복되면 "해도 안 늘잖아"가 되어 그대로 이탈로 이어진다.

   그래서 기억을 얻지 못한 채 판이 끝날 때마다 pity 가 오르고,
   얻으면 0으로 돌아간다. pity 는 두 군데에 작용한다.
     1) 고대의 등급 장비가 더 자주 나온다  (굴릴 기회 자체를 늘린다)
     2) 굴렸을 때 기억이 나올 확률이 오른다
   플레이어에게 알릴 필요는 없다. 표시하지 않아도 체감은 확실히 부드러워진다. */

function memoryChance(pity) {
  return clamp(0.62 + pity * 0.2, 0, 0.98);
}

// 굴릴 기회 자체를 늘리는 값. pity 에 더해,
// 아직 기억이 하나도 없으면 얹어 준다 —
// 처음 두어 판이 아무 성과 없이 끝나면 사람은 그냥 그만둔다.
function ancientLuck() {
  return state.pity + (state.memories.size === 0 ? 3 : 0);
}
