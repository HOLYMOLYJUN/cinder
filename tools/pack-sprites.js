/* =========================================================
   pack-sprites.js — 스프라이트를 js/sprites.js 한 파일로 굽는다

   실행:  node tools/pack-sprites.js

   왜 데이터 URI로 굽는가:
     1) 아티팩트는 HTML 한 장이라 외부 이미지를 못 불러온다.
     2) 로컬에서도 index.html 을 더블클릭해서 열 수 있게 유지하고 싶다.
        (브라우저가 file:// 에서 이미지 로딩을 막는다)
   둘 다 해결하려면 이미지가 JS 안에 들어가 있어야 한다.

   원본은 assets/tileset/frames/ 에 그대로 두므로,
   쓰는 스프라이트를 바꾸고 싶으면 아래 MANIFEST 만 고치고 다시 구우면 된다.
   ========================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRAMES = path.join(ROOT, 'assets', 'tileset', 'frames');
// 확장 팩 (nijikokun, CC0). 원본에 없는 횃불·불꽃·병·열쇠가 여기 있다.
const FRAMES_EXT = path.join(ROOT, 'assets', 'tileset-extended', 'frames');

// 우리가 직접 그린 것 (tools/make-icons.js). 팩에 없는 갑옷·장신구가 여기 있다.
const ICONS = path.join(ROOT, 'assets', 'icons');
// 우리가 따로 만든 캐릭터. 라이선스가 다르므로 CC0 원본 폴더에 섞지 않는다.
const FRAMES_CUSTOM = path.join(ROOT, 'assets', 'custom', 'frames');

// 같은 이름이면 원본(v1.7)이 이긴다 — 확장 팩 쪽이 구버전이라 몇 픽셀 다르다.
function findFrame(file) {
  for (const dir of [FRAMES, FRAMES_EXT, ICONS, FRAMES_CUSTOM]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 확장 팩 애니메이션은 f0..fN 이 이어져 있다
function extFrames(name, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(`${name}_f${i}.png`);
  return out;
}
const OUT = path.join(ROOT, 'js', 'sprites.js');

/* ---------- 어떤 그림을 쓸지 ---------- */

// 이 팩은 캐릭터마다 파일 이름 규칙이 조금씩 다르다.
// name_idle_anim_fN 이 있으면 그것, 없으면 name_anim_fN 을 쓴다.
function frames(name, kind, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = `${name}_${kind}_anim_f${i}.png`;
    const b = `${name}_anim_f${i}.png`;
    if (findFrame(a)) out.push(a);
    else if (findFrame(b)) out.push(b);
  }
  return out;
}

function one(file) { return [file + '.png']; }

const CHARACTERS = {
  // 게임 안에서 쓰는 이름          팩 안의 이름
  // 고를 수 있는 사람들 — js/heroes.js 의 sprite 값과 열쇠가 맞아야 한다
  'hero.knight': 'knight_m',
  'hero.elf':    'elf_f',
  'hero.wizard': 'wizzard_m',
  'hero.lizard': 'lizard_m',
  'hero.dwarf':  'dwarf_f',
  player:      'knight_m',
  // 몬스터 12종
  rat:         'tiny_zombie',
  goblin:      'goblin',
  bat:         'imp',
  kobold:      'masked_orc',
  shaman:      'orc_shaman',
  orc:         'orc_warrior',
  skeleton:    'skelet',
  wraith:      'wogol',
  ooze:        'swampy',
  troll:       'big_zombie',
  darkmage:    'necromancer',
  golem:       'ogre',
  // 뒤늦게 더 넣은 것들
  zombie:      'zombie',
  muddy:       'muddy',
  pumpkin:     'pumpkin_dude',
  slug:        'slug',
  tinyslug:    'tiny_slug',
  icezombie:   'ice_zombie',
  doc:         'doc',
  bigdemon:    'big_demon',
  dragon:      'dragon',        // 팩에 용이 없어서 따로 그렸다 — assets/custom/
  // 보스
  gate:        'chort',
  named:       'angel',
  keeper:      'knight_m',      // 당신의 얼굴을 하고 있다 — 같은 그림에 불빛을 입힌다
  // 상인
  merchant:    'dwarf_m',
};

const MANIFEST = {};
for (const [key, src] of Object.entries(CHARACTERS)) {
  MANIFEST[key + '.idle'] = frames(src, 'idle');
  const run = frames(src, 'run');
  MANIFEST[key + '.run'] = run.length ? run : frames(src, 'idle');
}

Object.assign(MANIFEST, {
  'floor':    ['floor_1.png','floor_2.png','floor_3.png','floor_4.png',
               'floor_5.png','floor_6.png','floor_7.png','floor_8.png'],
  'wallFace': one('wall_mid'),
  'wallTop':  one('wall_top_mid'),
  'wallLeft': one('wall_left'),
  'wallRight':one('wall_right'),
  'stairs':   one('floor_ladder'),
  'coin':     ['coin_anim_f0.png','coin_anim_f1.png','coin_anim_f2.png','coin_anim_f3.png'],
  'chest':    one('chest_full_open_anim_f0'),
  'door':     one('doors_leaf_closed'),
  'key':      one('key_small'),
  // UI 아이콘 — 화면 밖 인터페이스도 같은 그림에서 가져온다
  'heartFull': one('ui_heart_full'),
  'heartHalf': one('ui_heart_half'),
  'heartEmpty':one('ui_heart_empty'),

  /* 불 — 여기부터는 확장 팩에서 온다.
     모닥불은 불꽃만 있는 flame 을 크게 그리고, 벽에 거는 것은 받침이 붙은 torch_wall 을 쓴다.
     torch_glow 는 횃불 바로 위 칸에 겹치는 빛 무늬라 따로 그린다. */
  'campFlame': extFrames('flame_anim', 8),
  'torchWall': extFrames('torch_wall_anim', 8),
  'torchGlow': extFrames('torch_glow_anim', 8),
  // 모닥불 받침. 붉은 분수 대야를 빌려 쓴다 — 팩에 화톳불 자리가 따로 없다.
  'camp':      ['wall_fountain_basin_red_anim_f0.png',
                'wall_fountain_basin_red_anim_f1.png',
                'wall_fountain_basin_red_anim_f2.png'],

  /* 물약 — 큰 병이 작은 아이콘으로 줄여도 형태가 남는다 */
  'potion':     one('flask_big_red'),
  'potionIcon': one('flask_big_red'),

  /* 화살 — 활이 쏘는 투사체. 그림은 위를 보고 있고, 그리는 쪽에서 돌린다 */
  'arrow':      one('weapon_arrow'),
});

/* 장비 아이콘.
   무기는 팩에 그림이 있다. 방어구와 장신구는 어느 팩에도 없어서
   tools/make-icons.js 가 같은 16px 격자·같은 팔레트로 그려 assets/icons/ 에 둔다. */
const GEAR_ICONS = {
  '낡은 단검':   'weapon_knife',
  '짧은 검':     'weapon_regular_sword',
  '전투 도끼':   'weapon_axe',
  '긴 창':       'weapon_spear',
  '대검':        'weapon_knight_sword',
  '불씨 단검':   'weapon_red_gem_sword',
  '불씨 검':     'weapon_lavish_sword',
  '사냥 활':     'weapon_bow',
  '긴 활':       'weapon_bow_2',
  '재의 활':     'icon_bow_ash',
  '나무 지팡이': 'weapon_green_magic_staff',
  '주술 지팡이': 'weapon_red_magic_staff',
  '재의 지팡이': 'icon_staff_ash',
  '가죽 갑옷':   'icon_armor_leather',
  '사슬 갑옷':   'icon_armor_chain',
  '마법사 로브': 'icon_robe_blue',
  '판금 갑옷':   'icon_armor_plate',
  '수호의 로브': 'icon_robe_teal',
  '그을린 갑옷': 'icon_armor_burnt',
  '재의 외투':   'icon_robe_ash',
  '가죽 장화':   'icon_boots_leather',
  '부적':        'icon_amulet',
  '생명의 반지': 'icon_ring_red',
  '날랜 장화':   'icon_boots_swift',
  '수정 목걸이': 'icon_amulet_crystal',
  '등불지기의 반지': 'icon_ring_ember',
  '재의 부적':   'icon_amulet_ash',
  '재의 조끼':   'icon_armor_ash',
};
for (const [name, file] of Object.entries(GEAR_ICONS)) {
  MANIFEST['gear.' + name] = [file + '.png'];
}

/* ---------- 굽기 ---------- */

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const out = {};
let bytes = 0, missing = [];

for (const [key, files] of Object.entries(MANIFEST)) {
  if (!files.length) { missing.push(key); continue; }
  const entry = { w: 0, h: 0, f: [] };
  for (const file of files) {
    const p = findFrame(file);
    if (!p) { missing.push(file); continue; }
    const buf = fs.readFileSync(p);
    const { w, h } = pngSize(buf);
    entry.w = w; entry.h = h;
    entry.f.push('data:image/png;base64,' + buf.toString('base64'));
    bytes += buf.length;
  }
  if (entry.f.length) out[key] = entry;
}

const js =
`/* =========================================================
   sprites.js — 자동 생성 파일. 직접 고치지 말 것.
   만드는 법:  node tools/pack-sprites.js
   원본: 0x72 "Dungeon Tileset II" v1.7 (CC0)
   ========================================================= */

const SPRITES = ${JSON.stringify(out)};
`;

fs.writeFileSync(OUT, js, 'utf8');

console.log(`js/sprites.js 생성 — ${Object.keys(out).length}개 항목, ` +
            `${Object.values(out).reduce((n, e) => n + e.f.length, 0)}장, ` +
            `원본 ${(bytes/1024).toFixed(0)}KB → 파일 ${(js.length/1024).toFixed(0)}KB`);
if (missing.length) console.log('찾지 못한 것:', missing.join(', '));
