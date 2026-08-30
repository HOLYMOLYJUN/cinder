# Dungeon Tileset II Extended (Niji) — 잘라둔 것

0x72 Dungeon Tileset II 를 확장한 팩. **CC0**, 출처 https://nijikokun.itch.io/dungeontileset-ii-extended
버전 `dungeontiles-extended v1.1` (2022-03). 원본 시트는 `src/` 에 그대로 뒀다.

## 무엇이 들어있나

`src/`     받은 그대로 — 시트 PNG(1024x1024), Aseprite 원본, 팔레트
`frames/`  이름 붙인 새 스프라이트 60장
`cells/`   나머지 새 그림을 16px 격자 셀 그대로 자른 것 262장 (`c<열>_r<행>.png`)
`manifest.json`  이름 → 시트 좌표 [x0,y0,x1,y1]

## 우리가 이미 가진 것과의 관계

시트를 `assets/tileset/frames/` 의 370장과 픽셀 단위로 대조했다.

- **269장은 픽셀까지 동일** — 이 팩이 원본을 통째로 품고 있어서다. 우리 것을 쓰면 되므로 여기선 뺐다.
- **101장은 없다.** dwarf / lizard / doc / pumpkin_dude / slug 계열과 wall_edge_* 일부.
  이 팩의 바탕이 v1.4쯤이라 **v1.7에서 추가된 것들이 빠져 있다.** 우리 쪽이 더 최신이다.
- lizard·elf·wizzard·weapon_spear 는 구버전이라 몇 픽셀 다른 판이 시트에 있다. `cells/` 에 남아있지만
  우리 v1.7 쪽이 낫다.

즉 **여기서 건질 것은 `frames/` 60장과 `cells/` 의 장식 타일**이고, 캐릭터는 가져올 게 없다.

## frames/ 목록

| 이름 | 크기 | 비고 |
|---|---|---|
| `flame_anim_f0..f7` | 16x16 | 불꽃만. 받침 없음 |
| `torch_floor_anim_f0..f7` | 16x32 | 바닥 횃불 |
| `torch_floor_empty` | 16x32 | 불 꺼진 받침 |
| `torch_wall_anim_f0..f7` | 16x32 | 벽 횃불 |
| `torch_glow_anim_f0..f7` | 16x16 | **횃불 위 벽에 얹는 빛 무늬.** 단색(119,92,85) 디더 아치라, 횃불 바로 위 칸에 겹쳐 그리는 용도 |
| `flask_small_pink/purple/green/white` | 16x16 | 둥근 병 |
| `vial_pink/purple/green/white` | 16x16 | 긴 병 |
| `ui_heart_pink_full` / `ui_heart_pink_half` | 16x16 | 분홍 하트 (원본 빨강판과 별개) |
| `bag_brown` / `bag_brown_cross` / `bag_gold` / `bag_blue` | 16x16 | 주머니 |
| `key_small` / `key_long` | 16x16 | 열쇠 |
| `keyhole_dark` / `keyhole_light` | 16x16 | 열쇠구멍 |
| `sign_orange` / `sign_grey` / `sign_orange_2` / `sign_grey_2` | 16x16 | 표지판 |
| `sign_hanging_orange` / `sign_hanging_grey` | 16x16 | 매단 표지판 |
| `bomb_black` | 16x16 | 폭탄 |
| `door_wood_tall_1` / `door_wood_tall_2` | 32x64 | 나무문 + 아래로 이어지는 문틀 |

## 자를 때 쓴 규칙

시트는 16px 격자에 오프셋 (0,0) 으로 정렬돼 있다 (격자선 위 불투명 픽셀 수로 확인).
`frames/` 는 **격자 칸 그대로** 잘랐다 — 딱 맞게(tight) 자르면 프레임마다 위치가 달라져
불꽃 흔들림 같은 애니메이션이 망가지기 때문이다. `assets/tileset/frames/` 의 원본들이
딱 맞게 잘려 있는 것과 규칙이 다르니 갖다 쓸 때 주의.

`.ase` 에 슬라이스·태그가 없어서 이름표는 원본 370장과의 픽셀 대조 + 눈으로 확인해 붙였다.
