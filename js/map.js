/* =========================================================
   map.js — 방 + 복도 방식의 층 생성

   방을 여러 개 놓고 순서대로 복도로 잇는다.
   이 "순서대로 잇기"가 곧 연결성 보장이다 —
   고립된 방에 계단이 생기면 그 판은 진행 불가가 되므로
   구조 자체로 그런 일이 없게 만든다.
   ========================================================= */

/* 보물방을 만든다.

   중요한 제약이 하나 있다 — 이미 만들어진 방 하나를 골라 봉인하면
   그 방을 거쳐 가던 길이 끊겨 층이 두 조각 날 수 있다.
   그래서 보물방은 **맨 끝에 새로 붙인다.** 복도 하나로만 이어지는
   막다른 방이므로, 문을 잠가도 나머지 길에는 아무 영향이 없다. */
function addVault(map) {
  const { w, h, tiles, rooms } = map;

  for (let tries = 0; tries < 300; tries++) {
    const rw = randInt(4, 6), rh = randInt(4, 5);
    const rx = randInt(2, w - rw - 3), ry = randInt(2, h - rh - 3);
    const vault = { x: rx, y: ry, w: rw, h: rh,
                    cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };

    // 방과 테두리까지 전부 단단한 바위여야 한다.
    // 기존 복도 위에 겹쳐 지으면, 테두리를 막을 때 원래 있던 길까지 막혀
    // 층이 두 조각 난다. 그래서 아예 빈 곳에만 짓는다.
    let solid = true;
    for (let y = ry - 1; y <= ry + rh && solid; y++)
      for (let x = rx - 1; x <= rx + rw; x++)
        if (tileAt(map, x, y) !== T.WALL) { solid = false; break; }
    if (!solid) continue;

    // 시작점에서 너무 가까우면 들르는 맛이 없다
    if (Math.abs(vault.cx - map.start.x) + Math.abs(vault.cy - map.start.y) < 10) continue;

    carveRoom(tiles, vault);
    const near = rooms.reduce((best, r) =>
      Math.abs(r.cx - vault.cx) + Math.abs(r.cy - vault.cy) <
      Math.abs(best.cx - vault.cx) + Math.abs(best.cy - vault.cy) ? r : best, rooms[0]);
    carveCorridor(tiles, near, vault);

    // 방을 둘러싼 테두리에서 복도가 뚫고 들어온 자리를 문으로 막는다.
    // 이렇게 하면 들어갈 길이 문밖에 남지 않는다.
    const doors = [];
    for (let y = ry - 1; y <= ry + rh; y++) {
      for (let x = rx - 1; x <= rx + rw; x++) {
        const onRing = (x === rx - 1 || x === rx + rw || y === ry - 1 || y === ry + rh);
        if (!onRing || x < 0 || y < 0 || x >= w || y >= h) continue;
        if (tiles[y][x] === T.FLOOR) { tiles[y][x] = T.DOOR; doors.push({ x, y }); }
      }
    }
    if (!doors.length) continue;          // 어쩌다 길이 안 뚫렸으면 다시

    map.vault = vault;
    map.doors = doors;
    return true;
  }
  return false;
}

function makeFloor(depth, withVault) {
  // 층이 올라갈수록 넓어진다
  const w = clamp(32 + Math.floor(depth * 1.4), 32, 52);
  const h = clamp(22 + Math.floor(depth * 0.9), 22, 34);
  const roomTarget = clamp(6 + Math.floor(depth / 2), 6, 12);

  const tiles = [];
  const explored = [];
  for (let y = 0; y < h; y++) {
    tiles.push(new Array(w).fill(T.WALL));
    explored.push(new Array(w).fill(false));
  }

  const rooms = [];
  for (let tries = 0; tries < 220 && rooms.length < roomTarget; tries++) {
    const rw = randInt(5, 10);
    const rh = randInt(4, 7);
    const rx = randInt(1, w - rw - 2);
    const ry = randInt(1, h - rh - 2);
    const room = { x: rx, y: ry, w: rw, h: rh,
                   cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };

    // 다른 방과 한 칸 이상 떨어져 있어야 한다
    const overlaps = rooms.some(r =>
      rx <= r.x + r.w && rx + rw >= r.x - 1 &&
      ry <= r.y + r.h && ry + rh >= r.y - 1
    );
    if (overlaps) continue;

    carveRoom(tiles, room);
    if (rooms.length > 0) carveCorridor(tiles, rooms[rooms.length - 1], room);
    rooms.push(room);
  }

  const map = { w, h, tiles, explored, rooms, depth };

  // 시작점은 첫 방, 계단은 시작점에서 가장 먼 방
  const startRoom = rooms[0];
  map.start = randomTileIn(startRoom);

  let far = rooms[rooms.length - 1], farD = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cx - startRoom.cx) + Math.abs(r.cy - startRoom.cy);
    if (d > farD) { farD = d; far = r; }
  }
  map.stairsRoom = far;
  const s = randomTileIn(far);
  tiles[s.y][s.x] = T.STAIRS;
  map.stairs = s;

  // 안식처에는 모닥불을 놓는다.
  // 계단이 이미 차지한 칸을 피해야 하므로 반드시 빈 바닥을 찾을 때까지 시도한다 —
  // 모닥불이 없는 안식처는 회복할 곳이 없다는 뜻이라 그냥 넘어가면 안 된다.
  if (CFG.REST_FLOORS.includes(depth)) {
    const preferred = rooms.filter(r => r !== far);
    const order = preferred.length ? preferred : rooms;

    for (let tries = 0; tries < 200 && !map.camp; tries++) {
      const room = order[tries % order.length];
      const c = randomTileIn(room);
      if (tiles[c.y][c.x] !== T.FLOOR) continue;
      tiles[c.y][c.x] = T.CAMP;
      map.camp = c;
    }

    // 떠돌이 상인. 모닥불과 같은 이유로 반드시 자리를 찾아야 한다.
    for (let tries = 0; tries < 200 && !map.shop; tries++) {
      const room = order[tries % order.length];
      const c = randomTileIn(room);
      if (tiles[c.y][c.x] !== T.FLOOR) continue;
      tiles[c.y][c.x] = T.SHOP;
      map.shop = c;
    }
  }

  if (withVault) addVault(map);
  addTorches(map);

  return map;
}

/* 벽에 거는 횃불.

   방마다 한둘씩 걸어두면 같은 벽돌 무늬가 끝없이 이어지는 느낌이 사라진다.
   방향을 잡는 표식 노릇도 한다 — "아까 횃불 두 개 있던 방"이 기억에 남는다.

   조건은 하나. 바로 아래가 걸어다닐 수 있는 바닥이어야 한다.
   그래야 방 안에서 벽면이 보이고, 횃불이 허공이 아니라 벽에 걸린 것으로 읽힌다. */
function addTorches(map) {
  map.torches = [];
  for (const r of map.rooms) {
    if (r.w < 5 || r.h < 4) continue;
    const want = randInt(1, 2);
    for (let i = 0, tries = 0; i < want && tries < 24; tries++) {
      const x = randInt(r.x + 1, r.x + r.w - 2);
      const y = r.y - 1;                              // 방의 윗벽 — r.y 는 바닥 첫 줄이다
      if (y < 0) continue;
      if (map.tiles[y][x] !== T.WALL) continue;
      if (map.tiles[y + 1][x] !== T.FLOOR) continue;
      // 서로 붙여 걸지 않는다 — 두 개가 나란히 있으면 벽등이 아니라 장식 띠로 보인다
      if (map.torches.some(t => Math.abs(t.x - x) < 3 && t.y === y)) continue;
      map.torches.push({ x, y, seed: randInt(0, 7) });   // seed 로 불꽃이 제각각 흔들린다
      i++;
    }
  }
}

function carveRoom(tiles, r) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = T.FLOOR;
  }
}

// ㄱ자 복도. 가로 먼저인지 세로 먼저인지는 반반.
function carveCorridor(tiles, a, b) {
  if (chance(0.5)) {
    hall(tiles, a.cx, b.cx, a.cy, true);
    hall(tiles, a.cy, b.cy, b.cx, false);
  } else {
    hall(tiles, a.cy, b.cy, a.cx, false);
    hall(tiles, a.cx, b.cx, b.cy, true);
  }
}

function hall(tiles, from, to, fixed, horizontal) {
  const step = from < to ? 1 : -1;
  for (let v = from; v !== to + step; v += step) {
    const x = horizontal ? v : fixed;
    const y = horizontal ? fixed : v;
    if (tiles[y] && tiles[y][x] === T.WALL) tiles[y][x] = T.FLOOR;
  }
}

/* =========================================================
   옥상 — 탑의 맨 윗면

   여기만 방과 복도로 만들지 않는다. 열네 층을 좁은 통로로 올라온 끝이
   또 방 하나면 "도착했다"가 안 생긴다. 사방이 트인 넓은 단 하나여야 한다.

   모서리를 깎아 팔각에 가깝게 만든다. 사각형이면 그냥 큰 방으로 보인다.
   ========================================================= */
function makeRoof(depth) {
  const w = 34, h = 22;
  const tiles = [], explored = [];
  for (let y = 0; y < h; y++) {
    tiles.push(new Array(w).fill(T.WALL));
    explored.push(new Array(w).fill(false));
  }

  // 화면(28x18)보다 확실히 작아야 난간 너머가 사방으로 보인다.
  const rx = 8, ry = 5, rw = 18, rh = 12, cut = 4;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const dx = Math.min(x - rx, rx + rw - 1 - x);
      const dy = Math.min(y - ry, ry + rh - 1 - y);
      if (dx + dy < cut) continue;                 // 네 모서리를 잘라낸다
      tiles[y][x] = T.FLOOR;
    }
  }

  const room = { x: rx, y: ry, w: rw, h: rh,
                 cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
  const map = { w, h, tiles, explored, rooms: [room], depth, roof: true };

  // 올라온 자리는 아래쪽 가장자리. 주인은 한가운데 앉아 있다.
  map.start  = { x: room.cx, y: ry + rh - 2 };
  map.stairs = { x: room.cx, y: room.cy };
  map.stairsRoom = room;
  map.torches = [];
  return map;
}

function randomTileIn(room) {
  return {
    x: randInt(room.x + 1, room.x + room.w - 2),
    y: randInt(room.y + 1, room.y + room.h - 2),
  };
}

function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.WALL;
  return map.tiles[y][x];
}

function isWalkable(map, x, y) {
  const t = tileAt(map, x, y);
  return t !== T.WALL && t !== T.DOOR;
}

// 벽이 시야와 사격을 막는다
function blocksSight(map, x, y) {
  const t = tileAt(map, x, y);
  // 문도 시야를 막는다. 안이 보이면 열쇠를 찾을 이유가 없어진다.
  return t === T.WALL || t === T.DOOR;
}
