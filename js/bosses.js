/* =========================================================
   bosses.js — 5 · 10 · 15층의 주인

   보스는 주기적으로 예고 동작을 하고, 그 다음 턴에 기술을 쓴다.
   예고된 칸은 화면에 표시되며, 그 자리를 벗어나면 맞지 않는다.
   피할 방법이 없는 기술은 밸런싱 문제가 아니라 설계 실패다 —
   그래서 모든 보스 기술은 "표시된 칸"으로만 들어간다.

   기술은 셋이 아니라 둘이다. 마지막 보스는 앞의 둘을 함께 쓴다.
   당신이 여기까지 오며 본 것을 그대로 돌려주는 셈이다.
   ========================================================= */

const BOSSES = {
  5: {
    id: 'gate', name: '문지기', g: 'K', c: '#D9884A',
    hp: 66, atk: 10, sp: 0, def: 4, md: 3, spd: 9, gold: 45,
    skills: ['slam'], interval: 3,
    intro: '문지기는 당신을 보고도 물러서지 않습니다.',
  },
  10: {
    id: 'named', name: '이름을 가진 것', g: 'W', c: '#9B7BD4',
    hp: 104, atk: 7, sp: 15, def: 5, md: 8, spd: 10, gold: 85,
    skills: ['curse'], interval: 3,
    intro: '그것은 당신을 알아봅니다.',
  },
  15: {
    id: 'keeper', name: '등불지기', g: '@', c: '#E9954A',
    hp: 190, atk: 15, sp: 14, def: 8, md: 8, spd: 12, gold: 0,
    skills: ['slam', 'curse'], interval: 2, final: true,
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
