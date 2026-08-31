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
  addProps(map, depth);

  return map;
}

/* 하수도 층의 장식.

   배경 타일만 바꾸면 "색만 다른 같은 던전"이 된다. 방이 텅 비어 있으면
   넓기만 하고 어디였는지 기억에 안 남아서, 층이 바뀌었다는 것이 눈에만 스치고
   지나간다. 벽에서 물이 쏟아지고 구석에 항아리가 놓여 있어야 다른 곳이 된다.

   전부 장식이다. 지나갈 수 있고, 맞히지도 막지도 않는다 —
   지형 규칙에 손을 대면 이미 재어 둔 난이도가 통째로 흔들린다.

   두 종류로 나뉜다.
     wall  — 벽에 붙는다. 아래가 바닥이어야 방 안에서 보인다 (횃불과 같은 조건).
     floor — 바닥에 놓인다. 지나다니는 길을 가리지 않게 계단·모닥불·상인은 피한다. */
const SEWER_WALL_PROPS  = ['sewer_fall', 'sewer_vent', 'sewer_pipe', 'sewer_barrel2', 'sewer_web'];

/* 바닥에는 이끼만 놓는다.

   처음에는 항아리·통·배수구도 같이 깔았다. 그런데 바닥에 놓인 것은 전부
   「밟아도 되는 것」이라, 가짓수만 늘고 판단은 하나도 안 생겼다 —
   눈만 시끄러워지고 어디가 길인지 읽기가 더 어려워졌다.

   이끼만 남기고 **밟으면 아프게** 했다. 그러자 같은 그림이 장식에서
   지형이 된다. 한 칸을 돌아갈지 그냥 밟고 갈지가 매번 물어진다 —
   피 1은 무시해도 되는 값이지만, 무시해도 되는지를 정하는 것이 판단이다. */
const SEWER_FLOOR_PROPS = ['sewer_moss_a', 'sewer_moss_b'];

function addProps(map, depth) {
  map.props = [];
  if (depth < CFG.SEWER_FLOOR || depth >= CFG.TOP_FLOOR) return;

  const taken = (x, y) => map.props.some(p => p.x === x && p.y === y);

  for (const r of map.rooms) {
    /* --- 벽에 붙는 것 --- */
    if (r.w >= 5 && r.h >= 4) {
      for (let i = 0, tries = 0; i < randInt(1, 2) && tries < 20; tries++) {
        const x = randInt(r.x + 1, r.x + r.w - 2);
        const y = r.y - 1;
        if (y < 0) continue;
        if (map.tiles[y][x] !== T.WALL || map.tiles[y + 1][x] !== T.FLOOR) continue;
        // 횃불 자리는 비켜 준다 — 겹치면 둘 다 안 읽힌다
        if (map.torches.some(t => t.x === x && t.y === y)) continue;
        if (taken(x, y)) continue;
        map.props.push({ x, y, kind: choice(SEWER_WALL_PROPS), seed: randInt(0, 7) });
        i++;
      }
    }

    /* --- 바닥에 놓이는 것 --- */
    for (let i = 0, tries = 0; i < randInt(0, 3) && tries < 24; tries++) {
      const c = randomTileIn(r);
      if (map.tiles[c.y][c.x] !== T.FLOOR) continue;   // 계단·모닥불·상인 칸은 걸러진다
      if (taken(c.x, c.y)) continue;
      map.props.push({ x: c.x, y: c.y, kind: choice(SEWER_FLOOR_PROPS), seed: randInt(0, 7) });
      i++;
    }
  }
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
  map.props = [];
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
