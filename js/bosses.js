/* =========================================================
   bosses.js — 5 · 10 · 15층의 주인

   보스는 주기적으로 예고 동작을 하고, 그 다음 턴에 기술을 쓴다.
   예고된 칸은 화면에 표시되며, 그 자리를 벗어나면 맞지 않는다.
   피할 방법이 없는 기술은 밸런싱 문제가 아니라 설계 실패다 —
   그래서 모든 보스 기술은 "표시된 칸"으로만 들어간다.

   기술은 다섯이다. 마지막 보스는 그걸 전부 쓴다 —
   당신이 여기까지 오며 본 것을 그대로 돌려주는 셈이다.

   ---- 기술을 늘렸는데 그릇을 같이 키운 이유 ----

   기술 한 번은 예고 한 턴과 터지는 한 턴을 쓴다. 그 두 턴은 평타를
   안 치는 턴이므로, **피해 버리면 보스가 오히려 약해진다.**
   실제로 기술을 셋 더하고 간격을 좀혀더니 봇 기준 클리어율이
   25 → 32% 로 올라갔다 — 만들려던 것과 정반대다.

   그래서 그릇을 키운다(66→82 · 104→126 · 190→230). 피하는 것으로 벌지 않는
   값은 그릇뿐이다 — 기술은 사람을 긴장시키고, 그릇은 싸움을 길게 한다.

   ---- 시뮬로는 이 기술들을 재지 못한다 ----

   tools/sim.js 의 봇은 예고된 칸을 **100% 피한다**(markedTiles 를 그대로 읽는다).
   그러니 봇에게는 어떤 기술을 더하든 공짜 턴이 늘 뿐이다.
   여기서 재는 숫자는 「보스가 얼마나 무서운가」가 아니라
   「생각 없이 보스를 약하게 만들지는 않았는가」일 뿐이다.
   패턴이 실제로 무서운지는 **사람이 해 봐야 안다.**
   ========================================================= */

const BOSSES = {
  5: {
    id: 'gate', name: '문지기', g: 'K', c: '#D9884A',
    hp: 82, atk: 10, sp: 0, def: 4, md: 3, spd: 9, gold: 45,
    // 달려들고 · 갈라 치고 · 내리친다. 달려드는 것이 먼저여야 거리가 생긴다
    skills: ['lunge', 'sweep', 'slam'], interval: 3,
    intro: '문지기는 당신을 보고도 물러서지 않습니다.',
  },
  10: {
    id: 'named', name: '이름을 가진 것', g: 'W', c: '#9B7BD4',
    hp: 126, atk: 7, sp: 15, def: 5, md: 8, spd: 10, gold: 85,
    // 이름을 부르고 · 뒷걸음을 붙잡고 · 달려든다
    skills: ['curse', 'pin', 'lunge'], interval: 3,
    intro: '그것은 당신을 알아봅니다.',
  },
  15: {
    id: 'keeper', name: '등불지기', g: '@', c: '#E9954A',
    hp: 230, atk: 15, sp: 14, def: 8, md: 8, spd: 12, gold: 0,
    /* 앞의 둘이 쓰던 것을 전부 쓴다 — 여기까지 오며 본 것을
       그대로 돌려받는 셈이다. 간격이 2 라 쉬는 턴이 거의 없다. */
    skills: ['lunge', 'curse', 'sweep', 'pin', 'slam'], interval: 2, final: true,
    intro: '그것은 당신의 얼굴을 하고 있습니다.',
  },
};

const BOSS_SKILL = {
  // 자기 주변 여덟 칸. 예고를 보면 물러서면 된다.
  slam: {
    warn: (b) => josa(b.name, '이', '가') + ' 숨을 크게 들이켭니다.',
    fire: (b) => josa(b.name, '이', '가') + ' 주변을 내리칩니다.',
    magic: false,
    bonus: 3,
    tiles(b) {
      const out = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy) out.push([b.x + dx, b.y + dy]);
      return out;
    },
  },

  /* 예고한 순간에 서 있던 그 칸. 한 걸음이면 벗어난다.

     처음에는 그 자리를 둘러싼 3x3 이었다. 그런데 이 게임은 대각선으로 걷지 못하므로
     어느 쪽으로 한 칸을 가도 그 아홉 칸 안에 그대로 남는다 — 벗어나려면 두 칸이
     필요한데 주어지는 건 한 턴이다. **피할 수 없는 기술이었다.**
     넓이를 줄이는 대신 한 대가 아프게 했다. 무시하고 버티는 선택지를 없애는 것이
     이 기술이 원래 하려던 일이다.

     보스 기술의 넓이를 바꿀 때는 tools/test-boss.js 의 「한 걸음이면 피할 수 있는가」를
     반드시 다시 돌릴 것. 대각선이 없는 게임에서 넓이를 한 칸이라도 늘리면
     그 순간 다시 피할 수 없는 기술이 된다. */
  curse: {
    warn: (b) => josa(b.name, '이', '가') + ' 당신의 이름을 부릅니다.',
    fire: () => '부른 자리가 무너집니다.',
    magic: true,
    bonus: 8,
    tiles(b, player) {
      return [[player.x, player.y]];
    },
  },

  /* ---------- 아래 셋은 나중에 더한 것 ----------

     앞의 둘만 있을 때 보스는 **한 대도 못 때렸다.**
     규칙이 틀린 것은 아니었다 — 둘 다 예고되고 한 걸음이면 피해졌다.
     문제는 **네 방향이 전부 열려 있었다**는 것이다. 아무 데나 한 칸 가면
     되니 피하는 것이 판단이 아니라 절차였고, 절차는 긴장을 만들지 않는다.

     그래서 새 기술은 **피할 수 있되, 고를 것을 줄인다.** 네 길 중 둘만
     남기거나(sweep·pin), 피해도 거리가 사라지게 한다(lunge).
     「한 걸음이면 빠져나갈 길이 적어도 하나는 있다」는 규칙은 그대로다 —
     tools/test-boss.js 가 기술마다 그걸 센다. */

  /* 갈라 치기 — 보스와 나 사이의 결을 따라 세 칸.
     물러서는 것도 다가서는 것도 막힌다 — **옆으로 비켜야 한다.**
     물러나는 것이 언제나 정답이면 그건 고르는 것이 아니다. */
  sweep: {
    warn: (b) => josa(b.name, '이', '가') + ' 무기를 높이 쌀다가 멈춥니다.',
    fire: (b) => josa(b.name, '이', '가') + ' 결을 따라 갈라 칩니다.',
    magic: false,
    bonus: 4,
    tiles(b, player) {
      const dx = player.x - b.x, dy = player.y - b.y;
      // 잡은 결은 보스와 나를 잉는 줘이 축 하나다
      const ax = Math.abs(dx) >= Math.abs(dy) ? 1 : 0;
      const ux = ax ? 1 : 0, uy = ax ? 0 : 1;
      return [
        [player.x - ux, player.y - uy],
        [player.x, player.y],
        [player.x + ux, player.y + uy],
      ];
    },
  },

  /* 발목 — 내 자리와 **물러날 칸**을 함께 지운다.
     보스에게서 멀어지는 쪽이 막히므로 옆으로 가거나 **보스 쪽으로**
     들어가야 한다. 도망치는 사람을 안으로 몰아넣는 기술이다. */
  pin: {
    warn: (b) => josa(b.name, '이', '가') + ' 당신의 뒷걸음을 붅니다.',
    fire: () => '물러설 자리가 남지 않습니다.',
    magic: true,
    bonus: 5,
    tiles(b, player) {
      const dx = player.x - b.x, dy = player.y - b.y;
      const ax = Math.abs(dx) >= Math.abs(dy) ? 1 : 0;
      const ux = ax ? Math.sign(dx) || 1 : 0;
      const uy = ax ? 0 : Math.sign(dy) || 1;
      return [
        [player.x, player.y],
        [player.x + ux, player.y + uy],   // 보스에서 멀어지는 쪽
      ];
    },
  },

  /* 달려든다 — 보스와 나 사이의 결을 통째로 친 뒤 **그 끝까지 옥겨 온다.**

     이 게임의 보스가 한 대도 못 때린 진짜 이유는 기술이 약해서가 아니라
     **거리가 안 좁혀서**였다. 보스와 사람의 속도가 비슷하니 물러서면 영원히
     물러설 수 있었다. 이 기술은 피해도 보스가 눈앞에 서 있게 만든다 —
     피하는 것이 공짜가 아니게 하는 유일한 길이다. */
  lunge: {
    warn: (b) => josa(b.name, '이', '가') + ' 몸을 낮추고 당신을 노려봅니다.',
    fire: (b) => josa(b.name, '이', '가') + ' 단숨에 달려듭니다.',
    magic: false,
    bonus: 2,
    tiles(b, player) {
      const dx = player.x - b.x, dy = player.y - b.y;
      const ax = Math.abs(dx) >= Math.abs(dy) ? 1 : 0;
      const ux = ax ? (Math.sign(dx) || 1) : 0;
      const uy = ax ? 0 : (Math.sign(dy) || 1);
      const len = Math.max(1, Math.min(6, ax ? Math.abs(dx) : Math.abs(dy)));
      const out = [];
      for (let i = 1; i <= len; i++) out.push([b.x + ux * i, b.y + uy * i]);
      return out;
    },
    /* 터진 뒤에 보스가 그 결의 끝으로 옴긴다.
       비어 있는 칸까지만 간다 — 사람을 밀고 들어가지는 않는다. */
    onFire(b, player, tiles) {
      for (let i = tiles.length - 1; i >= 0; i--) {
        const [x, y] = tiles[i];
        if (!isWalkable(state.map, x, y)) continue;
        if (x === player.x && y === player.y) continue;
        if (monsterAt(x, y)) continue;
        b.x = x; b.y = y;
        return;
      }
    },
  },
};

function makeBoss(def, x, y) {
  const m = makeMonster({
    id: def.id, name: def.name, g: def.g, c: def.c,
    min: 1, hp: def.hp, atk: def.atk, sp: def.sp,
    def: def.def, md: def.md, spd: def.spd, gold: def.gold,
  }, x, y);

  m.boss = true;
  m.bossDef = def;
  m.charge = 0;
  m.skillIndex = 0;
  m.pending = null;      // { skill, tiles }
  m.ranged = false;      // 보스는 평타 대신 기술로 거리를 다룬다
  return m;
}

/* ---------- 보스의 한 턴 ---------- */

function bossTurn(b) {
  const p = state.player;

  // 1) 예고해 둔 기술이 있으면 이번 턴에 터진다
  if (b.pending) {
    const { skill, tiles } = b.pending;
    b.pending = null;
    b.marks = null;

    const S = BOSS_SKILL[skill];
    Sound.play('bossHit');
    UI.log(S.fire(b), 'hurt');
    Render.addShake(12);
    for (const [x, y] of tiles) Render.addFloater(x, y, '·', COLORS.ember);

    const inside = tiles.some(([x, y]) => x === p.x && y === p.y);
    if (!inside) {
      UI.log('당신은 그 자리에 없었습니다.', 'good');
      if (S.onFire) S.onFire(b, p, tiles);
      /* 피했다고 보스가 가만히 서 있지는 않는다 — 한 걸음 다가온다.

         이게 보스가 한 대도 못 때린 숨은 이유였다. 기술 한 번은 예고 한 턴 +
         터지는 한 턴을 쓰는데, 피해 버리면 **두 턴이 통째로 공짜**가 된다.
         기술을 늘리면 오히려 보스가 약해지는 것이 그 탓이다 — 실제로
         간격을 3→2 로 줄였더니 봇 기준 클리어율이 25→29.5% 로 **올라갔다.**

         때리지는 않는다. 피한 것은 피한 것이다 — 다만 거리를 되돌려 준다. */
      if (!isNextTo(b.x, b.y, p.x, p.y)) stepToward(b, p.x, p.y);
      return;
    }

    const power = (S.magic ? b.stats.sp : b.stats.atk) + S.bonus;
    const armor = S.magic ? p.stats.md : p.stats.def;
    const dmg = Math.max(2, Math.round((power - armor) * (0.9 + Math.random() * 0.2)));
    p.hp -= dmg;
    p.flash = CFG.FLASH_TIME;
    state.hurtThisFloor = true;
    Render.addFloater(p.x, p.y, String(dmg), S.magic ? COLORS.cast : COLORS.damage);
    Render.addShake(16);
    UI.log(dmg + '의 피해를 입었습니다.', 'hurt');
    UI.updateHud(state);
    if (p.hp <= 0) kill(p);
    if (S.onFire) S.onFire(b, p, tiles);
    return;
  }

  const dist = chebyshev(b.x, b.y, p.x, p.y);
  const canSee = hasLineOfSight(state.map, b.x, b.y, p.x, p.y) && dist <= 12;

  // 2) 충전이 다 찼고 플레이어가 보이면 예고한다
  if (canSee) b.charge++;
  if (canSee && b.charge >= b.bossDef.interval) {
    b.charge = 0;
    const skill = b.bossDef.skills[b.skillIndex % b.bossDef.skills.length];
    b.skillIndex++;
    const S = BOSS_SKILL[skill];
    const tiles = S.tiles(b, p).filter(([x, y]) => isWalkable(state.map, x, y));
    b.pending = { skill, tiles };
    b.marks = tiles;
    Sound.play('bossWarn');
    UI.log(S.warn(b), 'hit');
    return;
  }

  // 3) 평소에는 쫓아와 때린다
  if (!canSee) { if (chance(0.4)) stepRandom(b); return; }
  if (isNextTo(b.x, b.y, p.x, p.y)) {
    attack(b, p, { dx: Math.sign(p.x - b.x), dy: Math.sign(p.y - b.y) });
    return;
  }
  stepToward(b, p.x, p.y);
}
