/* =========================================================
   slice-itemset.js — 아이템 시트에서 쓸 칸만 낱장으로 뗀다

   실행:  node tools/slice-itemset.js     # → assets/items/*.png

   왜 필요한가:
     assets/custom/itemset0.png 은 16x16 칸 176개가 붙은 한 장이다.
     pack-sprites.js 의 findFrame 은 낱장 파일을 찾으므로 그대로는 못 쓴다.
     하수도 팩(slice-atlas.js)과 같은 자리의 같은 일이다 —
     원본은 그대로 두고 **쓸 칸만** 뽑는다.

   왜 이 시트로 갈아타는가:
     갑옷·장화·목걸이는 0x72 팩에 없어서 make-icons.js 가 직접 그렸다.
     급한 대로 만든 것이라 종류가 모자랐다 — 신발 둘, 반지 둘, 목걸이 둘.
     아이템을 늘릴 때마다 그림이 먼저 바닥났다.

     이 시트는 신발 넷, 반지 넷, 목걸이 넷, 투구 넷이 한 손에서 나왔다.
     서로 붙고, 색도 이미 갈색·회색·불씨 계열이라 던전과 안 겉돈다.

   **무기는 안 바꾼다.** 무기는 캐릭터 손에 들리는데(Render.heldWeapon 이
   비교창 아이콘을 그대로 들려준다) 0x72 팩 몸에 다른 화풍의 무기가 들리면
   손만 따로 논다. 몸과 같은 팩에서 온 것이어야 한다.

   좌표는 [열, 행] 이고 둘 다 0부터. 왼쪽 위가 (0,0) 이다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'custom', 'itemset0.png');
const OUT = path.join(ROOT, 'assets', 'items');
const CELL = 16;

/* 쓸 칸. 이름은 게임에서 쓰는 그대로 — pack-sprites.js 의 GEAR_ICONS 가
   이 이름을 찾는다. 안 쓰는 칸은 뽑지 않는다(176장을 다 두면 저장소에 눕는다). */
const CUTS = {
  // ---- 투구 (7·8행) — 새로 생기는 자리 ----
  item_helm_leather: [4, 6],     // 흰 가죽 투구
  item_helm_horned:  [5, 6],     // 뿔 달린 것
  item_helm_plate:   [4, 7],     // 쇠 투구
  item_helm_ash:     [5, 7],     // 뿔 달린 쇠 투구 — 「재의」 자리
  item_hood_cloth:   [6, 7],     // 붉은 후드 — 마법사용
  item_hood_dark:    [7, 7],     // 검은 후드

  // ---- 갑옷 (6행) ----
  item_armor_leather: [4, 5],
  item_armor_red:     [5, 5],
  item_armor_chain:   [6, 5],
  item_armor_plate:   [7, 5],

  // ---- 신발 (4행) ----
  item_boots_red:     [4, 3],
  item_boots_blue:    [5, 3],
  item_boots_grey:    [6, 3],
  item_boots_brown:   [7, 3],

  // ---- 목걸이 (4행) ----
  item_amulet_gold:   [0, 3],
  item_amulet_red:    [1, 3],
  item_amulet_teal:   [2, 3],
  item_amulet_white:  [3, 3],

  // ---- 반지 (3행) ----
  item_ring_silver:   [4, 2],
  item_ring_gold:     [5, 2],
  item_ring_gem:      [6, 2],
  item_ring_white:    [7, 2],
};

/* ---------- PNG 읽기 ----------
   이 시트는 팔레트(color type 3) 다. 지금까지 다룬 것들은 RGBA(6) 였으므로
   둘 다 받는다 — 여기서 갈라 두지 않으면 다음 팩에서 또 막힌다. */
function decode(file) {
  const b = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, pal = null, trns = null;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = b.readUInt32BE(pos + 8); h = b.readUInt32BE(pos + 12);
      ct = b[pos + 17];
      if (b[pos + 16] !== 8) throw new Error(file + ': 8비트가 아니다');
      if (ct !== 3 && ct !== 6 && ct !== 2) throw new Error(file + ': 다루는 형식이 아니다 (color ' + ct + ')');
    }
    if (type === 'PLTE') pal = b.slice(pos + 8, pos + 8 + len);
    if (type === 'tRNS') trns = b.slice(pos + 8, pos + 8 + len);
    if (type === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : (ct === 2 ? 3 : 1);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const cur = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + up) & 255;
      else if (f === 3) v = (v + ((a + up) >> 1)) & 255;
      else if (f === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? up : c))) & 255;
      }
      out[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 3) {
        const i = out[x];
        px[o] = pal[i * 3]; px[o + 1] = pal[i * 3 + 1]; px[o + 2] = pal[i * 3 + 2];
        px[o + 3] = (trns && i < trns.length) ? trns[i] : 255;
      } else if (ct === 2) {
        px[o] = out[x * 3]; px[o + 1] = out[x * 3 + 1]; px[o + 2] = out[x * 3 + 2]; px[o + 3] = 255;
      } else {
        px[o] = out[x * 4]; px[o + 1] = out[x * 4 + 1];
        px[o + 2] = out[x * 4 + 2]; px[o + 3] = out[x * 4 + 3];
      }
    }
    prev = out;
  }
  return { w, h, px };
}

/* ---------- PNG 쓰기 ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => { let c = ~0; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (~c) >>> 0; };
})();

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(CRC(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encode(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* 칸 안에서도 여백을 잘라 낸다. 16x16 칸 가운데 12x13 쯤 그려져 있는 것이
   많은데, 여백째 두면 비교창에서 아이콘마다 크기가 널뛴다
   (ui.js 의 fitIcon 이 실제 그림 크기를 보고 배율을 잡는다). */
function trim(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 0) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    px.copy(out, y * nw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4);
  }
  return { w: nw, h: nh, px: out };
}

if (!fs.existsSync(SRC)) {
  console.error('원본이 없다: ' + SRC);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const sheet = decode(SRC);
const cols = Math.floor(sheet.w / CELL), rows = Math.floor(sheet.h / CELL);
let n = 0;

for (const [name, [cx, cy]] of Object.entries(CUTS)) {
  if (cx >= cols || cy >= rows) {
    console.error(`${name}: 시트 밖이다 (${cx},${cy}) — 시트는 ${cols}x${rows} 칸`);
    continue;
  }
  const cell = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) {
    sheet.px.copy(cell, y * CELL * 4,
                  ((cy * CELL + y) * sheet.w + cx * CELL) * 4,
                  ((cy * CELL + y) * sheet.w + cx * CELL + CELL) * 4);
  }
  const t = trim(cell, CELL, CELL);
  if (!t) { console.error(`${name}: 빈 칸이다 (${cx},${cy})`); continue; }
  fs.writeFileSync(path.join(OUT, name + '.png'), encode(t.w, t.h, t.px));
  n++;
}

console.log(`assets/items/ — ${n}장 (시트 ${cols}x${rows} 칸에서)`);
