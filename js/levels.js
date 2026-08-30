/* =========================================================
   levels.js — 판 안에서의 성장

   기억은 판을 넘어 남는 성장이고, 레벨은 이 판에서만 사는 성장이다.
   둘 다 있어야 하는 이유가 다르다 —
     기억만 있으면 이번 판에 아무리 잘해도 이번 판이 편해지지 않아서
     몬스터를 잡을 이유가 없어진다. 피해서 계단만 찾는 게 늘 이득이 된다.
     레벨만 있으면 죽는 순간 전부 사라져서 다시 시작할 이유가 없다.
   그래서 몬스터를 잡는 보람은 레벨로, 판을 반복하는 보람은 기억으로 나눠 둔다.

   ---------------------------------------------------------
   왜 공격과 주문이 같은 값(pow)으로 함께 오르는가

   전투 판정의 유일한 규칙이 "주문 > 공격이면 마법"이다.
   레벨이 공격만 올리면 8레벨 기사에게는 주술 지팡이의 주문 +12 가
   공격을 못 넘어서, 주워도 아무 일이 안 일어나는 함정 아이템이 된다.
   둘을 같이 올리면 순서가 절대 뒤집히지 않아서
   레벨이 몇이든 지팡이는 지팡이 노릇을 한다.
   사람마다 다른 개성은 체력·방어·마방·속도 쪽에 둔다.
   ========================================================= */

const LV = {
  MAX: 20,

  // 다음 레벨까지 필요한 경험치. 한 판을 끝까지 오르면 9~11 레벨쯤 된다.
  need(level) { return 38 + (level - 1) * 30; },

  // 몬스터가 주는 경험치 — 체력과 화력에서 뽑는다.
  // 따로 표를 만들면 몬스터를 추가할 때마다 손이 하나 더 간다.
  // 살아 있는 몬스터를 그대로 받는다 (죽은 뒤에 부르므로 hp 가 아니라 maxHp).
  ofMonster(m) {
    return Math.max(1, Math.round(m.maxHp / 4 + m.stats.atk + m.stats.sp));
  },

  // 층을 하나 올라선 것도 성장이다. 싸움을 피해 다니는 사람도
  // 아주 멈춰 있지는 않아야 다음 층에서 벽에 막히지 않는다.
  ofFloor(depth) { return 8 + depth * 3; },

  // 레벨로 붙는 보정. 1레벨은 보정이 없다.
  mod() {
    const g = currentHero().grow || {};
    const n = (state.level || 1) - 1;
    const out = {};
    if (!n) return out;
    const pow = Math.floor((g.pow || 1) * n);
    out.atk = pow;
    out.sp = pow;                      // 둘을 같이 올려 마법/물리 순서를 지킨다
    for (const k of ['maxHp', 'def', 'md', 'spd']) {
      const v = Math.floor((g[k] || 0) * n);
      if (v) out[k] = v;
    }
    return out;
  },
};

/* 경험치를 준다. 한 번에 여러 레벨이 오를 수 있다 —
   보스를 잡은 직후에 두 단계가 오르는 것은 막을 이유가 없다. */
function gainXp(amount) {
  if (!state.player || !state.player.alive || amount <= 0) return;
  state.xp += amount;

  let gained = 0;
  while (state.level < LV.MAX && state.xp >= LV.need(state.level)) {
    state.xp -= LV.need(state.level);
    state.level++;
    gained++;
  }
  if (!gained) { UI.updateHud(state); return; }

  const p = state.player;
  recalcStats(p);                       // 늘어난 최대 체력만큼은 여기서 따라 오른다
  // 그 위에 얹는 회복. 레벨업이 위기를 뒤집는 순간이 되어야
  // "한 마리 더 잡고 갈까"라는 판단이 생긴다.
  p.hp = clamp(p.hp + Math.round(p.maxHp * 0.25) * gained, 1, p.maxHp);

  Sound.play('level');
  Render.addFloater(p.x, p.y, '레벨 ' + state.level, COLORS.heal);
  Render.addShake(6);
  UI.log('몸이 기억을 되찾듯 단단해집니다. — 레벨 ' + state.level, 'good');
  UI.updateHud(state);
  checkLevelAchievements();
}
