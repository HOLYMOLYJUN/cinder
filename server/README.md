# 방(room) 서버

친구와 같은 방에서 한 줄씩 주고받는 것. Cloudflare Workers + Durable Objects 위에서 돈다.

게임은 지금처럼 정적 호스팅(버셀 등)에 그대로 두고, **이것만 따로 올린다.**
버셀 함수는 요청-응답 수명이라 상시 연결이 붙지 않기 때문이다.

## 왜 Durable Objects 인가

- **방 하나 = 인스턴스 하나.** 방 이름이 곧 라우팅 키가 되어서, 접속 코드를 그대로 주소로 쓸 수 있다.
- **하이버네이션.** 아무도 말이 없는 동안 메모리에서 내려가고 그동안은 과금되지 않는다.
  연결은 살아 있으므로 다시 붙는 시간도 없다. "둘이 가끔 들어와서 떠드는 방"에 이만큼 맞는 모델이 없다.

`partyserver` 는 이 위에 룸 개념과 브로드캐스트를 얹어 주는 라이브러리다.
(호스팅 서비스이던 PartyKit 이 이 라이브러리로 재편됐다. `npx partykit deploy` 로
partykit.io 에 올리는 옛날 방식이 아니라, **자기 Cloudflare 계정에 직접** 올린다.)

## 올리는 법

Cloudflare 계정이 필요하다. **무료 플랜이면 되고 카드도 필요 없다.**

```bash
cd server
npm install
npx wrangler login        # 브라우저가 열린다 → 승인
npx wrangler deploy
```

끝나면 주소가 찍힌다:

```
https://cinder-party.<계정>.workers.dev
```

이 주소를 **게임 쪽 `js/config.js` 의 `NET.HOST`** 에 적으면 그때부터 확성기가 켜진다.
비워 두면 채팅 기능 자체가 없는 것처럼 동작한다 (그게 기본값이다).

## 배포한 뒤 반드시 할 것 — Origin 잠그기

WebSocket 은 CORS 프리플라이트를 타지 않는다. **브라우저가 막아 주지 않으므로**
서버가 직접 보지 않으면 아무 사이트나 이 방에 붙을 수 있다.

`wrangler.jsonc` 의 `vars.ALLOWED_ORIGINS` 에 게임이 올라간 주소를 쉼표로 적고 다시 배포한다:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://cinder.vercel.app,https://cinder-git-main-you.vercel.app"
}
```

`localhost` 와 `127.0.0.1` 은 언제나 허용되므로 개발 중에는 비워 둬도 된다.
버셀은 미리보기 배포마다 주소가 달라지므로, 그쪽에서도 쓰려면 그 주소도 넣어야 한다.

## 로컬에서 돌리기

로그인 없이 된다. Durable Objects 도 그대로 흉내 낸다.

```bash
npx wrangler dev          # http://127.0.0.1:8787
```

## 무료 플랜에서 걸리는 것 하나

`migrations` 는 `new_classes` 가 아니라 **`new_sqlite_classes`** 여야 한다.
무료 플랜에서는 SQLite 백엔드 DO 만 쓸 수 있어서, 옛날 글을 따라 `new_classes` 로
적으면 배포가 거절된다. 이미 그렇게 적어 두었으니 건드리지만 않으면 된다.

한도는 하루 10만 요청 / 313,000 GB-초다. 턴제 게임을 둘이서 하는 양으로는 근처도 못 간다.

## 프로토콜

봉투에 `v`(판 번호)와 `t`(종류)를 싣는다. `v` 가 다르면 조용히 버린다 —
포맷을 바꿔도 열어 둔 옛날 탭이 이상하게 굴지 않는다.

| 방향 | 봉투 |
|---|---|
| → | `{v, t:'chat', name, text}` |
| → | `{v, t:'ping'}` |
| ← | `{v, t:'hello', you, room, history}` — 늦게 들어와도 방금까지의 대화를 받는다 |
| ← | `{v, t:'chat', id, name, text, at}` |
| ← | `{v, t:'system', text, at}` |
| ← | `{v, t:'presence', count}` |
| ← | `{v, t:'error', reason}` |
| ← | `{v, t:'pong'}` |

**서버는 게임을 하나도 모른다.** 받은 것을 같은 방의 나머지에게 넘기고 최근 50줄을 들고 있을 뿐이다.
그래서 게임 규칙을 아무리 고쳐도 여기는 재배포할 일이 없고, 나중에 관전(`state`)이나
상태 표시(`meta`)를 얹을 때도 `t` 하나만 늘리면 된다.

## 지키는 것

- 이름 16자, 한 줄 200자, 프레임 8KB 로 자른다 — 클라이언트 검증은 믿지 않는다
- 10초에 15줄 넘으면 `error:rate` 를 돌려주고 흘린다
- 줄바꿈·제어문자는 공백으로 눕힌다
- **HTML 이스케이프는 하지 않는다.** 클라이언트가 `textContent` 로만 그리므로,
  여기서 `&lt;` 로 바꾸면 오히려 화면에 그 글자가 그대로 보인다

## 검사

```bash
npx wrangler dev                    # 한쪽 창에서 띄워 두고
node ../tools/test-chat.js          # 다른 창에서 (정적 서버도 함께 필요)
```
