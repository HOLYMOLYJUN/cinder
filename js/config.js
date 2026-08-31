/* =========================================================
   config.js — 상수와 설정 테이블
   숫자를 만지고 싶으면 대부분 이 파일만 열면 된다.
   ========================================================= */

const CFG = {
  TILE: 28,               // 타일 한 변(px)
  // 화면에 보이는 타일 수. 폭이 좁은 기기에서는 줄여서 타일을 키운다
  // (캔버스가 컨테이너 폭에 맞춰 늘어나므로, 타일 수가 적을수록 크게 보인다)
  VIEW_W: 28,
  VIEW_H: 18,
  VIEW_W_NARROW: 15,
  VIEW_H_NARROW: 11,
  NARROW_AT: 760,         // 이 폭 미만이면 좁은 화면으로 본다

  ENERGY_COST: 100,       // 한 번 행동하는 데 드는 에너지
  BASE_SPEED: 10,         // 기준 속도 = 10틱에 한 번 행동

  FOV_RADIUS: 7,          // 불씨가 닿는 반경
  MONSTER_SIGHT: 8,       // 몬스터가 플레이어를 알아채는 거리

  TOP_FLOOR: 15,
  THROW_FLOOR: 3,          // 「던지던 손」을 확정으로 주는 층
  REST_FLOORS: [3, 6, 9, 12],
  BOSS_FLOORS: [5, 10],

  MOVE_ANIM: 0.10,        // 칸 사이 미끄러지는 시간(초)
  BUMP_ANIM: 0.16,        // 공격 시 튀어나갔다 오는 시간(초)
  FLASH_TIME: 0.18,       // 피격 번쩍임 지속(초)

  SAVE_KEY: 'jaetbul.save.v1',
};

/* ---------- 방(room) 서버 ----------
   친구와 같은 방에 들어가 주고받는 것. 게임 규칙과는 아무 상관이 없다.

   HOST 가 비어 있으면 채팅이 통째로 꺼진다 — 그리고 그게 기본값이다.
   index.html 을 더블클릭해서 열었을 때(file://)도, 아티팩트 한 장으로
   구웠을 때도 네트워크는 어차피 막혀 있다. 꺼진 채로 게임이 멀쩡한 것이
   정상 동작이지 예외가 아니다.

   배포한 뒤 여기에 워커 주소를 적으면 그때부터 켜진다:
     HOST: 'https://cinder-party.<계정>.workers.dev'                     */

const NET = {
  HOST:  'https://cinder-party.vlck1111.workers.dev',
  PARTY: 'cinder-room',      // wrangler.jsonc 의 바인딩 이름을 kebab-case 로
  PROTO: 1,                  // 프로토콜 판 번호 — 서버와 같아야 한다

  MAX_TEXT: 200,             // 한 줄 길이 (서버도 같은 값으로 자른다)
  MAX_NAME: 16,

  PING_MS:  25000,           // 이 간격으로 한 마디 보내 연결을 살려 둔다
  DEAD_MS:  60000,           // 이만큼 아무것도 안 오면 죽은 것으로 보고 다시 붙는다
  RETRY_BASE: 800,           // 재시도 간격의 시작
  RETRY_MAX: 15000,          // 그 상한

  KEY: 'jaetbul.chat.v1',    // 방 이름과 별명을 담는 칸.
                             // 기억(save)·이어하기(run)와 수명이 다르므로 따로 둔다
};

/* ---------- 타일 ---------- */

const T = { WALL: 0, FLOOR: 1, STAIRS: 2, CAMP: 3, SHOP: 4, DOOR: 5 };

/* ---------- 색 (스프라이트 붙이기 전 임시 표현) ---------- */

/* 불빛이 닿는 곳은 따뜻하게, 기억으로만 남은 곳은 차갑게 —
   색온도만으로 "지금 보이는 것"과 "기억하는 것"이 구분된다. */
const COLORS = {
  unseen:      '#070605',
  wallLit:     '#4B3B2C',
  wallTop:     'rgba(240,170,100,.16)',
  wallDim:     '#1C1F26',
  floorLit:    '#241B14',
  floorDim:    '#0D0F14',
  floorGrid:   'rgba(0,0,0,.32)',
  stairs:      '#E9954A',
  camp:        '#E86A3A',
  shop:        '#C9A227',
  door:        '#B98A3C',
  key:         '#F0C24A',
  gold:        '#D9B04E',
  potion:      '#5FA9C4',
  player:      '#F0E2CE',
  ember:       '#E9954A',
  damage:      '#E86152',
  heal:        '#8FBF7F',
  cast:        '#9B7BD4',
};

/* ---------- 입력 매핑 ----------
   반드시 event.code 를 쓴다. event.key 를 쓰면 한글 입력 상태에서
   Z 가 'ㅋ' 으로 들어와 조작이 통째로 먹통이 된다.                */

const KEY_DIR = {
  ArrowUp: 'up',    KeyW: 'up',
  ArrowDown: 'down',  KeyS: 'down',
  ArrowLeft: 'left',  KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

// 방향키와 함께 눌러 의도를 바꾸는 키
const KEY_MOD = {
  KeyZ: 'ranged', KeyJ: 'ranged',   // 원거리 — 아직 기억나지 않음
  KeyX: 'pass',   KeyK: 'pass',     // 공격하지 않고 이동
};

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
  right: { dx: 1,  dy: 0  },
};

/* ---------- 층 서사 문장 ---------- */

const FLOOR_LINES = {
  1:  '문이 등 뒤에서 닫힙니다.',
  2:  '어둠 속에서 무언가가 당신을 세고 있습니다.',
  3:  '공기가 무거워집니다. 숨을 쉴 때마다 재의 맛이 납니다.',
  4:  '벽에 이름들이 긁혀 있습니다. 아직 읽을 수 없습니다.',
  5:  '그것은 당신을 보고 물러서지 않았습니다.\n기다리고 있었던 것처럼.',
  6:  '불이 이미 피워져 있습니다. 누가 피운 걸까요.',
  7:  '당신의 이름을 부르는 소리.\n목소리가 당신의 것입니다.',
  8:  '벽의 이름들이 읽히기 시작합니다.',
  9:  '그중 하나는 당신의 글씨입니다.',
  10: '그것은 이름을 가지고 있었습니다.\n당신이 붙인 이름입니다.',
  11: '계단이 익숙합니다.',
  12: '여기서 몇 번이나 돌아섰습니까.',
  13: '재가 발목까지 쌓여 있습니다.',
  14: '계단이 하나뿐입니다.',
  15: '꺼진 불 앞에, 당신이 앉아 있습니다.',
};

/* ---------- 층 속성 ----------
   진입 문장이 그 층의 성격을 흘린다. 분위기 글이 곧 경고문이 된다. */

const FLOOR_TAGS = [
  { id: 'dense',    hint: '발소리가 여럿입니다.',        monsterMul: 1.6, fovAdd: 0 },
  { id: 'dark',     hint: '불씨가 자꾸 꺼지려 합니다.',  monsterMul: 1.0, fovAdd: -3 },
  { id: 'treasure', hint: '쇠붙이 냄새가 납니다.',        monsterMul: 1.0, fovAdd: 0, goldMul: 2.2 },
  { id: 'quiet',    hint: '너무 조용합니다.',            monsterMul: 0.6, fovAdd: 1 },
  { id: null,       hint: '',                            monsterMul: 1.0, fovAdd: 0 },
  { id: null,       hint: '',                            monsterMul: 1.0, fovAdd: 0 },
];
