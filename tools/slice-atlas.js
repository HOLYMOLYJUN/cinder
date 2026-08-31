/* =========================================================
   slice-atlas.js — 아틀라스에서 쓸 칸만 잘라 낱장으로 뽑는다

   실행:  node tools/slice-atlas.js
   결과:  assets/tileset-sewers/frames/*.png

   왜 필요한가:
     하수도 팩(0x72 Sewers)은 바닥·벽·소품이 아틀라스 한 장에 붙어 있다.
     이 저장소의 pack-sprites.js 는 낱장 PNG 만 찾으므로(findFrame),
     그 사이를 메우는 단계가 하나 필요하다.

     원본 아틀라스는 건드리지 않고 여기서 뽑기만 한다. 쓰는 칸을 바꾸고 싶으면
     아래 CUTS 만 고치고 다시 돌리면 된다 — pack-sprites.js 와 같은 규칙이다.

   왜 크로미움을 쓰는가:
     PNG 를 읽으려면 디코더가 필요한데 이 저장소는 의존성을 두지 않는다.
     tools/ 는 이미 playwright 로 브라우저를 띄우고 있으므로(play.js) 그것을 빌린다.
     굽는 것(pack-sprites)은 여전히 순수 node 라 평소 작업에는 브라우저가 필요 없다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'tileset-sewers');
const OUT = path.join(SRC, 'frames');
// 동물 팩도 가로 한 줄짜리 시트라 같은 도구로 뗀다
const SRC_ANIMALS = path.join(ROOT, 'assets', 'animals');
const OUT_ANIMALS = path.join(SRC_ANIMALS, 'frames');

/* 어느 칸을 쓸 것인가.  [열, 행] 은 칸 단위 좌표다.
   floor 와 walls_low 는 16x16, walls_high 는 16x32 격자다. */
const CUTS = [
  /* ---- 바닥 8종 ----
     기존 팩도 바닥이 8종이라 floorVariant 가 그대로 돌아간다.
     무늬가 센 칸(버섯·파이프·구멍)은 뺐다 — 바닥은 배경이라
     눈에 띄면 그 위에 선 몬스터가 안 읽힌다. */
  { src: 'floor.png', cell: 16, cells: [[0,0],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3]],
    name: i => `sewer_floor_${i}` },

  /* ---- 벽 ----
     높은 벽 아틀라스는 한 칸이 16x32 인데 그림이 칸을 다 쓰지 않는다.
     (2,3) 칸을 줄별로 재 보면 y=0..10 이 비어 있고, y=11 부터 밝은 마감이 시작해
     y=20 부터 벽돌이 네 줄 주기로 반복된다.

     그래서 반으로 가르면 안 된다 — 위 절반은 대부분 빈칸이고,
     아래 절반은 마감 꼬리가 섞여 세로로 이으면 줄이 어긋난다.

     몸통은 반복 단위(네 줄)만 떼어 네 번 쌓아 이음매 없는 16x16 을 만들고,
     마감은 마감이 시작하는 줄부터 16 줄을 떼어 칸 위쪽에 마감이 오게 한다.
     (wallTop 은 wallFace 위에 덧그려지므로 아래쪽 벽돌은 겹쳐도 그대로다) */
  { src: 'atlas_walls_high-16x32.png', cellW: 16, cellH: 32, cells: [[2,3]],
    name: () => 'sewer_wall_mid', crop: [0, 20, 16, 4], stack: 16 },
  { src: 'atlas_walls_high-16x32.png', cellW: 16, cellH: 32, cells: [[2,3]],
    name: () => 'sewer_wall_top', crop: [0, 11, 16, 16] },

  /* ---- 바닥에 나는 표 ---- 밟고 지나가는 것들이라 눈에 안 띄어야 한다 */
  { src: 'floor.png', cell: 16, cells: [[1,4]], name: () => 'sewer_grate' },   // 배수구
  { src: 'floor.png', cell: 16, cells: [[4,2]], name: () => 'sewer_hole' },    // 뚫린 구멍

  /* 다음 층으로 나가는 자리. 이 팩에만 「위로 난 것」이 있다 —
     0x72 의 floor_stairs 는 어둠으로 내려가는 계단이고, 나머지는 전부 사다리다.
     하수도 층에만 쓰는 게 아니라 전 층에서 쓴다(pack-sprites 의 stairs). */
  { src: 'floor.png', cell: 16, cells: [[2,4]], name: () => 'sewer_stairs' },

  /* ---- 벽에서 쏟아지는 물 ---- 세 장짜리 애니메이션.
     하수도라는 것을 한눈에 말해 주는 물건이라 제일 먼저 골랐다. */
  { src: 'items.png', cell: 16, cells: [[11,7],[12,7],[13,7]],
    name: i => `sewer_fall_${i}` },

  /* ---- 벽에 붙는 것 ---- 방마다 하나씩 걸어 같은 벽이 이어지는 느낌을 끊는다 */
  { src: 'items.png', cell: 16, cells: [[4,9]],  name: () => 'sewer_vent' },   // 쇠창살
  { src: 'items.png', cell: 16, cells: [[0,10]], name: () => 'sewer_pipe' },   // 이끼 낀 관
  { src: 'items.png', cell: 16, cells: [[9,7]],  name: () => 'sewer_web' },    // 거미줄

  /* ---- 바닥에 놓이는 것 ----
     이끼만 실제로 깔린다(밟으면 아프다 — js/map.js 의 SEWER_FLOOR_PROPS 참고).
     항아리·통·배수구는 벽 쪽과 예비로 남겨 둔다 — 뽑는 값이 싸고,
     바닥에 무엇을 놓을지 다시 정할 때 여기부터 고르면 되기 때문이다. */
  /* 항아리는 두 칸에 걸쳐 그려져 있다 — 한 칸만 떼면 반쪽이 된다.
     32 폭으로 떼어 두면 tile() 이 가운데 맞춰 그리므로 칸을 조금 넘어 놓인다.
     사람 그림도 칸을 넘으므로(16x28) 이 팩에서는 그게 어긋난 게 아니다. */
  { src: 'items.png', cell: 16, cells: [[2,10]], name: () => 'sewer_jar_a', crop: [0, 0, 32, 16] },
  { src: 'items.png', cell: 16, cells: [[4,10]], name: () => 'sewer_jar_b', crop: [0, 0, 32, 16] },
  { src: 'items.png', cell: 16, cells: [[0,11]], name: () => 'sewer_barrel' },
  { src: 'items.png', cell: 16, cells: [[1,11]], name: () => 'sewer_barrel2' },
  { src: 'items.png', cell: 16, cells: [[9,2]],  name: () => 'sewer_moss_a' },
  { src: 'items.png', cell: 16, cells: [[11,2]], name: () => 'sewer_moss_b' },
];

/* 따라다니는 것들. 시트가 64x16 — 가로로 네 칸이 곧 네 프레임이다.
   여기만 나가는 폴더가 다르므로 따로 둔다. */
const ANIMAL_CUTS = [
  { src: 'MeowingCat.png', cell: 16, cells: [[0,0],[1,0],[2,0],[3,0]],
    name: i => `pet_cat_${i}`, dir: OUT_ANIMALS, from: SRC_ANIMALS },
  { src: 'SnowFox.png',   cell: 16, cells: [[0,0],[1,0],[2,0],[3,0]],
    name: i => `pet_dog_${i}`, dir: OUT_ANIMALS, from: SRC_ANIMALS },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(OUT_ANIMALS, { recursive: true });
  const jobs = [];
  for (const c of [...CUTS, ...ANIMAL_CUTS]) {
    const p = path.join(c.from || SRC, c.src);
    if (!fs.existsSync(p)) { console.error('원본이 없습니다:', c.src); process.exit(1); }
    const uri = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    c.cells.forEach((cell, i) => {
      jobs.push({
        uri,
        cw: c.cellW || c.cell, ch: c.cellH || c.cell,
        col: cell[0], row: cell[1],
        crop: c.crop || null,
        stack: c.stack || 0,        // 이 높이가 될 때까지 세로로 쌓는다
        dir: c.dir || OUT,
        file: c.name(i) + '.png',
      });
    });
  }

  const b = await chromium.launch();
  const page = await b.newPage();
  const out = await page.evaluate(async (jobs) => {
    const cache = {};
    const load = async (uri) => {
      if (cache[uri]) return cache[uri];
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = uri; });
      return (cache[uri] = img);
    };
    const res = [];
    for (const j of jobs) {
      const img = await load(j.uri);
      const [ox, oy, w, h] = j.crop || [0, 0, j.cw, j.ch];
      const outH = j.stack || h;
      const c = document.createElement('canvas');
      c.width = w; c.height = outH;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      for (let y = 0; y < outH; y += h) {
        const part = Math.min(h, outH - y);      // 마지막 조각은 원본도 같이 잘라야 안 눌린다
        x.drawImage(img, j.col * j.cw + ox, j.row * j.ch + oy, w, part,
                    0, y, w, part);
      }
      res.push({ file: j.file, dir: j.dir, uri: c.toDataURL('image/png') });
    }
    return res;
  }, jobs);
  await b.close();

  for (const o of out) {
    fs.writeFileSync(path.join(o.dir, o.file),
      Buffer.from(o.uri.split(',')[1], 'base64'));
  }
  const n = d => out.filter(o => o.dir === d).length;
  console.log(`assets/tileset-sewers/frames/ — ${n(OUT)}장`);
  console.log(`assets/animals/frames/ — ${n(OUT_ANIMALS)}장`);
})();
