/* =========================================================
   util.js — 잡다한 도구
   ========================================================= */

/* ---------- 난수 ----------

   이 게임의 난수는 한 군데로 모인다. 그래야 「오늘의 탑」이 가능하다 —
   지형을 만드는 동안만 난수를 씨앗 달린 것으로 바꿔치기하면
   map.js 는 한 줄도 고치지 않고 모두가 같은 탑을 오르게 된다.

   바꿔치기하는 것은 지형뿐이다. 몬스터도 전리품도 그대로 무작위다.
   「탑」은 지형이지 내용물이 아니고, 하루에 두 판째부터 전리품까지 똑같으면
   같은 판을 두 번 하는 것이 된다. 흔적이 필요로 하는 것도 지형뿐이다. */

let RAND_SRC = Math.random;

/* mulberry32 — 32비트 하나로 도는 작고 고른 난수.
   던전을 만드는 데 쓰는 것이므로 예측 가능해도 된다.
   (열쇠를 깎는 난수는 여기가 아니라 crypto 다 — chat.js 참고) */
function seededRand(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* fn 이 도는 동안만 난수를 씨앗 달린 것으로 바꾼다.
   중간에 예외가 나도 반드시 되돌린다 — 여기서 새면 그 뒤로 게임 전체가
   같은 수를 반복하게 되고, 그건 아주 찾기 어려운 버그가 된다. */
function withSeed(seed, fn) {
  const prev = RAND_SRC;
  RAND_SRC = seededRand(seed);
  try { return fn(); } finally { RAND_SRC = prev; }
}

function randInt(min, max) {            // min 이상 max 이하
  return Math.floor(RAND_SRC() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(RAND_SRC() * arr.length)];
}

function chance(p) {                    // p 확률(0~1)로 true
  return RAND_SRC() < p;
}

/* 오늘의 탑 — 오르는 사람 모두가 같은 지형을 본다.

   UTC 를 쓴다. 시간대별로 다른 탑을 주면 흔적이 국경에서 끊긴다 —
   한국에서 남긴 쪽지가 같은 시각 유럽 사람에게는 다른 지형의 좌표가 된다.
   날짜가 바뀌는 시각(한국 기준 오전 9시)이 어중간한 것보다 그게 낫다. */
function towerDay(d) {
  const t = d || new Date();
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

/* 층마다 다른 씨앗을 준다. 날짜만 쓰면 15개 층이 전부 같은 지형이 된다.
   곱하는 수는 서로 안 겹치게 벌려 두기만 하면 되므로 아무 홀수나 좋다. */
function floorSeed(depth, day) {
  return ((day || towerDay()) * 2654435761 + depth * 40503) >>> 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* '#RRGGBB' → [r, g, b].
   그라데이션을 같은 색의 투명으로 끝내려고 쓴다 — 검은 투명으로 끝내면
   가운데가 색이 아니라 그을음으로 번진다. */
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16)];
}

// 격자 거리(대각선 포함) — 시야·추격 판정에 쓴다
function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// 맞닿아 있는가 — 대각선은 치지 않는다.
// 플레이어는 네 방향으로만 때릴 수 있으므로, 몬스터에게만 대각선을 허용하면
// 때릴 수 없는 자리에서 일방적으로 맞게 된다.
function isNextTo(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

// 두 점 사이를 잇는 격자 칸들 (브레젠험). 시야와 사격 경로에 쓴다.
function lineTiles(x0, y0, x1, y1) {
  const out = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;

  for (let guard = 0; guard < 400; guard++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
  return out;
}

/* ---------- 조사 ----------
   "문지기이(가)" 처럼 쓰면 읽는 맛이 떨어진다.
   마지막 글자의 받침을 보고 골라 붙인다. */

function hasBatchim(word) {
  const s = String(word);
  const last = s[s.length - 1];

  // 숫자는 읽는 소리로 판단한다.
  // 일(ㄹ) 삼(ㅁ) 육(ㄱ) 칠(ㄹ) 팔(ㄹ) 영(ㅇ) 은 받침이 있고, 이 사 오 구 는 없다.
  if (last >= '0' && last <= '9') return '0136 78'.includes(last);

  const c = s.charCodeAt(s.length - 1);
  if (isNaN(c) || c < 0xAC00 || c > 0xD7A3) return false;   // 한글 음절이 아니면 없는 것으로
  return (c - 0xAC00) % 28 !== 0;
}

// josa('문지기', '이', '가') → '문지기가'
function josa(word, withBatchim, withoutBatchim) {
  return word + (hasBatchim(word) ? withBatchim : withoutBatchim);
}

// 저장은 이 두 함수로만 감싼다.
// 나중에 클라우드로 옮길 때 이 안쪽만 바꾸면 된다.
function saveData(data) {
  try {
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    /* 시크릿 모드 등에서 실패할 수 있다. 게임은 계속 돌아가야 한다. */
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
