/* =========================================================
   cut-npc.js — NPC 팩의 여백을 잘라 게임 격자에 맞춘다

   실행:  node tools/cut-npc.js      # → assets/npc/cut/*.png

   Fantasy RPG NPCs 팩(assets/npc/ 의 rar)은 32x32 캔버스 가운데에
   몸이 서 있다 — 실제 몸은 14x21 안팎이다. 게임은 16px 격자에 발을
   딛는 그림을 기대하므로(render.sprite 가 아래를 기준으로 놓는다)
   그대로 넣으면 투명 여백만큼 떠 보이고 두 칸을 먹는다.

   네 프레임의 **합집합** 상자로 자른다. 프레임마다 따로 자르면
   팔이 흔들릴 때 상자가 변해서 애니메이션이 덜덜 떨린다.

   하수도 팩과 같은 규칙이다 — 원본은 압축째 두고, 쓰는 것만 낱장으로
   뽑아 둔다. 이 폴더는 자동 생성이고 고칠 곳은 이 파일이다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'npc', 'frames', 'Fantasy RPG NPCs - Individuel Frames');
const OUT = path.join(ROOT, 'assets', 'npc', 'cut');

/* 팩 폴더 이름 → 게임에서 쓸 이름. 쓰는 것만 적는다 —
   스물여섯을 다 굽어 두면 안 쓰는 그림이 저장소에 눕는다. */
const WANT = {
  'Blacksmith': 'blacksmith',
};

/* ---------- PNG 읽기 ----------
   외부 라이브러리를 쓰지 않는다 (make-icons.js 와 같은 이유).
   이 팩은 전부 8비트 RGBA 비인터레이스라 그 경우만 다룬다. */
function decode(file) {
  const b = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = b.readUInt32BE(pos + 8); h = b.readUInt32BE(pos + 12);
      if (b[pos + 16] !== 8 || b[pos + 17] !== 6) {
        throw new Error(file + ': RGBA8 이 아니다 (depth ' + b[pos + 16] + ', color ' + b[pos + 17] + ')');
      }
    }
    if (type === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4] : 0, up = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + up) & 255;
      else if (f === 3) v = (v + ((a + up) >> 1)) & 255;
      else if (f === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? up : c))) & 255;
      }
      out[x] = v;
    }
    out.copy(px, y * stride);
    prev = out;
  }
  return { w, h, px };
}

/* ---------- PNG 쓰기 (필터 0, RGBA8) ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = ~0;
    for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8);
    return (~c) >>> 0;
  };
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
  ihdr[8] = 8; ihdr[9] = 6;                       // RGBA8
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

/* ---------- 자르기 ---------- */
function unionBox(frames) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const d of frames) {
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (d.px[(y * d.w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(d, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    d.px.copy(out, y * box.w * 4,
              ((box.y0 + y) * d.w + box.x0) * 4,
              ((box.y0 + y) * d.w + box.x0 + box.w) * 4);
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  console.error('원본이 없다. assets/npc/ 의 rar 을 먼저 풀어 두라: ' + SRC);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

for (const [folder, name] of Object.entries(WANT)) {
  for (const kind of ['Idle', 'Walk']) {
    const files = [1, 2, 3, 4].map(i => path.join(SRC, folder, `${folder}_${kind}_${i}.png`));
    if (!files.every(f => fs.existsSync(f))) continue;
    const frames = files.map(decode);
    const box = unionBox(frames);
    frames.forEach((d, i) => {
      const suffix = kind === 'Idle' ? 'idle' : 'run';   // 팩 규칙(name_kind_anim_fN)에 맞춘다
      const file = path.join(OUT, `${name}_${suffix}_anim_f${i}.png`);
      fs.writeFileSync(file, encode(box.w, box.h, crop(d, box)));
    });
    console.log(`${name} ${kind.toLowerCase()} — ${box.w}x${box.h} 로 잘라 4장`);
  }
}
