/* =========================================================
   pets.js — 따라오는 것

   5층의 문지기를 넘으면 둘 중 하나가 따라붙는다.

   왜 5층인가. 그 전까지는 조작을 익히는 구간이고, 첫 보스를 넘긴 순간이
   이 게임에서 처음으로 "해냈다"가 되는 자리다. 거기서 무언가를 얻어야
   다음 열 층을 오를 이유가 생긴다.

   왜 싸우지 않는가. 함께 때리게 만들면 두 가지가 무너진다 —
   전투 판정이 사람 하나를 기준으로 짜여 있어서 난이도를 다시 재야 하고,
   무엇보다 곁에 있는 것이 죽을 수 있게 된다. 이건 보상이지 짐이 아니다.
   그래서 따라다니고, 곁에 있는 동안 사람을 조금 낫게 만든다. 그뿐이다.

   버프는 recalcStats 가 마지막에 더한다 — 스탯을 세우는 곳은 언제나 한 곳이다.
   ========================================================= */

const PETS = [
  { id: 'cat', name: '그을음', kind: '고양이',
    line: '재 속에서 당신을 올려다봅니다. 겁이 없습니다.',
    effect: '속도 +2 · 불씨가 한 칸 더 멀리 닿는다',
    mod: { spd: 2 }, fov: 1 },

  { id: 'dog', name: '서리', kind: '흰 개',
    line: '문지기가 쓰러진 자리에 앉아 있었습니다. 기다린 것처럼.',
    effect: '최대 체력 +12 · 방어 +2',
    mod: { maxHp: 12, def: 2 } },
];

const PET = {
  def(id) { return PETS.find(p => p.id === id) || null; },

  // 지금 데리고 있는 것. state.pet 은 { id, x, y, rx, ry, face } 다.
  current() { return state.pet ? this.def(state.pet.id) : null; },

  has() { return !!state.pet; },

  // 곁에 있는 동안 붙는 스탯. 기억·레벨과 같은 자리에서 더해진다.
  mod() {
    const d = this.current();
    return (d && d.mod) || {};
  },

  // 불씨 반경 보정. applyFov 가 읽는다.
  fovBonus() {
    const d = this.current();
    return (d && d.fov) || 0;
  },

  /* 데리고 시작한다. 판이 끝나면 사라진다 —
     기억은 판을 넘어 남는 것이고 이건 이번 판의 동행이다. */
  take(id) {
    const d = this.def(id);
    if (!d) return;
    const p = state.player;
    state.pet = { id, x: p.x, y: p.y, rx: p.x, ry: p.y, face: 1 };
    recalcStats(p);
    applyFov();
    refreshFov();
  },

  // 층을 옮기면 사람 옆에서 다시 시작한다 (계단을 같이 내려온 것이다)
  onFloor() {
    if (!state.pet) return;
    const p = state.player;
    state.pet.x = p.x; state.pet.y = p.y;
    state.pet.rx = p.x; state.pet.ry = p.y;
  },

  /* 사람이 한 턴을 쓸 때마다 한 칸 따라온다.

     붙어 있으면 움직이지 않는다 — 계속 옆에 붙어 다니면 사람의 뒤를 밟는 게
     아니라 겹쳐 보인다. 두 칸 넘게 벌어졌을 때만 좁힌다.

     몬스터가 선 칸과 벽은 피하되, 못 가면 그냥 가만히 있는다.
     길을 못 찾아 헤매는 것보다 잠깐 뒤처지는 편이 눈에 덜 거슬린다. */
  step() {
    const s = state.pet;
    if (!s) return;
    const p = state.player;
    const dist = chebyshev(s.x, s.y, p.x, p.y);
    if (dist <= 1) return;

    // 너무 멀어졌으면(다른 방에 남았거나 계단을 탔으면) 바로 곁으로 데려온다
    if (dist > 8) { this.onFloor(); return; }

    const dx = Math.sign(p.x - s.x), dy = Math.sign(p.y - s.y);
    const tries = [[dx, dy], [dx, 0], [0, dy]];
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      const nx = s.x + mx, ny = s.y + my;
      if (!isWalkable(state.map, nx, ny)) continue;
      if (monsterAt(nx, ny)) continue;
      if (nx === p.x && ny === p.y) continue;
      s.x = nx; s.y = ny;
      if (mx) s.face = mx > 0 ? 1 : -1;
      return;
    }
  },
};
