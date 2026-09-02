/* =========================================================
   make-inventory.js — 가방 창 그림을 우리 색으로 갈아입히고 둘로 나눈다

   실행:  node tools/make-inventory.js    # → assets/ui/equip.png · bag.png + 좌표

   원본은 assets/custom/inventory.png (176x166). 회색조 여덟 색뿐이라
   색만 바꾸면 우리 세계에 들어온다 — 모양은 그대로 둔다.

   원본에 있는데 이 게임에 없는 것은 지운다:
     · 제작칸 셋과 화살표 (만드는 기능이 없다)
     · 플레이어 미리보기 자리 (캐릭터를 세워 보여주지 않는다)
     · 「Crafting」 글자
   그 자리를 몸 다섯 칸이 쓴다 — 투구·방어구·신발·장신구·무기.

   왜 그림으로 하는가:
     CSS 로 격자를 그리면 게임의 다른 창(상인·대장간)과 같은 네모가 되는데,
     가방은 「물건을 담는 것」이라 도트로 된 판이 훨씬 그럴듯하다.
     그리고 이 그림은 **화면 크기를 안 탄다** — 정수배로만 키우면
     어느 폰에서도 도트가 안 뭉갠다.

   라이선스: 원작자가 「비슷한 게임에 자유롭게 쓰라」고 밝힌 것.
   여기서는 색과 배치를 바꿔 다시 굽는다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'custom', 'inventory.png');
const OUT = path.join(ROOT, 'assets', 'ui');

/* 원본 색 → 우리 색.
   style.css 의 변수와 같은 값을 쓴다 — 두 곳이 갈라지면 창만 딴 세계가 된다. */
const MAP = {
  '120,138,135': [0x1E, 0x18, 0x13],   // 판 바탕      → --panel-2
  '169,178,162': [0x2C, 0x24, 0x1D],   // 밝은 테두리   → --line
  '255,255,255': [0x3A, 0x2F, 0x25],   // 하이라이트    → 선보다 한 단계 밝게
  '97,97,97':    [0x0C, 0x0A, 0x08],   // 칸 안쪽      → --bg (움푹 들어가 보이게)
  '189,189,189': [0x2C, 0x24, 0x1D],
  '176,169,135': [0x2C, 0x24, 0x1D],
  '158,158,158': [0x2C, 0x24, 0x1D],
  // 검정(윤곽)은 그대로 둔다 — 팩 전체가 #000 윤곽을 쓴다
};

/* 판 위쪽을 통째로 비운다.

   원본 위쪽에는 캐릭터 미리보기 · 제작칸 셋 · 화살표 · 「Crafting」 글자가
   있는데 이 게임에는 하나도 없다. 조각조각 지우면 남는 것이 생기므로
   **위쪽 띠를 통째로 밀고** 우리 칸을 새로 찍는다.

   아래 격자(4행 9열)는 그대로 쓰되 우리는 열두 칸만 쓰므로 그것도 밀고
   다시 찍는다 — 안 쓰는 칸이 남아 있으면 「왜 못 넣지」가 된다. */
const ERASE = [
  [4, 4, 168, 76],     // 위쪽 — 미리보기·제작칸·글자
  [4, 80, 168, 82],    // 아래쪽 — 원본 격자 4x9
];

/* 우리 배치. 판을 **둘로 나눠** 굽는다.

     · equip.png — 입은 것 넉 칸 + 든 것 한 칸 + 그 사이에 선 모습
     · bag.png   — 가방 6x2

   한 장이던 것을 나눈 이유: 창을 「장착판 + 설명」 두 열로 위에 놓고,
   가방은 그 아래 한 줄로 넓게 깔기 위해서다. 한 장이면 설명을 옆에 못 둔다.
   가방을 넓게 깔면 칸 하나가 손가락만 해져서 폰에서 짚기가 쉬워진다.

   칸 크기(17)와 간격(18)은 원본 그대로다 — 바꾸면 떠서 찍는 칸과 안 맞는다. */
const CELL = 17, GAP = 18, PAD = 8;

/* 장착판. 입는 것 넷을 2x2 로 접고 그 아래 가운데에 드는 것,
   오른쪽에 지금 모습이 선다.

   세로 다섯 줄로 두었더니 판이 세로로 길어져(73x97) 창 전체가
   던전 화면보다 키가 커졌다. 가로로 누이면 같은 다섯 칸이 절반 높이에
   들어간다 — 칸 수가 아니라 모양이 문제였다. */
const EQUIP = {
  /* 높이는 칸 수가 아니라 **옆의 설명칸**이 정한다. 둘이 한 줄에
     나란히 서는데 한쪽이 짧으면 그 밑이 통째로 빈다. 설명이 대략
     너비의 1.08배만큼 높으므로 판도 그 비율로 둔다 — 남는 곳은
     서 있는 모습과 칸 사이 숫이 나누어 갖는다. */
  w: 92, h: 101,
  worn: [
    ['helm',    10, 13], ['armor',   29, 13],
    ['boots',   10, 35], ['trinket', 29, 35],
    ['weapon',  19, 62],
  ],
  body: { x: 49, y: 12, w: 34, h: 68 },
};

/* 가방판. 6x2 — 한 줄로 깔 것이라 가로로 눕힌다. */
const BAG = { w: 127, h: 55, origin: [10, 10], cols: 6, rows: 2 };

/* ---------- PNG ---------- */
function decode(file) {
  const b = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, pal = null, trns = null;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), t = b.toString('ascii', pos + 4, pos + 8);
    if (t === 'IHDR') { w = b.readUInt32BE(pos + 8); h = b.readUInt32BE(pos + 12); ct = b[pos + 17]; }
    if (t === 'PLTE') pal = b.slice(pos + 8, pos + 8 + len);
    if (t === 'tRNS') trns = b.slice(pos + 8, pos + 8 + len);
    if (t === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : (ct === 2 ? 3 : 1);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const st = w * bpp, px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], cur = raw.slice(y * (st + 1) + 1, (y + 1) * (st + 1));
    const o = Buffer.alloc(st);
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? o[x - bpp] : 0, u = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + u) & 255;
      else if (f === 3) v = (v + ((a + u) >> 1)) & 255;
      else if (f === 4) {
        const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? u : c))) & 255;
      }
      o[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      if (ct === 3) {
        const i = o[x];
        px[q] = pal[i * 3]; px[q + 1] = pal[i * 3 + 1]; px[q + 2] = pal[i * 3 + 2];
        px[q + 3] = (trns && i < trns.length) ? trns[i] : 255;
      } else if (ct === 2) {
        px[q] = o[x * 3]; px[q + 1] = o[x * 3 + 1]; px[q + 2] = o[x * 3 + 2]; px[q + 3] = 255;
      } else {
        px[q] = o[x * 4]; px[q + 1] = o[x * 4 + 1]; px[q + 2] = o[x * 4 + 2]; px[q + 3] = o[x * 4 + 3];
      }
    }
    prev = o;
  }
  return { w, h, px };
}

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
  const st = w * 4, raw = Buffer.alloc(h * (st + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (st + 1) + 1, y * st, (y + 1) * st);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 굽기 ---------- */
if (!fs.existsSync(SRC)) { console.error('원본이 없다: ' + SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const d = decode(SRC);
const px = Buffer.from(d.px);
/* 아래 격자의 빈 칸을 뜬다. 위쪽 갑옷 칸(7,7)에는 투구 그림이 그려져 있어서
   그걸 뜨면 열두 칸에 전부 투구가 찍힌다 — 아이콘은 게임이 그려 넣는다. */
const SRC_SLOT = [7, 100];

/* 지우기 전에 성한 칸 하나를 떠 둔다. 칸을 새로 그리면 원본과 미묘하게
   달라서 판 위에서 티가 난다 — 같은 손에서 나온 것처럼 보이려면 떠야 한다. */
const stamp = Buffer.alloc((CELL + 2) * (CELL + 2) * 4);
for (let y = -1; y <= CELL; y++) {
  for (let x = -1; x <= CELL; x++) {
    const s = ((SRC_SLOT[1] + y) * d.w + (SRC_SLOT[0] + x)) * 4;
    const t = ((y + 1) * (CELL + 2) + (x + 1)) * 4;
    for (let k = 0; k < 4; k++) stamp[t + k] = d.px[s + k];
  }
}

// 1) 색 갈아입히기
for (let i = 0; i < d.w * d.h; i++) {
  if (!px[i * 4 + 3]) continue;
  const key = px[i * 4] + ',' + px[i * 4 + 1] + ',' + px[i * 4 + 2];
  const to = MAP[key];
  if (to) { px[i * 4] = to[0]; px[i * 4 + 1] = to[1]; px[i * 4 + 2] = to[2]; }
}

// 2) 없는 기능 지우기 — 판 바탕색으로 덮는다
const panel = MAP['120,138,135'];
for (const [x, y, w, h] of ERASE) {
  for (let yy = y; yy < y + h && yy < d.h; yy++) {
    for (let xx = x; xx < x + w && xx < d.w; xx++) {
      const o = (yy * d.w + xx) * 4;
      px[o] = panel[0]; px[o + 1] = panel[1]; px[o + 2] = panel[2]; px[o + 3] = 255;
    }
  }
}

/* 3) 판 하나를 만든다.

      원본은 176x166 짜리 한 장인데 우리는 크기가 다른 판을 둘 만든다.
      새로 그리지 않고 **원본의 테두리를 오려 붙인다** — 모서리 넷은 그대로
      떠 오고, 변은 원본의 성한 구간을 되풀이해 채운다. 그래야 두 판이
      같은 손에서 나온 것으로 보인다.

      B 는 테두리 두께. 원본 판의 테두리가 네 화소다. */
const B = 4;
function frame(W, H) {
  const out = Buffer.alloc(W * H * 4);
  const at = (buf, w, x, y) => (y * w + x) * 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      /* 원본에서 가져올 자리. 가장자리 네 화소는 그대로, 가운데는
         원본 안쪽 구간을 되풀이한다 — 판이 커지든 작아지든 테두리가 이어진다. */
      const sx = x < B ? x : (x >= W - B ? d.w - (W - x) : B + ((x - B) % (d.w - 2 * B)));
      const sy = y < B ? y : (y >= H - B ? d.h - (H - y) : B + ((y - B) % (d.h - 2 * B)));
      const s = at(px, d.w, sx, sy), t = at(out, W, x, y);
      for (let k = 0; k < 4; k++) out[t + k] = px[s + k];
    }
  }
  // 안쪽은 통째로 판 바탕색 — 되풀이하면 원본의 칸 자국이 묻어 온다
  for (let y = B; y < H - B; y++) {
    for (let x = B; x < W - B; x++) {
      const t = at(out, W, x, y);
      out[t] = panel[0]; out[t + 1] = panel[1]; out[t + 2] = panel[2]; out[t + 3] = 255;
    }
  }
  return out;
}

/* 4) 칸을 찍는다. 칸 하나를 원본에서 떠 뒀으므로 그대로 옮겨 찍는다 —
      새로 그리면 원본과 미묘하게 달라 판 위에서 티가 난다. */
function stampSlot(buf, W, H, dx, dy) {
  for (let y = -1; y <= CELL; y++) {
    for (let x = -1; x <= CELL; x++) {
      if (dy + y < 0 || dy + y >= H || dx + x < 0 || dx + x >= W) continue;
      const s = ((y + 1) * (CELL + 2) + (x + 1)) * 4;
      const t = ((dy + y) * W + (dx + x)) * 4;
      const key = stamp[s] + ',' + stamp[s + 1] + ',' + stamp[s + 2];
      const to = MAP[key];
      buf[t]     = to ? to[0] : stamp[s];
      buf[t + 1] = to ? to[1] : stamp[s + 1];
      buf[t + 2] = to ? to[2] : stamp[s + 2];
      buf[t + 3] = stamp[s + 3];
    }
  }
}

// ---- 장착판 ----
const eq = frame(EQUIP.w, EQUIP.h);
for (const [, x, y] of EQUIP.worn) stampSlot(eq, EQUIP.w, EQUIP.h, x, y);
fs.writeFileSync(path.join(OUT, 'equip.png'), encode(EQUIP.w, EQUIP.h, eq));

// ---- 가방판 ----
const bg = frame(BAG.w, BAG.h);
const cells = [];
for (let r = 0; r < BAG.rows; r++) {
  for (let c = 0; c < BAG.cols; c++) {
    const x = BAG.origin[0] + c * GAP, y = BAG.origin[1] + r * GAP;
    stampSlot(bg, BAG.w, BAG.h, x, y);
    cells.push({ x, y });
  }
}
fs.writeFileSync(path.join(OUT, 'bag.png'), encode(BAG.w, BAG.h, bg));

/* 5) 칸 자리를 코드가 읽게 내놓는다. 그림과 좌표가 갈라지면 아이콘이
      칸 밖에 뜨므로 둘을 한 곳에서 만든다. */
const slots = {
  cell: CELL,
  equip: {
    w: EQUIP.w, h: EQUIP.h,
    worn: EQUIP.worn.map(([id, x, y]) => ({ id, x, y })),
    body: EQUIP.body,
  },
  bag: { w: BAG.w, h: BAG.h, cells },
};
fs.writeFileSync(path.join(OUT, 'bag-slots.json'), JSON.stringify(slots, null, 2) + '\n');

/* 좌표를 JS 로도 굽는다. 게임은 파일을 fetch 하지 않는다 —
   index.html 을 더블클릭해서 열어도 돌아야 하는데 file:// 에서는 fetch 가 막힌다.
   그림은 pack-sprites 가 데이터 URI 로 굽고, 좌표는 여기서 코드로 굽는다. */
fs.writeFileSync(path.join(ROOT, 'js', 'bagslots.js'),
  '/* 자동 생성 — tools/make-inventory.js. 손으로 고치지 말 것.\n' +
  '   그림(assets/ui/equip.png · bag.png)과 좌표를 한 곳에서 만들어야 둘이 안 어긋난다. */\n' +
  'const BAG_UI = ' + JSON.stringify(slots) + ';\n');

console.log(`assets/ui/equip.png — ${EQUIP.w}x${EQUIP.h}, 몸 ${slots.equip.worn.length}칸`);
console.log(`assets/ui/bag.png   — ${BAG.w}x${BAG.h}, 가방 ${cells.length}칸`);
console.log('좌표: assets/ui/bag-slots.json · js/bagslots.js');
