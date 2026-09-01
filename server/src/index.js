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

/* =========================================================
   CinderMarks — 층에 남는 흔적 (죽은 자리 · 벽의 쪽지)

   방과 반대다. 방은 「방 하나 = 인스턴스 하나」인데, 흔적은 모두가 같은 것을
   봐야 하므로 **인스턴스 하나에 전부 모은다**(idFromName('global')).

   왜 이걸 만드는가:
     확성기와 관전은 둘 다 「동시에 두 명」이 있어야 쓸모가 생긴다.
     혼자 하는 게임에서 그런 순간은 거의 안 온다. 흔적은 비동기라
     아무도 접속해 있지 않아도 남이 지나간 자리가 내 판에 남아 있다.

   서버는 여전히 게임을 모른다. 좌표와 번호만 받아 적는다 —
   쪽지 본문조차 여기 없다. 틀 번호와 낱말 번호만 오고,
   문장으로 만드는 것은 클라이언트가 한다. 그래서 검열할 것이 아예 없다.
   ========================================================= */

/* 날짜(YYYYMMDD)를 상식선으로 자른다. 클라이언트가 주는 값이지만
   엉뚱한 날짜를 넣어 봐야 아무도 안 보는 칸 하나가 생길 뿐이라 깊이 따지지 않는다. */
function dayOf(v) {
  const n = Number(v) | 0;
  return (n >= 20200101 && n <= 21001231) ? n : 20200101;
}

const MARK_TTL     = 14 * 24 * 60 * 60 * 1000;   // 끄덕임 없는 흔적의 수명 (2주)
const MARK_PER_FLOOR = 40;                        // 한 층이 들고 있는 최대
const MARK_RATE_MS = 3000;                        // 같은 사람이 연달아 남기는 간격

export class CinderMarks extends Server {
  static options = { hibernate: true };

  async onStart() { this.rate = new Map(); }

  /* 날짜가 열쇠에 들어간다. 탑은 매일 새로 서므로 어제의 좌표는 오늘 지형에서
     아무 뜻도 없다 — 날짜를 안 섞으면 흔적이 벽 속에 박히고, 그렇게 박힌 것은
     화면에 아예 안 나오므로 「기능이 고장 났다」로 보인다. */
  key(day, floor) { return 'floor:' + day + ':' + floor; }

  async load(day, floor) {
    return (await this.ctx.storage.get(this.key(day, floor))) || [];
  }

  /* 나이가 찬 것은 내보낼 때 거른다 — 따로 청소하는 일을 만들지 않는다.
     끄덕임을 받은 쪽지는 오래 산다. 쓸모없는 것은 알아서 사라지고,
     도움이 된 것만 남는 것이 이 기능이 원하는 모습이다. */
  fresh(list) {
    const t = now();
    return list.filter(m => t - m.at < MARK_TTL * (1 + Math.min(4, m.nods || 0)));
  }

  async put(day, floor, list) {
    /* 넘치면 버린다. 끄덕임이 적고 오래된 것부터 — 층이 표지판으로 도배되면
       흔적이 아니라 배경이 되고, 그러면 아무도 안 읽는다. */
    const keep = list
      .sort((a, b) => (b.nods || 0) - (a.nods || 0) || b.at - a.at)
      .slice(0, MARK_PER_FLOOR);
    await this.ctx.storage.put(this.key(day, floor), keep);
    return keep;
  }

  limited(uid) {
    const t = now();
    const last = this.rate.get(uid) || 0;
    if (t - last < MARK_RATE_MS) return true;
    this.rate.set(uid, t);
    return false;
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/.*\/marks/, '') || '/';
    const cors = { 'Access-Control-Allow-Origin': '*' };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: Object.assign({}, cors, {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      }) });
    }

    /* 한 층에 남은 것들을 준다. 판이 층에 들어설 때 한 번만 부른다.
       /floor/<날짜>/<층> — 날짜 없이 오는 옛날 판은 그날의 탑을 모르므로 빈손으로 보낸다. */
    if (request.method === 'GET' && path.startsWith('/floor/')) {
      const parts = path.slice(7).split('/');
      if (parts.length < 2) return Response.json({ v: PROTO, marks: [] }, { headers: cors });
      const day = dayOf(parts[0]);
      const floor = Math.max(1, Math.min(99, Number(parts[1]) || 1));
      const uid = clean(url.searchParams.get('uid'), 40);
      const list = this.fresh(await this.load(day, floor));
      return Response.json({
        v: PROTO,
        marks: list.map(m => ({
          id: m.id, kind: m.kind, x: m.x, y: m.y,
          a: m.a, b: m.b,                  // 쪽지: 틀·낱말 번호
          by: m.by, killer: m.killer, turns: m.turns,
          nods: m.nods || 0,
          mine: uid && m.uid === uid,      // 내 것에는 끄덕일 수 없다
        })),
      }, { headers: cors });
    }

    /* 내 흔적이 몇 번이나 읽혔는가. 타이틀에서 한 번 부른다 —
       접속해 있지도 않은 사람과 이어져 있다는 느낌은 이 숫자 하나가 만든다. */
    if (request.method === 'GET' && path === '/nods') {
      const uid = clean(url.searchParams.get('uid'), 40);
      if (!uid) return Response.json({ v: PROTO, nods: 0 }, { headers: cors });
      const seen = (await this.ctx.storage.get('nods:' + uid)) || 0;
      return Response.json({ v: PROTO, nods: seen }, { headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404, headers: cors });
    }

    let body;
    try { body = await request.json(); } catch (e) { return new Response('bad', { status: 400, headers: cors }); }
    if (!body || body.v !== PROTO) return new Response('bad', { status: 400, headers: cors });

    const uid = clean(body.uid, 40);
    if (!uid) return new Response('bad', { status: 400, headers: cors });

    /* 끄덕임. 쓴 사람에게 쌓인다 — 다음 판을 시작할 때 알게 된다.
       다크소울에서 좋아요가 쓴 사람의 체력을 채우는 것과 같은 자리다.
       보상이 「읽혔다」가 아니라 「도움이 됐다」에 붙어야
       웃긴 글이 아니라 쓸모 있는 글을 쓰게 된다. */
    if (path === '/nod') {
      const day = dayOf(body.day);
      const floor = Math.max(1, Math.min(99, Number(body.floor) || 1));
      const list = await this.load(day, floor);
      const m = list.find(v => v.id === body.id);
      if (!m || m.kind !== 'note') return Response.json({ v: PROTO, ok: false }, { headers: cors });
      if (m.uid === uid) return Response.json({ v: PROTO, ok: false }, { headers: cors });

      m.nods = (m.nods || 0) + 1;
      m.nodders = (m.nodders || []).concat(uid).slice(-200);
      await this.put(day, floor, list);

      const had = (await this.ctx.storage.get('nods:' + m.uid)) || 0;
      await this.ctx.storage.put('nods:' + m.uid, had + 1);
      return Response.json({ v: PROTO, ok: true, nods: m.nods }, { headers: cors });
    }

    if (path !== '/add') return new Response('Not Found', { status: 404, headers: cors });
    if (this.limited(uid)) return Response.json({ v: PROTO, ok: false, reason: 'rate' }, { headers: cors });

    const kind = body.kind === 'note' ? 'note' : 'grave';
    const day = dayOf(body.day);
    const floor = Math.max(1, Math.min(99, Number(body.floor) || 1));
    const list = this.fresh(await this.load(day, floor));

    /* 좌표는 클라이언트가 준다. 서버는 지도를 모르므로 확인할 방법이 없고,
       확인할 값어치도 없다 — 엉뚱한 자리에 남겨 봐야 벽 안에 표지판이 하나 생길 뿐이다.
       범위만 상식선으로 자른다. */
    const mark = {
      id: crypto.randomUUID().slice(0, 8),
      uid: uid,
      kind: kind,
      x: Math.max(0, Math.min(999, Number(body.x) | 0)),
      y: Math.max(0, Math.min(999, Number(body.y) | 0)),
      by: clean(body.by, MAX_NAME) || '누군가',
      at: now(),
      nods: 0,
    };

    if (kind === 'note') {
      /* 본문이 아니라 번호만 받는다. 클라이언트가 아무 문자열이나 보내도
         여기 저장되지 않으므로, 욕설도 광고도 스포일러도 들어올 자리가 없다. */
      mark.a = Math.max(0, Math.min(31, Number(body.a) | 0));
      mark.b = Math.max(0, Math.min(31, Number(body.b) | 0));
      // 한 사람이 한 층에 하나만
      const i = list.findIndex(m => m.uid === uid && m.kind === 'note');
      if (i >= 0) list.splice(i, 1);
    } else {
      mark.killer = clean(body.killer, 24);
      mark.turns  = Math.max(0, Math.min(999999, Number(body.turns) | 0));
    }

    list.push(mark);
    await this.put(day, floor, list);
    return Response.json({ v: PROTO, ok: true, id: mark.id }, { headers: cors });
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

  /* 로컬 개발은 언제나 연다 (wrangler dev / 로컬 정적 서버).

     ⚠️ 이 줄은 편의가 아니라 **안드로이드 앱이 붙는 유일한 길**이기도 하다.
     Capacitor 웹뷰는 https://localhost 에서 뜨므로 앱에서 온 요청은 전부
     여기로 들어온다. 조이려면 앱이 함께 죽는다는 것을 알고 조여야 한다.
     (앱은 확성기가 꺼져 있어서 소켓은 안 열고 흔적만 이 길로 온다) */
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

    /* 흔적. 방과 달리 인스턴스가 하나뿐이라 여기서 직접 넘긴다
       (routePartykitRequest 는 URL 에서 방 이름을 읽는데, 여기는 방이 없다).
       WebSocket 이 아니라 평범한 요청이므로 CORS 프리플라이트를 타지만,
       Origin 검사는 그것과 별개로 여기서도 한다. */
    if (path.startsWith('/marks')) {
      if (request.method !== 'OPTIONS' && !originAllowed(request, env)) {
        return new Response('forbidden origin: ' + request.headers.get('Origin'), {
          status: 403, headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      const id = env.CinderMarks.idFromName('global');
      return env.CinderMarks.get(id).fetch(request);
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
