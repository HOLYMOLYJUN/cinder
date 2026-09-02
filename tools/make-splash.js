/* =========================================================
   make-splash.js — 홈 화면에서 열 때 뜨는 그림을 굽는다

   실행:  node tools/make-splash.js      # → assets/splash/*.png + 붙일 <link> 목록

   왜 필요한가:
     아이폰에서 「홈 화면에 추가」로 열면 게임이 뜨기 전에 **흰 화면이 번쩍인다.**
     안드로이드는 manifest 의 background_color 를 쓰지만 사파리는 그걸 안 본다.
     `<link rel="apple-touch-startup-image">` 로 **기기 해상도마다 한 장씩** 줘야
     하고, 그중 하나도 안 맞으면 그냥 흰 화면이다. 그래서 목록이 이렇게 길다.

   무엇을 그리는가:
     배경색 하나(#0C0A08 — manifest 와 앱 껍데기가 쓰는 그 색)에 아이콘을
     가운데 놓는다. 게임의 첫 프레임이 거의 검은색이라, 스플래시가 어두우면
     「스플래시 → 게임」이 이어져 보이고 번쩍임 자체가 사라진다.

     단색이 넓어서 PNG 가 아주 잘 눌린다 — 서른여섯 장을 다 합쳐도 몇십 KB 다.

   라이브러리를 안 쓴다 (make-icons.js·cut-npc.js 와 같은 이유).
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'app', 'icon-512.png');
const OUT = path.join(ROOT, 'assets', 'splash');

const BG = [0x0C, 0x0A, 0x08];      // manifest 의 background_color 와 같은 색
const ICON_RATIO = 0.30;            // 짧은 변의 몇 할을 아이콘이 차지하나

/* 기기 목록 — [CSS 폭, CSS 높이, 화소 배율].

   애플이 기기마다 정확한 크기를 요구하므로 목록으로 적는 것 말고 길이 없다.
   새 기기가 나오면 여기 한 줄을 더한다. 안 맞는 기기는 흰 화면이 되는데,
   그건 예전과 같은 상태라 나빠지지는 않는다. */
const DEVICES = [
  // 아이폰
  [320, 568, 2, 'iPhone SE 1 · 5s'],
  [375, 667, 2, 'iPhone SE 2·3 · 8 · 7 · 6s'],
  [414, 736, 3, 'iPhone 8 Plus'],
  [375, 812, 3, 'iPhone X · XS · 11 Pro · 12·13 mini'],
  [414, 896, 2, 'iPhone XR · 11'],
  [414, 896, 3, 'iPhone XS Max · 11 Pro Max'],
  [390, 844, 3, 'iPhone 12 · 13 · 14'],
  [393, 852, 3, 'iPhone 14 Pro · 15 · 16'],
  [402, 874, 3, 'iPhone 16 Pro'],
  [428, 926, 3, 'iPhone 12·13 Pro Max · 14 Plus'],
  [430, 932, 3, 'iPhone 14 Pro Max · 15 Plus·Pro Max · 16 Plus'],
  [440, 956, 3, 'iPhone 16 Pro Max'],
  // 아이패드 — 가로로 두는 일이 잦아 두 방향 다 필요하다
  [768, 1024, 2, 'iPad mini · 9.7'],
  [810, 1080, 2, 'iPad 10.2'],
  [820, 1180, 2, 'iPad Air 10.9'],
  [834, 1112, 2, 'iPad Pro 10.5'],
  [834, 1194, 2, 'iPad Pro 11'],
  [1024, 1366, 2, 'iPad Pro 12.9'],
];

/* ---------- PNG 읽기 (8비트 RGBA 만) ---------- */
function decode(file) {
  const b = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = b.readUInt32BE(pos + 8); h = b.readUInt32BE(pos + 12);
      if (b[pos + 16] !== 8 || b[pos + 17] !== 6) {
        throw new Error(file + ': RGBA8 이 아니다');
      }
    }
    if (type === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4, px = Buffer.alloc(w * h * 4);
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

/* 알파를 버리고 RGB 로 쓴다 — 스플래시는 뒤가 비칠 일이 없고,
   채널 하나가 빠지면 파일이 눈에 띄게 줄어든다. */
function encodeRGB(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;                       // RGB8
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 아이콘을 줄인다 ----------
   넓이 평균으로 줄인다. 도트 그림이라 최근접이 어울릴 것 같지만, 512 를
   임의 크기로 줄이면 최근접은 화소 줄이 들쭉날쭉해져 오히려 지저분하다.
   스플래시는 한 번 스치는 그림이라 부드러운 쪽이 낫다. */
function scaleIcon(src, size) {
  const out = Buffer.alloc(size * size * 4);
  const k = src.w / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < src.h; sy++) {
        for (let sx = x0; sx < x1 && sx < src.w; sx++) {
          const o = (sy * src.w + sx) * 4;
          const al = src.px[o + 3] / 255;
          r += src.px[o] * al; g += src.px[o + 1] * al; b += src.px[o + 2] * al;
          a += src.px[o + 3]; n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = n ? Math.round(r / n) : 0;
      out[o + 1] = n ? Math.round(g / n) : 0;
      out[o + 2] = n ? Math.round(b / n) : 0;
      out[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return { w: size, h: size, px: out };
}

function compose(w, h, icon) {
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2];
  }
  const ox = Math.round((w - icon.w) / 2);
  const oy = Math.round((h - icon.h) / 2);
  for (let y = 0; y < icon.h; y++) {
    for (let x = 0; x < icon.w; x++) {
      const s = (y * icon.w + x) * 4;
      const a = icon.px[s + 3] / 255;
      if (a <= 0) continue;
      const dx = ox + x, dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const d = (dy * w + dx) * 3;
      // 배경 위에 얹는다 (아이콘 가장자리가 반투명이라 섞어야 테두리가 안 생긴다)
      px[d] = Math.round(icon.px[s] * a + BG[0] * (1 - a));
      px[d + 1] = Math.round(icon.px[s + 1] * a + BG[1] * (1 - a));
      px[d + 2] = Math.round(icon.px[s + 2] * a + BG[2] * (1 - a));
    }
  }
  return px;
}

/* ---------- 굽기 ---------- */
if (!fs.existsSync(ICON)) {
  console.error('아이콘이 없다: ' + ICON + '  (npm run app:icons 를 먼저)');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

const src = decode(ICON);
const links = [];
let bytes = 0, count = 0;

for (const [cw, ch, dpr, label] of DEVICES) {
  for (const portrait of [true, false]) {
    const w = Math.round((portrait ? cw : ch) * dpr);
    const h = Math.round((portrait ? ch : cw) * dpr);
    const size = Math.round(Math.min(w, h) * ICON_RATIO);
    const png = encodeRGB(w, h, compose(w, h, scaleIcon(src, size)));
    const name = `splash-${w}x${h}.png`;
    fs.writeFileSync(path.join(OUT, name), png);
    bytes += png.length; count++;

    /* 미디어 질의는 CSS 픽셀로 적는다 — 화소 배율은 -webkit-device-pixel-ratio 가 따로 본다.
       방향까지 적어야 한 기기의 두 장이 안 겹친다. */
    links.push(
      `<link rel="apple-touch-startup-image" href="/assets/splash/${name}" ` +
      `media="(device-width: ${cw}px) and (device-height: ${ch}px) and ` +
      `(-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${portrait ? 'portrait' : 'landscape'})">`
    );
  }
}

fs.writeFileSync(path.join(OUT, 'links.html'), links.join('\n') + '\n');
console.log(`assets/splash/ — ${count}장, 합쳐서 ${(bytes / 1024).toFixed(0)} KB`);
console.log('붙일 <link> 목록: assets/splash/links.html');
