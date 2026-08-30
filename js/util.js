/* =========================================================
   util.js — 잡다한 도구
   ========================================================= */

function randInt(min, max) {            // min 이상 max 이하
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(p) {                    // p 확률(0~1)로 true
  return Math.random() < p;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
