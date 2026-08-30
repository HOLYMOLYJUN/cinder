/* =========================================================
   index.js — 잿불 방(room) 서버

   Cloudflare Workers + Durable Objects 위에서 돈다.
   방 하나 = Durable Object 인스턴스 하나이고, 방 이름이 곧 라우팅 키다.

   이 서버는 게임을 하나도 모른다. 우체통일 뿐이다 —
   받은 것을 같은 방의 나머지에게 넘기고, 최근 몇 개를 들고 있는다.
   그래서 게임 규칙을 아무리 고쳐도 여기는 재배포할 일이 없다.
   ========================================================= */

import { routePartykitRequest, Server } from 'partyserver';

/* 프로토콜 판 번호. 봉투에 실어 보내고, 다른 번호는 조용히 버린다.
   포맷을 바꿔도 열어 둔 옛날 탭이 이상하게 굴지 않는다. */
const PROTO = 1;

const MAX_FRAME = 8 * 1024;   // 프레임 하나의 상한 — 넘으면 읽지도 않는다
const MAX_TEXT  = 200;        // 한 줄 길이
const MAX_NAME  = 16;
const HISTORY   = 50;         // 방이 들고 있는 최근 줄 수

// 초당이 아니라 창(window)으로 센다 — 확성기라 연달아 치는 게 정상이다.
const RATE_WINDOW = 10000;
const RATE_MAX    = 15;

const now = () => Date.now();

/* 이름과 본문은 클라이언트가 보내는 것이므로 하나도 믿지 않는다.
   길이를 자르고, 줄바꿈과 제어문자를 공백으로 눕힌다.
   (HTML 이스케이프는 하지 않는다 — 클라이언트가 textContent 로만 그린다.
    여기서 &lt; 로 바꿔 두면 오히려 화면에 그대로 보인다.) */
function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, max);
}

export class CinderRoom extends Server {
  // 하이버네이션 — 아무도 말이 없는 동안 메모리에서 내려간다.
  // 연결은 살아 있고, 그동안은 과금도 되지 않는다.
  // 둘이서 가끔 들어오는 방에는 이 편이 상시 켜 두는 것보다 훨씬 맞다.
  static options = { hibernate: true };

  /* 하이버네이션에서 깨어날 때마다 다시 불린다.
     그래서 살아남아야 하는 것은 전부 storage 에 있어야 한다. */
  async onStart() {
    this.history = (await this.ctx.storage.get('history')) || [];
    /* 레이트 제한 기록은 메모리에만 둔다. 깨어날 때 비워지므로
       도배하는 쪽이 창을 한 번 새로 얻는데, 친구 둘이 쓰는 방에서
       그걸 막자고 storage 쓰기를 매 줄마다 늘릴 이유가 없다. */
    this.rate = new Map();
  }

  send(conn, obj) {
    try { conn.send(JSON.stringify(obj)); } catch (e) { /* 이미 닫힌 소켓 */ }
  }

  announce(without) {
    let count = 0;
    for (const c of this.getConnections()) count++;
    this.broadcast(JSON.stringify({ v: PROTO, t: 'presence', count: count }), without);
  }

  async onConnect(conn) {
    // 늦게 들어와도 방금까지의 대화가 보여야 한다.
    this.send(conn, {
      v: PROTO, t: 'hello',
      you: conn.id,
      room: this.name,
      history: this.history,
    });
    this.announce([]);
  }

  async onClose(conn) {
    if (this.rate) this.rate.delete(conn.id);
    const st = conn.state;
    if (st && st.name) {
      this.broadcast(JSON.stringify({
        v: PROTO, t: 'system', text: st.name + ' 님이 나갔습니다.', at: now(),
      }), [conn.id]);
    }
    this.announce([conn.id]);
  }

  limited(id) {
    const t = now();
    const hits = (this.rate.get(id) || []).filter(x => t - x < RATE_WINDOW);
    hits.push(t);
    this.rate.set(id, hits);
    return hits.length > RATE_MAX;
  }

  async onMessage(conn, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME) return;

    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || msg.v !== PROTO) return;

    // 클라이언트가 연결이 살아 있는지 보려고 보내는 것. 그대로 돌려준다.
    if (msg.t === 'ping') { this.send(conn, { v: PROTO, t: 'pong' }); return; }

    if (msg.t !== 'chat') return;

    if (this.limited(conn.id)) {
      this.send(conn, { v: PROTO, t: 'error', reason: 'rate' });
      return;
    }

    const name = clean(msg.name, MAX_NAME) || '누군가';
    const text = clean(msg.text, MAX_TEXT);
    if (!text) return;

    /* 이름은 연결에 붙여 둔다. setState 는 WebSocket attachment 에 실려서
       하이버네이션을 넘어 살아남는다 — 나갈 때 누가 나갔는지 말하려면 필요하다. */
    const prev = conn.state && conn.state.name;
    if (prev !== name) conn.setState({ name: name });

    const line = { v: PROTO, t: 'chat', id: conn.id, name: name, text: text, at: now() };

    this.history.push(line);
    if (this.history.length > HISTORY) this.history = this.history.slice(-HISTORY);
    await this.ctx.storage.put('history', this.history);

    this.broadcast(JSON.stringify(line));
  }
}

/* ---------- Origin 검사 ----------
   WebSocket 은 CORS 프리플라이트를 타지 않는다. 브라우저가 막아 주지 않으므로
   여기서 직접 보지 않으면 아무 사이트나 이 방에 붙을 수 있다.
   ALLOWED_ORIGINS 는 wrangler.jsonc 의 vars 에서 쉼표로 준다. */
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;                       // 브라우저가 아닌 것

  let host;
  try { host = new URL(origin).hostname; } catch (e) { return false; }

  // 로컬 개발은 언제나 연다 (wrangler dev / 로컬 정적 서버)
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;

  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return list.indexOf(origin) !== -1;
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/health') {
      return new Response('ok');
    }

    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect(req) {
        if (!originAllowed(req, env)) {
          return new Response('forbidden origin', { status: 403 });
        }
      },
    });

    return routed || new Response('Not Found', { status: 404 });
  },
};
