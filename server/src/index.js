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

/* 프레임 하나의 상한. 채팅 한 줄에는 넘치게 크지만 관전 스냅샷이 이 길로 온다 —
   15층 한복판의 판 전체가 4KB 남짓이라 여유를 두었다. */
const MAX_FRAME = 64 * 1024;
const MAX_TEXT  = 200;        // 한 줄 길이
const MAX_NAME  = 16;
const HISTORY   = 50;         // 방이 들고 있는 최근 줄 수

/* 들고 있는 줄에 나이 제한을 둔다. 방 이름이 곧 열쇠인데 기록이 영원히 남으면,
   어쩌다 이름이 새는 순간 지난 대화가 통째로 딸려 나간다.
   지나간 것은 그냥 지나가게 두는 편이 낫다.
   wrangler.jsonc 의 vars 로 바꿀 수 있다 (검사에서 짧게 줄여 쓴다). */
const HISTORY_TTL = 12 * 60 * 60 * 1000;   // 12시간

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

  ttl() {
    const v = Number(this.env && this.env.HISTORY_TTL_MS);
    return v > 0 ? v : HISTORY_TTL;
  }

  /* 아직 나이가 안 찬 줄만. 저장된 것을 지우는 것이 아니라 내보낼 때 거른다 —
     쓰기는 말할 때만 일어나면 되고, 오래된 줄은 다음 쓰기에서 함께 떨어져 나간다. */
  fresh() {
    const cut = now() - this.ttl();
    return (this.history || []).filter(l => l.at > cut);
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
      history: this.fresh(),
    });
    // 보던 판이 있으면 한 장 먼저 준다. 다음 턴까지 빈 화면으로 두지 않는다.
    if (this.lastState) { try { conn.send(this.lastState); } catch (e) {} }
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

    /* ---------- 관전 ----------
       서버는 판이 무엇인지 모른다. 받은 것을 그대로 넘기고 마지막 한 장만 들고 있는다.
       늦게 들어온 사람이 다음 턴까지 빈 화면을 보고 있지 않도록.

       대화 기록(history)에는 절대 넣지 않는다 — 성격도 수명도 다르고,
       스냅샷 하나가 채팅 오십 줄보다 크다. 저장소에도 쓰지 않는다.
       하이버네이션에서 깨면 사라지지만, 그때는 다음 턴이면 새것이 온다. */
    if (msg.t === 'state' || msg.t === 'over') {
      /* 채팅의 레이트 제한을 그대로 씌우면 안 된다 — 스냅샷은 매 턴 나가는 것이라
         10초에 15장이면 금방 걸린다. 대신 바닥만 깔아 둔다.
         보내는 쪽이 이미 조이고 있으므로(250ms), 이건 고장이나 장난을 막는 선이다. */
      if (msg.t === 'state') {
        const gap = now() - (this.lastCast || 0);
        if (gap < 100) return;
        this.lastCast = now();
      }
      const out = JSON.stringify(Object.assign({}, msg, {
        id: conn.id,
        name: clean(msg.name, MAX_NAME) || '누군가',
      }));
      if (msg.t === 'state') this.lastState = out;
      else this.lastState = null;          // 판이 끝났으면 들고 있을 이유가 없다
      this.broadcast(out, [conn.id]);
      return;
    }

    if (msg.t !== 'chat' && msg.t !== 'clear') return;

    if (this.limited(conn.id)) {
      this.send(conn, { v: PROTO, t: 'error', reason: 'rate' });
      return;
    }

    /* 방을 비운다. 방 안에 있는 사람이면 누구나 할 수 있다 —
       둘이 쓰는 방에 권한 체계를 세울 이유가 없고, 지우는 쪽이 언제나 안전한 방향이다. */
    if (msg.t === 'clear') {
      this.history = [];
      await this.ctx.storage.delete('history');
      const who = clean(msg.name, MAX_NAME) || '누군가';
      this.broadcast(JSON.stringify({ v: PROTO, t: 'cleared', name: who, at: now() }));
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

    // 나이 지난 줄은 여기서 함께 떨어져 나간다. 따로 청소하는 일을 만들지 않는다.
    this.history = this.fresh().concat(line).slice(-HISTORY);
    await this.ctx.storage.put('history', this.history);

    this.broadcast(JSON.stringify(line));
  }
}

/* ---------- Origin 검사 ----------
   WebSocket 은 CORS 프리플라이트를 타지 않는다. 브라우저가 막아 주지 않으므로
   여기서 직접 보지 않으면 아무 사이트나 이 방에 붙을 수 있다.
   ALLOWED_ORIGINS 는 wrangler.jsonc 의 vars 에서 쉼표로 준다. */
function allowList(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;                       // 브라우저가 아닌 것

  let host;
  try { host = new URL(origin).hostname; } catch (e) { return false; }

  // 로컬 개발은 언제나 연다 (wrangler dev / 로컬 정적 서버)
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;

  return allowList(env).indexOf(origin) !== -1;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    if (path === '/health') return new Response('ok');

    /* 지금 무엇을 허용하고 있는지 눈으로 보려고 둔 창구.
       비밀이 아니다 — 허용목록은 어차피 브라우저가 시험해 볼 수 있는 값이고,
       403 이 뜰 때 "내 Origin 이 뭐고 서버는 뭘 기다리나"를 한 번에 봐야
       고칠 수 있다. 여기서 막히면 대개 주소 한 글자 차이다. */
    if (path === '/origin') {
      return Response.json({
        yours: request.headers.get('Origin'),
        allowed: allowList(env),
        verdict: originAllowed(request, env) ? 'allowed' : 'blocked',
      }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect(req) {
        if (!originAllowed(req, env)) {
          const got = req.headers.get('Origin');
          // wrangler tail 로 실시간으로 보인다
          console.warn('거절한 Origin:', got, '| 허용목록:', allowList(env));
          return new Response('forbidden origin: ' + got, { status: 403 });
        }
      },
    });

    return routed || new Response('Not Found', { status: 404 });
  },
};
