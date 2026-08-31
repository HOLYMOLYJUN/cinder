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

## 403 이 뜰 때

WebSocket 이 `403` 으로 끊기면 Origin 검사에 걸린 것이다. 서버에게 직접 물어보면 된다:

```
https://cinder-party.<계정>.workers.dev/origin
```

브라우저로 열면 서버가 **무엇을 받았고 무엇을 기다리는지** 그대로 돌려준다:

```json
{ "yours": "https://...vercel.app", "allowed": ["https://..."], "verdict": "blocked" }
```

`yours` 가 `allowed` 에 없으면 `wrangler.jsonc` 를 고치고 **다시 배포**해야 한다 —
`vars` 는 배포할 때 워커에 박히는 값이라, 파일만 고치고 배포를 안 하면 아무것도 안 바뀐다.
`npx wrangler tail` 로 실시간 로그를 보면 거절된 Origin 이 그대로 찍힌다.

흔한 원인 두 가지 —
**스킴이 다르다**(버셀은 http 를 https 로 넘기므로 브라우저가 보내는 것은 언제나 https),
**배포별 고유 주소로 들어갔다**(`cinder-abc123-...vercel.app` 은 브랜치 별칭과 다른 주소다).

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
| → | `{v, t:'clear', name}` — 방의 기록을 지운다 |
| ↔ | `{v, t:'state', name, blob}` — 관전. 판 하나를 통째로 접은 것 |
| ↔ | `{v, t:'over', name, ...}` — 그 판이 끝났다 |
| ← | `{v, t:'presence', count}` |
| ← | `{v, t:'cleared', name, at}` |
| ← | `{v, t:'error', reason}` |
| ← | `{v, t:'pong'}` |

**관전은 대화와 다른 길로 간다.** 스냅샷은 `history` 에 넣지 않고 저장소에도 쓰지 않는다 —
성격도 수명도 다르고, 한 장이 채팅 오십 줄보다 크다. 마지막 한 장만 메모리에 들고 있다가
늦게 들어온 사람에게 즉시 넘겨서, 다음 턴까지 빈 화면을 보고 있지 않게 한다.
하이버네이션에서 깨면 그 한 장은 사라지지만, 그때는 다음 턴이면 새것이 온다.

**서버는 게임을 하나도 모른다.** 받은 것을 같은 방의 나머지에게 넘기고 최근 50줄을 들고 있을 뿐이다.
그래서 게임 규칙을 아무리 고쳐도 여기는 재배포할 일이 없고, 나중에 관전(`state`)이나
상태 표시(`meta`)를 얹을 때도 `t` 하나만 늘리면 된다.

## 지키는 것

- 최근 50줄까지, 그중 **12시간이 안 지난 것만** 넘긴다.
  방 이름이 곧 열쇠인데 기록이 영원히 남으면, 이름이 새는 순간 지난 대화가 통째로 딸려 나간다.
  지나간 것은 지나가게 두는 편이 낫다. `vars.HISTORY_TTL_MS` 로 바꿀 수 있다
- 방 안에 있는 사람은 누구나 기록을 지울 수 있다(`clear`). 둘이 쓰는 방에 권한 체계를 세울
  이유가 없고, **지우는 쪽은 언제나 안전한 방향**이다
- 이름 16자, 한 줄 200자, 프레임 8KB 로 자른다 — 클라이언트 검증은 믿지 않는다
- 10초에 15줄 넘으면 `error:rate` 를 돌려주고 흘린다
- 줄바꿈·제어문자는 공백으로 눕힌다
- **HTML 이스케이프는 하지 않는다.** 클라이언트가 `textContent` 로만 그리므로,
  여기서 `&lt;` 로 바꾸면 오히려 화면에 그 글자가 그대로 보인다

## 검사

```bash
npx wrangler dev          # 한쪽 창에서 띄워 두고
npm test                  # 다른 창에서 — 소켓을 여러 개 붙여 프로토콜을 그대로 시험한다
```

나이 제한까지 보려면 서버를 짧은 값으로 띄우고 같은 값을 알려준다.
12시간을 기다릴 수는 없으므로 그 숫자를 밖으로 뺐다:

```bash
npm run dev:ttl                             # HISTORY_TTL_MS=1500 으로 띄운다
HISTORY_TTL_MS=1500 npm test
```

게임 쪽까지 함께 보는 검사는 저장소 뿌리에 있다:

```bash
node ../tools/test-chat.js          # 정적 서버도 함께 필요
```
