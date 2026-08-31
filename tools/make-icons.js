/* =========================================================
   make-icons.js — 방어구와 장신구 아이콘을 그린다

   실행:  node tools/make-icons.js      # → assets/icons/*.png

   왜 그리는가:
     0x72 팩에도, 확장 팩에도 갑옷·로브·장화·목걸이·반지 그림이 없다.
     무기만 아이콘이 붙고 나머지는 글자로 남으면 장비창이 반쪽이 된다.

   어떻게 맞추는가:
     - 크기는 똑같이 16x16.
     - 색은 팩 스프라이트에서 뽑아낸 것만 쓴다 (아래 PAL). 윤곽선은 #222222 로 통일.
     - 같은 부류는 실루엣을 공유하고 색만 바꾼다. 갑옷 넷이 서로 다른 모양이면
       한 줄에 늘어놨을 때 무엇이 갑옷인지 읽히지 않는다.
     - 광원은 왼쪽. 왼쪽에 밝은 면(H), 오른쪽에 그늘(s) 을 띠로 깐다.
       팩은 2px 짜리 손잡이조차 'o 밝은면 어두운면 o' 로 쪼갠다. 단색 덩어리에
       점 몇 개를 찍으면 색 수가 같아도 납작해 보인다. 면적 배분이 관건이라
       팩 무기(윤곽 47% / 22% / 19% / 10%) 와 비슷한 비율을 목표로 한다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'icons');

/* 팩 스프라이트에서 실제로 세어 뽑은 색들 */
const PAL = {
  '.': null,               // 투명
  o: '#222222',            // 윤곽선 — 팩 전체가 이 한 가지를 쓴다
  // 가죽
  L: '#8F4029', l: '#C56025', k: '#5E2A1B',
  // 무두질한 밝은 가죽
  B: '#B58057', b: '#D3BFA9', a: '#8A503E',
  // 강철
  S: '#417089', s: '#2C4C5E', h: '#5698CC',
  // 사슬 (회색 강철)
  G: '#6B6B72', g: '#4A4A52', H: '#9A9AA4',
  // 금
  Y: '#FACB3E', y: '#EE8E2E',
  // 파랑 (마법사)
  U: '#5956BD', u: '#3B3A85', V: '#7B79D6',
  // 청록 (수호)
  T: '#55A894', t: '#3D734F', v: '#72D6CE',
  // 재 · 그을림
  A: '#4A423C', c: '#2E2925', C: '#6E645B',
  // 불씨
  E: '#EE8E2E', e: '#C56025', F: '#FACB3E',
  // 붉은 보석
  R: '#DA4E38', r: '#8F2A22',
  // 크리스탈
  X: '#72D6CE', x: '#417089',
  // 밝은 천
  W: '#FDF7ED',
};

/* ---------- 실루엣 ----------
   대문자 X 자리에 주 색, H 에 밝은 색, s 에 그늘 색이 들어간다.
   아래 그림에서 X/H/s 는 자리표시자이고, 아이콘마다 실제 색으로 갈아 끼운다. */

const CUIRASS = [                       // 갑옷 — 목이 파인 흉갑. 왼쪽이 밝고 오른쪽이 그늘, 허리에 띠 한 줄
  '................',
  '................',
  '..oooooooooooo..',
  '..oHHXXooXXsso..',
  '..oHHXXooXXsso..',
  '..oHHXXXXXXsso..',
  '..oHHXXXXXXsso..',
  '..osssssssssso..',
  '..oHHXXXXXXsso..',
  '...oHXXXXXsso...',
  '...oHXXXXXsso...',
  '...oHXXXXXsso...',
  '....oHXXXsso....',
  '....oooooooo....',
  '................',
  '................',
];

const ROBE = [                          // 로브 — 후드가 비어 있고 아래로 퍼진다
  '................',
  '......oooo......',
  '.....oHHHHo.....',
  '....oHssssHo....',
  '....oHssssHo....',
  '....oHXXXXso....',
  '...oHHXXXXsso...',
  '..oHHXXXXXXsso..',
  '..oHHXXXXXXsso..',
  '.oHHXXsXXsXXsso.',
  '.oHHXXsXXsXXsso.',
  'oHHXXXsXXsXXXsso',
  'oHHXXXsXXsXXXsso',
  'oHHXXXsXXsXXXsso',
  '.oooooooooooooo.',
  '................',
];

const BOOTS = [                         // 장화 — 발목에 커프스, 바닥에 밑창. 그게 없으면 16px 에서 알파벳 L 로 읽힌다
  '................',
  '....oooooo......',
  '...oHHHHHHo.....',
  '...oHHXXsso.....',
  '...oHHXXsso.....',
  '...oHHXXsso.....',
  '...oHHXXsso.....',
  '...oHHXXsso.....',
  '...oHHXXsso.....',
  '...oHHXXssoooo..',
  '...oHHXXXXXXsso.',
  '...oHHXXXXXXsso.',
  '...osssssssssso.',
  '....oooooooooo..',
  '................',
  '................',
];

const AMULET = [                        // 목걸이 — 끈과 매달린 것
  '................',
  '...oo......oo...',
  '..osso....osso..',
  '..osso....osso..',
  '...osso..osso...',
  '....osso.osso...',
  '.....ossosso....',
  '......oooo......',
  '.....oWXXso.....',
  '....oHHXXsso....',
  '....oHXXXXso....',
  '....oXXXXsso....',
  '.....oXXsso.....',
  '......oooo......',
  '................',
  '................',
];

const RING = [                          // 반지 — 고리 위에 보석
  '................',
  '................',
  '.......oo.......',
  '......oWXo......',
  '.....oHHXso.....',
  '.....oHXXso.....',
  '....oooooooo....',
  '...oHHXXXXsso...',
  '...oHXoooooso...',
  '..oHHo....osso..',
  '..oHHo....osso..',
  '..oHXo....oXso..',
  '...oHXXooXXso...',
  '....oooooooo....',
  '................',
  '................',
];

const STAFF_ASH = [                     // 재의 지팡이 — 팩에 지팡이 그림이 둘뿐이라 세 번째는 직접 그린다
  '..oooo..',
  '.oFFFFo.',
  'oFEEEEFo',
  'oEEooEEo',
  'oFEEEEFo',
  '.oFFFFo.',
  '..oEEo..',
  // 자루 — 팩의 무기 손잡이가 전부 'o 밝은면 어두운면 o' 라 그 규칙을 그대로 따른다
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oHXo..',
  '..oooo..',
];

const BOW_ASH = [                       // 재의 활 — 팩의 활(14x26)과 같은 틀. 시위는 왼쪽, 몸통은 오른쪽으로 휜다
  '..............',
  '..oo..........',
  '.oWCoo........',
  '.oWoCCoo......',
  '.oWo.oCCo.....',
  '.oWo..oCCo....',
  '.oWo...oCCo...',
  '.oWo....oCo...',
  '.oWo....oCCo..',
  '.oWo.....oCo..',
  '.oWo.....oCo..',
  // 손잡이 — 불씨를 감았다. 재 계열 장비의 공통 표식.
  '.oWo.....oEo..',
  '.oWo.....oFo..',
  '.oWo.....oFo..',
  '.oWo.....oEo..',
  '.oWo.....oCo..',
  '.oWo.....oCo..',
  '.oWo....oCCo..',
  '.oWo....oCo...',
  '.oWo...oCCo...',
  '.oWo..oCCo....',
  '.oWo.oCCo.....',
  '.oWoCCoo......',
  '.oWCoo........',
  '..oo..........',
  '..............',
];

/* ---------- 아이콘 목록 ----------
   X = 주 색, H = 밝은 색, s = 그늘 색. 나머지 글자는 PAL 그대로 쓴다. */

const ICONS = {
  icon_armor_leather: [CUIRASS, { X: 'L', H: 'l', s: 'k' }],
  icon_armor_chain:   [CUIRASS, { X: 'G', H: 'H', s: 'g' }],
  icon_armor_plate:   [CUIRASS, { X: 'S', H: 'h', s: 's' }],
  icon_armor_burnt:   [CUIRASS, { X: 'A', H: 'E', s: 'c' }],   // 그을린 자리에 불씨가 남았다

  icon_robe_blue:     [ROBE, { X: 'U', H: 'V', s: 'u' }],
  icon_robe_teal:     [ROBE, { X: 'T', H: 'v', s: 't' }],
  icon_robe_ash:      [ROBE, { X: 'A', H: 'C', s: 'c' }],

  icon_boots_leather: [BOOTS, { X: 'B', H: 'b', s: 'a' }],
  icon_boots_swift:   [BOOTS, { X: 'T', H: 'v', s: 't' }],

  icon_amulet:         [AMULET, { X: 'y', H: 'Y', s: 'a' }],
  icon_amulet_crystal: [AMULET, { X: 'X', H: 'W', s: 'x' }],

  // 밝은 면이 넓어졌으므로 하이라이트에 흰색을 쓰면 붉은색과 줄무늬로 읽힌다. 주황으로 한 칸만 올린다.
  icon_ring_red:   [RING, { X: 'R', H: 'E', s: 'r' }],
  icon_ring_ember: [RING, { X: 'E', H: 'F', s: 'e' }],

  icon_staff_ash: [STAFF_ASH, { X: 'C', H: 'b' }],   // E/F 는 그대로 불씨 색
  icon_bow_ash:   [BOW_ASH, {}],                     // 색을 직접 적었으므로 바꿔 낄 것이 없다
};

/* ---------- PNG 쓰기 ----------
   외부 라이브러리를 쓰지 않는다. 이 저장소에 의존성이 하나도 없는 것이
   "받아서 index.html 열면 끝"을 유지하는 조건이라 도구 쪽도 그 규칙을 지킨다. */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
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
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function draw(rows, swap) {
  const w = rows[0].length, h = rows.length;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const line = rows[y] || '';
    for (let x = 0; x < w; x++) {
      let ch = line[x] || '.';
      if (swap[ch]) ch = swap[ch];
      const col = PAL[ch];
      if (!col) continue;
      const [r, g, b] = hex(col);
      const o = (y * w + x) * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
  }
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [name, [rows, swap]] of Object.entries(ICONS)) {
  writePng(path.join(OUT, name + '.png'), rows[0].length, rows.length, draw(rows, swap));
  n++;
}

/* 한 장에 늘어놓은 대조용 그림. 눈으로 확인할 때만 쓴다. */
if (process.argv.includes('--sheet')) {
  const names = Object.keys(ICONS);
  const cell = 34;
  const W = names.length * cell, H = cell;
  const sheet = Buffer.alloc(W * H * 4);
  names.forEach((name, i) => {
    const [rows, swap] = ICONS[name];
    const w = rows[0].length, h = rows.length;
    const px = draw(rows, swap);
    const ox = i * cell + Math.floor((cell - w) / 2), oy = Math.floor((cell - h) / 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const src = (y * w + x) * 4;
        const dst = ((y + oy) * W + ox + x) * 4;
        px.copy(sheet, dst, src, src + 4);
      }
  });
  writePng(path.join(OUT, '_sheet.png'), W, H, sheet);
  console.log('대조용 _sheet.png 도 만들었다');
}

console.log(`assets/icons/ — 아이콘 ${n}장`);
