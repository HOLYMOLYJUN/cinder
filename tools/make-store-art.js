/* =========================================================
   make-store-art.js — 스토어에 올릴 그림

   실행:  node tools/make-store-art.js      # → assets/app/store-*.png

   왜 따로 그리는가:
     플레이 스토어는 목록 위에 1024x500 「피처 그래픽」을 요구한다. 필수다.
     아이콘을 그냥 늘리면 가로로 긴 자리에 동그란 것 하나가 떠 있는 꼴이 되고,
     실제 화면을 잘라 넣으면 이 게임은 던전이 어두워서 거의 검은 띠가 된다.

   그래서 게임의 한 순간을 짓는다 —
     어둠, 가운데를 밝히는 불씨 하나, 그리고 위로 사라지는 계단.
     화면을 찍은 것이 아니라 **같은 팔레트와 같은 도트 격자로 새로 그린 것**이다.
     아이콘·앱·게임이 한 손에서 나온 것으로 보여야 한다.

   글자는 넣지 않는다. 스토어가 이 그림 위에 앱 이름을 얹고, 지역마다 잘리는
   위치가 다르다. 넣으면 두 번 겹치거나 반이 잘린다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'app');

/* style.css 에서 그대로 가져온 색 */
const BG        = [0x0C, 0x0A, 0x08];
const WALL_LIT  = [0x4B, 0x3B, 0x2C];
const WALL_DIM  = [0x1C, 0x1F, 0x26];
const FLOOR_LIT = [0x24, 0x1B, 0x14];
const FLOOR_DIM = [0x0D, 0x0F, 0x14];
const EMBER     = [0xE9, 0x95, 0x4A];
const DIM       = [0xA0, 0x5F, 0x27];
const HOT       = [0xFF, 0xE9, 0xC4];
const MID       = [0xF0, 0xB0, 0x4A];
const EDGE      = [0x6B, 0x37, 0x14];

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/* 씨를 심은 난수. 다시 그릴 때마다 벽이 달라지면 그림이 아니라 사고다. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ---------- 불꽃 (아이콘과 같은 식) ---------- */
const TIP = 0.08, FAT = 0.72, FOOT = 0.95, MAXW = 0.235;

function halfWidth(y) {
  if (y < TIP || y > FOOT) return 0;
  if (y <= FAT) return MAXW * Math.pow((y - TIP) / (FAT - TIP), 1.9);
  const t = (y - FAT) / (FOOT - FAT);
  return MAXW * Math.sqrt(Math.max(0, 1 - t * t));
}
function axis(y) {
  const up = Math.max(0, (FAT - y) / (FAT - TIP));
  return 0.5 + 0.085 * Math.pow(up, 2.2);
}
function heat(nx, ny) {
  const hw = halfWidth(ny);
  if (hw <= 0) return -1;
  const dx = Math.abs(nx - axis(ny)) / hw;
  if (dx > 1) return -1;
  const along = 1 - Math.abs(ny - 0.80) / 0.34;
  return Math.max(0, Math.min(1, (1 - dx) * 0.55 + Math.max(0, along) * 0.62));
}
function flameColor(h) {
  if (h < 0.12) return EDGE;
  if (h < 0.34) return DIM;
  if (h < 0.56) return EMBER;
  if (h < 0.78) return MID;
  return HOT;
}

/* ---------- 한 장 ---------- */
function render(W, H, opt) {
  const o = Object.assign({ cell: 16, flame: 0.30, flameY: 0.56 }, opt || {});
  const buf = Buffer.alloc(W * H * 4);
  const cols = Math.ceil(W / o.cell), rows = Math.ceil(H / o.cell);
  const rnd = rng(20260901);

  /* 먼저 온통 어둠으로 채운다. 안 채우고 그리다 만 자리는 투명하게 남고,
     PNG 를 흰 바탕에 놓고 보는 곳에서는 그게 흰 얼룩으로 튀어나온다. */
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = BG[0]; buf[i * 4 + 1] = BG[1]; buf[i * 4 + 2] = BG[2]; buf[i * 4 + 3] = 255;
  }

  // 불씨의 자리 (칸 단위)
  const fx = cols * 0.5, fy = rows * o.flameY;
  const reach = Math.min(cols, rows) * 0.78;      // 빛이 닿는 거리

  /* 칸을 칠하면서 위·왼쪽 한 줄만 어둡게 남긴다. 게임이 바닥에 긋는 격자와 같은 것 —
     이게 없으면 도트 게임이 아니라 그냥 매끈한 그라데이션으로 보인다. */
  const put = (gx, gy, col, grid) => {
    const x0 = gx * o.cell, y0 = gy * o.cell;
    const line = mix(col, [0, 0, 0], 0.34);
    for (let y = y0; y < Math.min(H, y0 + o.cell); y++) {
      for (let x = x0; x < Math.min(W, x0 + o.cell); x++) {
        const i = (y * W + x) * 4;
        const c = (grid && (y === y0 || x === x0)) ? line : col;
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
      }
    }
  };

  /* 1) 바닥과 벽. 불에서 멀수록 식는다 — 게임의 시야가 하는 일과 같다.

        방을 네모로 오려 넣지 않는다. 그러면 가로로 긴 자리에서 「상자 안의 등불」로
        읽힌다. 대신 **넓은 방 한가운데 서 있는 것**으로 짓는다 — 위아래로 벽이
        가로지르고 그 사이는 전부 바닥이다. 잘리는 것은 어둠뿐이라 좌우 어디서
        잘려도 그림이 상하지 않는다. */
  const wallTop = 2;                              // 위쪽 벽 두께(칸)
  const wallBot = rows - 2;                       // 아래쪽 벽이 시작하는 줄

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const d = Math.hypot(gx - fx, gy - fy) / reach;
      if (d > 1.15) continue;                     // 빛이 아예 안 닿는 곳은 어둠 그대로

      const lit = Math.max(0, 1 - d);
      const warm = Math.pow(lit, 1.5);
      const floor = gy >= wallTop && gy < wallBot;

      let col = floor
        ? mix(FLOOR_DIM, FLOOR_LIT, warm)
        : mix(WALL_DIM, WALL_LIT, warm);

      // 도트가 균일하면 인쇄물처럼 보인다. 칸마다 아주 조금 흔든다.
      const j = (rnd() - 0.5) * 0.10 * (floor ? 1 : 1.5);
      col = mix(col, floor ? FLOOR_LIT : WALL_LIT, Math.max(0, j));

      // 불빛이 닿는 곳은 색온도가 따뜻해진다
      if (warm > 0.05) col = mix(col, EMBER, warm * (floor ? 0.26 : 0.16));
      put(gx, gy, col, floor);
    }
  }

  /* 2) 빛무리 — 격자를 넘어 매끈하게. 게임 안의 횃불과 같은 규칙이다. */
  const cxp = fx * o.cell, cyp = fy * o.cell;
  const glowR = reach * o.cell * 0.95;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cxp, y - cyp) / glowR;
      if (d >= 1) continue;
      const a = Math.pow(1 - d, 3.0) * 0.30;
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(buf[i + c] * (1 - a) + EMBER[c] * a);
      buf[i + 3] = 255;
    }
  }

  /* 3) 불씨 — 아이콘과 같은 격자, 같은 모양 */
  const fw = Math.min(W, H) * o.flame;
  const fh = fw / 0.62;                            // 불꽃은 세로로 길다
  const fcells = 22;
  const fcell = fh / fcells;
  for (let gy = 0; gy < fcells; gy++) {
    for (let gx = 0; gx < fcells; gx++) {
      const h = heat((gx + 0.5) / fcells, (gy + 0.5) / fcells);
      if (h < 0) continue;
      const col = flameColor(h);
      const x0 = Math.round(cxp - fh / 2 + gx * fcell);
      const y0 = Math.round(cyp - fh * 0.58 + gy * fcell);
      for (let y = y0; y < y0 + Math.ceil(fcell); y++) {
        for (let x = x0; x < x0 + Math.ceil(fcell); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = (y * W + x) * 4;
          buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
        }
      }
    }
  }

  /* 4) 가장자리를 어둠으로 닫는다. 스토어가 좌우를 잘라도 잘린 티가 안 나게. */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ex = Math.min(x, W - 1 - x) / (W * 0.22);
      const ey = Math.min(y, H - 1 - y) / (H * 0.16);
      const v = Math.min(1, Math.min(ex, ey));
      if (v >= 1) continue;
      const a = Math.pow(1 - v, 1.8);
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(buf[i + c] * (1 - a) + BG[c] * a);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/* ---------- PNG ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return buf => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log('  ' + path.basename(file).padEnd(24) + w + 'x' + h + '  ' +
    (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
}

fs.mkdirSync(OUT, { recursive: true });
console.log('assets/app/');
// 플레이 스토어 피처 그래픽 — 규격이 1024x500 으로 못박혀 있다
writePng(path.join(OUT, 'store-feature.png'), 1024, 500,
  render(1024, 500, { cell: 16, flame: 0.30, flameY: 0.56 }));
