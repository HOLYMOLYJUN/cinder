/* =========================================================
   make-app-icon.js — 앱 아이콘과 첫 화면 그림을 그린다

   실행:  node tools/make-app-icon.js      # → assets/app/*.png

   왜 그리는가:
     스토어에 올리려면 1024px 아이콘이 있어야 하는데 팩에는 그런 게 없다.
     그렇다고 매끈한 벡터 불꽃을 얹으면 열었을 때 나오는 도트 화면과 따로 논다.
     아이콘은 「이 안에 무엇이 있는가」를 한 눈에 말하는 자리이므로,
     **성긴 격자에 그린 다음 그대로 확대**한다. 계단이 보이는 것이 의도다.

   불빛만 매끄럽다:
     게임 안에서도 횃불은 도트고 그 둘레의 빛무리는 매끈하다. 같은 규칙을 쓴다 —
     불씨는 격자에 딱딱 떨어지고, 그 뒤의 번짐은 격자를 넘어 부드럽게 퍼진다.

   무엇이 나오는가 (@capacitor/assets 가 먹는 이름 그대로):
     icon.png              1024  가득 찬 아이콘 (스토어 등록용 512 도 여기서 줄인다)
     icon-foreground.png   1024  적응형 아이콘의 앞면 — 잘려도 되게 가운데로 모은다
     icon-background.png   1024  적응형 아이콘의 뒷면 — 어둠과 옅은 빛무리
     splash.png            2732  첫 화면 (어두운 바탕 가운데 작은 불씨)
     splash-dark.png       2732  같은 것. 이 게임에 밝은 낮은 없다
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'app');

/* style.css 에서 그대로 가져온 색. 아이콘만 따로 놀면 안 된다. */
const BG      = [0x0C, 0x0A, 0x08];   // --bg
const EMBER   = [0xE9, 0x95, 0x4A];   // --ember
const DIM     = [0xA0, 0x5F, 0x27];   // --ember-dim
const HOT     = [0xFF, 0xE9, 0xC4];   // 심지 — 가장 뜨거운 곳
const MID     = [0xF0, 0xB0, 0x4A];
const EDGE    = [0x6B, 0x37, 0x14];   // 불꽃 가장자리의 그을음

/* ---------- 불꽃 모양 ----------
   물방울을 거꾸로 세운 것. 위는 뾰족하고 아래는 둥글다.
   y 는 0(위)에서 1(아래). 그 높이에서의 반폭을 돌려준다. */
const TIP = 0.08, FAT = 0.72, FOOT = 0.95, MAXW = 0.235;

function halfWidth(y) {
  if (y < TIP || y > FOOT) return 0;
  if (y <= FAT) {
    // 심지에서 배까지 — 천천히 벌어진다. 지수를 1 보다 크게 줘야 촛불처럼 선다
    return MAXW * Math.pow((y - TIP) / (FAT - TIP), 1.9);
  }
  // 배에서 발까지 — 반원으로 닫는다
  const t = (y - FAT) / (FOOT - FAT);
  return MAXW * Math.sqrt(Math.max(0, 1 - t * t));
}

/* 심지가 한쪽으로 휜다. 좌우가 딱 맞으면 불꽃이 아니라 삼각형으로 읽힌다 —
   불은 언제나 어딘가로 기울어 있다. 아래는 가만히 있고 위로 갈수록 휜다. */
function axis(y) {
  const up = Math.max(0, (FAT - y) / (FAT - TIP));
  return 0.5 + 0.085 * Math.pow(up, 2.2);
}

/* 불꽃 끝에서 떨어져 나간 불티. 이것 하나가 「불」이라고 말해 준다. */
const SPARKS = [
  { x: 0.585, y: 0.175, r: 0.022, c: 'MID' },
  { x: 0.625, y: 0.105, r: 0.015, c: 'EMBER' },
];

/* 불꽃 안쪽으로 얼마나 깊은가 (0 가장자리 ~ 1 심지).
   가로로만 재면 위쪽이 통째로 하얘지므로 세로 위치도 섞는다 —
   불은 아래가 뜨겁고 위로 갈수록 식는다. */
function heat(nx, ny) {
  for (const s of SPARKS) {
    const d = Math.hypot(nx - s.x, ny - s.y) / s.r;
    if (d <= 1) return s.c === 'MID' ? 0.7 : 0.45;
  }
  const hw = halfWidth(ny);
  if (hw <= 0) return -1;
  const dx = Math.abs(nx - axis(ny)) / hw;
  if (dx > 1) return -1;
  const across = 1 - dx;                       // 가운데일수록 1
  const along = 1 - Math.abs(ny - 0.80) / 0.34; // 배 근처가 가장 뜨겁다
  return Math.max(0, Math.min(1, across * 0.55 + Math.max(0, along) * 0.62));
}

function flameColor(h) {
  if (h < 0.12) return EDGE;
  if (h < 0.34) return DIM;
  if (h < 0.56) return EMBER;
  if (h < 0.78) return MID;
  return HOT;
}

/* ---------- 그리기 ----------
   격자(cells)에 불꽃을 굽고, 그 위에 빛무리를 매끈하게 덧칠한다. */
function render(size, opt) {
  const o = Object.assign({ cells: 22, scale: 1.0, lift: 0, bg: true, glow: 1 }, opt || {});
  const buf = Buffer.alloc(size * size * 4);

  // 1) 바탕
  for (let i = 0; i < size * size; i++) {
    if (o.bg) { buf[i * 4] = BG[0]; buf[i * 4 + 1] = BG[1]; buf[i * 4 + 2] = BG[2]; buf[i * 4 + 3] = 255; }
    else buf[i * 4 + 3] = 0;
  }

  // 2) 빛무리 — 격자를 넘어 부드럽게 퍼진다
  const cx = 0.5, cy = 0.5 + o.lift;
  if (o.glow > 0) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size - cx, dy = (y + 0.5) / size - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / (0.42 * o.scale);
        if (d >= 1) continue;
        const a = Math.pow(1 - d, 2.6) * 0.55 * o.glow;
        const i = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          buf[i + c] = Math.round(buf[i + c] * (1 - a) + EMBER[c] * a);
        }
        buf[i + 3] = Math.max(buf[i + 3], Math.round(255 * Math.min(1, a * 2.2)));
      }
    }
  }

  // 3) 불꽃 — 격자에 한 번 구워서 그대로 확대한다 (계단이 보여야 한다)
  const cell = size / o.cells;
  for (let gy = 0; gy < o.cells; gy++) {
    for (let gx = 0; gx < o.cells; gx++) {
      // 칸 한가운데를 표본으로 삼는다
      const nx = ((gx + 0.5) / o.cells - cx) / o.scale + 0.5;
      const ny = ((gy + 0.5) / o.cells - cy) / o.scale + 0.5;
      const h = heat(nx, ny);
      if (h < 0) continue;
      const col = flameColor(h);

      const x0 = Math.round(gx * cell), x1 = Math.round((gx + 1) * cell);
      const y0 = Math.round(gy * cell), y1 = Math.round((gy + 1) * cell);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * size + x) * 4;
          buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
        }
      }
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
    raw[y * (w * 4 + 1)] = 0;                       // 필터 없음
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
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log('  ' + path.basename(file).padEnd(22) + w + 'x' + h + '  ' + kb + ' KB');
}

/* ---------- 내보내기 ---------- */

fs.mkdirSync(OUT, { recursive: true });
const at = n => path.join(OUT, n);
console.log('assets/app/');

// 가득 찬 아이콘. 스토어 목록에서 작게 뜨므로 불꽃을 크게 잡는다.
/* 테두리에 닿게 그리면 발이 잘려 보이고, 스토어 목록에서 둥글게 깎일 때도
   가장자리를 먹는다. 조금 줄여서 사방에 여백을 남긴다. */
writePng(at('icon.png'), 1024, 1024, render(1024, { scale: 0.86, lift: 0 }));

/* 적응형 아이콘 — 안드로이드가 동그라미·네모·물방울로 마음대로 잘라낸다.
   바깥 33% 는 잘려 나간다고 보고 앞면을 안쪽으로 모은다. */
writePng(at('icon-foreground.png'), 1024, 1024,
  render(1024, { scale: 0.58, lift: 0, bg: false, glow: 0.5 }));
writePng(at('icon-background.png'), 1024, 1024,
  render(1024, { scale: 0.9, lift: 0, glow: 0.35, cells: 1 }));   // 불꽃 없이 어둠과 빛만

/* 첫 화면 — 가운데 작은 불씨 하나. 여기서 요란할 이유가 없다.
   이 게임에 밝은 낮은 없으므로 밝은 판도 같은 것을 쓴다. */
const splash = render(2732, { scale: 0.22, lift: 0, glow: 0.8, cells: 96 });
writePng(at('splash.png'), 2732, 2732, splash);
writePng(at('splash-dark.png'), 2732, 2732, splash);
