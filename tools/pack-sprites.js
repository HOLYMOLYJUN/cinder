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
/* 하수도 팩 (0x72 Sewers v0.3, CC0 · 유료로 받은 것).
   원본은 아틀라스라 그대로는 못 쓴다 — tools/slice-atlas.js 가 쓸 칸만 낱장으로 뽑아
   여기에 둔다. 그러니 이 폴더는 '자동 생성'이고, 고칠 곳은 slice-atlas.js 쪽이다. */
const FRAMES_SEWERS = path.join(ROOT, 'assets', 'tileset-sewers', 'frames');
// 따라오는 것들 (Basic Asset Pack). 가로 한 줄 시트라 slice-atlas.js 가 네 장으로 뗀다.
const FRAMES_PETS = path.join(ROOT, 'assets', 'animals', 'frames');
/* NPC 팩 (Fantasy RPG NPCs). 32x32 캔버스 가운데 몸이 서 있는 그림이라
   tools/cut-npc.js 가 여백을 잘라 여기 둔다 — 자동 생성이고 고칠 곳은 그쪽이다. */
const FRAMES_NPC = path.join(ROOT, 'assets', 'npc', 'cut');

// 같은 이름이면 원본(v1.7)이 이긴다 — 확장 팩 쪽이 구버전이라 몇 픽셀 다르다.
function findFrame(file) {
  for (const dir of [FRAMES, FRAMES_EXT, ICONS, FRAMES_CUSTOM, FRAMES_SEWERS, FRAMES_PETS, FRAMES_NPC]) {
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
  // 상인과 대장장이 — 둘 다 안식처에 선다. 한눈에 갈려야 해서 그림을 멀리 잡았다
  merchant:    'dwarf_m',
  /* 오래 여기사(knight_f)가 서 있었다 — 팩에 대장장이가 없어서였다.
     NPC 팩이 생기면서 진짜 대장장이로 갈았다 (tools/cut-npc.js 가 잘라 둔 것). */
  smith:       'blacksmith',
  // 되짚기의 「첫 번째 이름」 — 왜 연금술사인지는 tools/cut-npc.js 참고
  child:       'child',
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
  /* 다음 층으로 나가는 자리. 층에 따라 갈린다.

     하수도 팩 것이 제일 「위로 난 것」처럼 보이는데, 은빛 쇠라 돌 층의
     갈색 바닥 위에서는 혼자 튄다. 그래서 아래층은 팩 원래 것을 그대로 두고
     11층부터만 쇠 사다리로 바꾼다 — 바닥이 초록 쇠로 바뀌는 층이라 거기서는 맞는다.

     (더 나은 그림이 생기면 여기 두 줄만 갈아 끼우면 된다) */
  'stairs':        one('floor_ladder'),
  'sewer.stairs':  one('sewer_stairs'),
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
  // 물약 주머니 — 팩에 자루 그림이 없어 make-icons.js 가 같은 격자로 그린 것을 쓴다
  'pouch':      one('icon_pouch'),
  'potionIcon': one('flask_big_red'),

  /* 화살 — 활이 쏘는 투사체. 그림은 위를 보고 있고, 그리는 쪽에서 돌린다 */
  'arrow':      one('weapon_arrow'),

  /* 남이 지나간 자리 (js/marks.js).
     해골은 쓰러진 자리, 표지판은 벽에 긁어 둔 말.
     둘 다 팩에 있던 것이라 새로 그린 것이 없다. */
  'markGrave':  one('skull'),
  'markNote':   one('sign_grey'),
  'markMine':   one('sign_orange'),   // 내가 남긴 것은 색으로 갈린다

  /* 하수도 — 11층부터 쓰는 두 번째 바이옴.
     키 이름을 'sewer.<원래 키>' 로 맞춰 둔다. Render.biomeKey 가 앞에 'sewer.' 를
     붙여 보고 없으면 원래 키로 돌아가므로, 여기 있는 것만 갈아 끼워지고
     나머지(계단·상자·모닥불)는 손댈 것 없이 그대로 쓰인다. */
  'sewer.floor':    ['sewer_floor_0.png','sewer_floor_1.png','sewer_floor_2.png','sewer_floor_3.png',
                     'sewer_floor_4.png','sewer_floor_5.png','sewer_floor_6.png','sewer_floor_7.png'],
  'sewer.wallFace': one('sewer_wall_mid'),
  'sewer.wallTop':  one('sewer_wall_top'),

  /* 장식. map.props 의 kind 앞에 'prop.' 을 붙인 것이 키다 (Render.propKey).
     폭포만 여러 장이라 따로 두고, 나머지는 한 장씩. */
  'sewerFall': ['sewer_fall_0.png', 'sewer_fall_1.png', 'sewer_fall_2.png'],

  /* 따라오는 것 — 네 장짜리 대기 애니메이션 (js/pets.js 의 id 와 열쇠가 맞아야 한다) */
  'pet.cat': ['pet_cat_0.png', 'pet_cat_1.png', 'pet_cat_2.png', 'pet_cat_3.png'],
  'pet.dog': ['pet_dog_0.png', 'pet_dog_1.png', 'pet_dog_2.png', 'pet_dog_3.png'],
});

for (const p of ['sewer_vent', 'sewer_pipe', 'sewer_barrel2', 'sewer_web',
                 'sewer_jar_a', 'sewer_jar_b', 'sewer_barrel',
                 'sewer_moss_a', 'sewer_moss_b', 'sewer_grate', 'sewer_hole']) {
  MANIFEST['prop.' + p] = [p + '.png'];
}

/* 장비 아이콘.
   무기는 팩에 그림이 있다. 방어구와 장신구는 어느 팩에도 없어서
   tools/make-icons.js 가 같은 16px 격자·같은 팔레트로 그려 assets/icons/ 에 둔다. */
const GEAR_ICONS = {
  // 단검
  '낡은 단검':   'weapon_knife',
  '사냥칼':      'weapon_machete',
  '불씨 단검':   'weapon_red_gem_sword',
  // 검
  '짧은 검':     'weapon_regular_sword',
  '카타나':      'weapon_katana',
  '대검':        'weapon_knight_sword',
  '불씨 검':     'weapon_lavish_sword',
  // 창
  '긴 창':       'weapon_spear',
  // 도끼·망치
  '손도끼':      'weapon_throwing_axe',
  '전투 도끼':   'weapon_axe',
  '쇠망치':      'weapon_hammer',
  '재의 도끼':   'weapon_waraxe',
  '사냥 활':     'weapon_bow',
  '긴 활':       'weapon_bow_2',
  '재의 활':     'icon_bow_ash',
  '낡은 지팡이': 'weapon_green_magic_staff',
  '나무 지팡이': 'weapon_baton_with_spikes',
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
