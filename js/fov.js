/* =========================================================
   fov.js — 불씨가 닿는 범위

   반경 안의 각 칸으로 광선을 하나씩 쏴서 벽에 막히는지 본다.
   정교한 그림자 캐스팅은 아니지만 반경 7 기준 200칸 남짓이라
   비용이 사실상 없고, 눈으로 보기엔 충분히 자연스럽다.
   ========================================================= */

function computeFov(map, cx, cy, radius) {
  const visible = new Set();
  visible.add(cy * map.w + cx);
  map.explored[cy][cx] = true;

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;

      // 사각형이 아니라 원형으로 잘라낸다
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > radius * radius + radius) continue;

      const path = lineTiles(cx, cy, x, y);
      for (let i = 0; i < path.length; i++) {
        const [px, py] = path[i];
        visible.add(py * map.w + px);
        if (map.explored[py]) map.explored[py][px] = true;
        // 벽에 닿으면 그 벽까지는 보이고 그 너머는 막힌다
        if (blocksSight(map, px, py) && !(px === cx && py === cy)) break;
      }
    }
  }
  return visible;
}

function isVisible(visible, map, x, y) {
  return visible.has(y * map.w + x);
}

// 몬스터가 플레이어를 볼 수 있는지 (거리 + 시선)
function hasLineOfSight(map, x0, y0, x1, y1) {
  const path = lineTiles(x0, y0, x1, y1);
  for (let i = 1; i < path.length - 1; i++) {
    if (blocksSight(map, path[i][0], path[i][1])) return false;
  }
  return true;
}
