/* =========================================================
   guide.js — 탑이 남긴 길잡이

   흔적은 좌표로 저장된다. 탑이 매일 새로 서므로 흔적도 날짜별로 나뉘고,
   그래서 **매일 아침 모든 층이 텅 빈다.** 사람이 적을수록 오래 비어 있는다.
   처음 올라온 사람이 보는 것은 "아직 아무도 없구나"가 아니라
   "이 기능은 없는 건가"이다 — 그 둘은 화면에서 구별되지 않는다.

   그래서 층마다 한둘씩 탑이 스스로 남긴다. 서버에 넣지 않고 여기서 만든다:
   지형이 오늘 것으로 정해져 있으므로 같은 날 오르는 사람은 같은 자리에서
   같은 말을 보고, 내일 지형이 바뀌면 이 말들도 알아서 그 지형을 따라간다.
   서버에 심어 두었으면 내일 아침 전부 벽 속에 박혔을 것이다.

   하는 말은 전부 **사실이다.** 계단 옆에서 「계단이 있다」라고 한다.
   거짓을 심으면 사람이 남긴 말까지 못 믿게 되고, 그러면 흔적 전체가 죽는다.
   ========================================================= */

const GUIDE_NAMES = ['먼저 오른 사람', '이름이 지워진 자', '돌아오지 못한 이', '앞서 간 사람'];

const Guide = {
  /* 지형지물 하나에 대고 「그 옆에서 벽을 마주보고 설 수 있는 칸」을 찾는다.
     흔적은 (x, y) 에 서서 (x, y-1) 의 벽을 읽는 것이므로 둘 다 맞아야 한다.
     가까운 데서부터 넓혀 가며 처음 맞는 것을 쓴다 — 씨앗이 같으면 결과도 같다. */
  spot(map, at, taken) {
    if (!at) return null;
    for (let r = 1; r <= 9; r++) {
      const found = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 껍질만 훑는다
          const x = at.x + dx, y = at.y + dy;
          if (y < 1 || !map.tiles[y] || map.tiles[y][x] === undefined) continue;
          if (!isWalkable(map, x, y)) continue;
          if (map.tiles[y - 1][x] !== T.WALL) continue;
          if (taken.some(t => t.x === x && t.y === y)) continue;
          found.push({ x, y });
        }
      }
      // 같은 껍질 안에서는 항상 같은 것을 고른다 (왼쪽 위부터)
      if (found.length) {
        found.sort((p, q) => (p.y - q.y) || (p.x - q.x));
        return found[0];
      }
    }
    return null;
  },

  /* 이 층에서 사실인 말들. 앞에서부터 자리가 잡히는 대로 쓴다. */
  lines(map, depth) {
    const out = [];
    // 계단 — 어느 층에나 있고, 찾고 있는 것이기도 하다
    if (map.stairs) out.push({ at: map.stairs, a: 1, b: 4 });          // 계단이 있다
    // 보물방 문 — 열쇠를 찾기 전에 알아두면 값이 있다
    if (map.vault) out.push({ at: map.vault, a: 1, b: 8 });            // 보물이 있다
    // 모닥불 — 안식처
    if (map.camp) out.push({ at: map.camp, a: 1, b: 2 });              // 불이 있다
    // 상인
    if (map.shop) out.push({ at: map.shop, a: 1, b: 7 });              // 물약이 있다
    // 하수도의 이끼는 밟으면 아프다. 이건 정말로 조심해야 하는 것이다.
    if (depth >= CFG.SEWER_FLOOR && map.props && map.props.length) {
      const moss = map.props.find(p => typeof isPoisonProp === 'function' && isPoisonProp(p));
      if (moss) out.push({ at: moss, a: 0, b: 0 });                    // 함정 조심
    }
    return out;
  },

  /* 오늘 이 층의 길잡이. 지형과 같은 씨앗을 쓰므로 같은 날 오르는 사람은
     모두 같은 말을 같은 자리에서 본다. */
  forFloor(depth, day, map) {
    const m = map || (typeof state !== 'undefined' && state.map);
    if (!m || !m.tiles) return [];

    return withSeed(floorSeed(depth, day) ^ 0x9E3779B9, () => {
      const cand = this.lines(m, depth);
      const taken = [], out = [];
      // 한 층에 둘까지. 셋을 넘으면 탑이 수다스러워지고, 사람이 남긴 말이 묻힌다.
      const want = Math.min(2, cand.length);
      for (const c of cand) {
        if (out.length >= want) break;
        const s = this.spot(m, c.at, taken);
        if (!s) continue;
        taken.push(s);
        out.push({
          id: 'guide-' + depth + '-' + out.length,
          kind: 'note', x: s.x, y: s.y - 1,   // 그림은 벽에 붙는다
          a: c.a, b: c.b,
          by: choice(GUIDE_NAMES),
          nods: randInt(1, 6),                // 오래 걸려 있던 것처럼
          mine: false, guide: true,
        });
      }
      return out;
    });
  },
};
