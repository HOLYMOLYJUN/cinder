/* =========================================================
   test-splash.js — 홈 화면 스플래시가 기기마다 실제로 걸리는가

     node tools/test-splash.js

   애플은 미디어 질의가 **정확히** 맞는 그림 하나를 고른다. 하나도 안 맞으면
   흰 화면이고, 그건 이 기능이 아예 없는 것과 같다. 눈으로는 아이폰을
   기기별로 다 열어 봐야 알 수 있으므로 여기서 대신 잰다.

   무엇을 재는가:
     1. <link> 가 가리키는 파일이 실제로 있는가
     2. 그림의 화소 크기가 미디어 질의와 맞는가 (CSS 크기 × 배율)
     3. 기기·방향마다 맞는 그림이 정확히 하나인가 (0 이면 흰 화면, 2 면 어느 것이 뽑힐지 모른다)
   ========================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fails = 0;
const check = (ok, m) => { console.log((ok ? '  O ' : '  X ') + m); if (!ok) fails++; };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const links = [...html.matchAll(
  /<link rel="apple-touch-startup-image" href="([^"]+)"\s+media="([^"]+)">/g)]
  .map(m => {
    const media = m[2];
    const num = re => { const v = media.match(re); return v ? Number(v[1]) : null; };
    return {
      href: m[1],
      w: num(/device-width:\s*(\d+)px/),
      h: num(/device-height:\s*(\d+)px/),
      dpr: num(/-webkit-device-pixel-ratio:\s*(\d+)/),
      portrait: /orientation:\s*portrait/.test(media),
    };
  });

console.log('\n[ 목록 ]');
check(links.length > 0, `<link> 이 ${links.length}개 있다`);

console.log('\n[ 파일이 실제로 있고 크기가 맞는가 ]');
let missing = 0, wrongSize = 0;
for (const l of links) {
  const file = path.join(ROOT, l.href.replace(/^\//, ''));
  if (!fs.existsSync(file)) { missing++; console.log('    없음: ' + l.href); continue; }
  const b = fs.readFileSync(file);
  const pw = b.readUInt32BE(16), ph = b.readUInt32BE(20);
  // 세로면 CSS 폭×배율 = 화소 폭, 가로면 뒤집힌다
  const wantW = Math.round((l.portrait ? l.w : l.h) * l.dpr);
  const wantH = Math.round((l.portrait ? l.h : l.w) * l.dpr);
  if (pw !== wantW || ph !== wantH) {
    wrongSize++;
    console.log(`    어긋남: ${l.href} — 파일 ${pw}x${ph}, 질의는 ${wantW}x${wantH}`);
  }
}
check(missing === 0, `가리키는 파일이 다 있다 (빠진 것 ${missing})`);
check(wrongSize === 0, `화소 크기가 질의와 맞는다 (어긋난 것 ${wrongSize})`);

/* 실제 기기가 열었을 때 몇 장이 걸리는가.
   애플의 규칙 그대로 — 폭·높이·배율·방향이 전부 같아야 한다. */
console.log('\n[ 기기마다 정확히 한 장이 걸리는가 ]');
const DEVICES = [
  [320, 568, 2, 'iPhone SE 1'],
  [375, 667, 2, 'iPhone SE 2·3'],
  [375, 812, 3, 'iPhone X · 13 mini'],
  [390, 844, 3, 'iPhone 13 · 14'],
  [393, 852, 3, 'iPhone 15 · 16'],
  [402, 874, 3, 'iPhone 16 Pro'],
  [414, 896, 2, 'iPhone XR · 11'],
  [428, 926, 3, 'iPhone 14 Plus'],
  [430, 932, 3, 'iPhone 15 Pro Max'],
  [440, 956, 3, 'iPhone 16 Pro Max'],
  [820, 1180, 2, 'iPad Air'],
  [1024, 1366, 2, 'iPad Pro 12.9'],
];
let bad = 0;
for (const [w, h, dpr, name] of DEVICES) {
  for (const portrait of [true, false]) {
    const hit = links.filter(l => l.w === w && l.h === h && l.dpr === dpr && l.portrait === portrait);
    if (hit.length !== 1) {
      bad++;
      console.log(`    ${name} ${portrait ? '세로' : '가로'} — ${hit.length}장 (1이어야 한다)`);
    }
  }
}
check(bad === 0, `${DEVICES.length}종 × 두 방향 전부 한 장씩 걸린다`);

/* 앱 빌드에는 안 딸려 가야 한다. build.js 가 head 를 따로 쓰므로 그래야 맞는데,
   나중에 누가 head 를 index.html 에서 긁어오게 바꾸면 앱이 800KB 무거워진다. */
console.log('\n[ 앱 빌드에는 안 들어간다 ]');
const appFile = path.join(ROOT, 'dist', 'app', 'index.html');
if (fs.existsSync(appFile)) {
  const app = fs.readFileSync(appFile, 'utf8');
  check(!app.includes('apple-touch-startup-image'),
        '앱 한 장짜리에는 스플래시 <link> 가 없다 (앱은 제 스플래시가 따로 있다)');
} else {
  console.log('  · dist/app 이 없어 건너뛴다 (npm run build:app 뒤에 다시)');
}

console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
process.exit(fails ? 1 : 0);
