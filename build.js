/* =========================================================
   build.js — 여러 파일을 아티팩트용 HTML 한 장으로 합친다.

   실행:  node build.js
   결과:  dist/jaetbul.html

   아티팩트는 파일 하나만 받고, 게시할 때 <head>·<body> 골격을
   붙여주므로 여기서는 그 태그들을 빼고 알맹이만 내보낸다.
   ========================================================= */

const fs = require('fs');
const path = require('path');

/* 두 가지를 굽는다. 게임 코드는 한 벌이고 스위치만 다르다.

     node build.js          아티팩트  → dist/jaetbul.html   (알맹이만, 네트워크 전부 꺼짐)
     node build.js --app    안드로이드 → dist/app/index.html (문서 한 장, 흔적만 켜짐)

   아티팩트는 <head>·<body> 를 게시하는 쪽이 붙여 주므로 알맹이만 내보내지만,
   앱은 웹뷰가 그냥 파일을 여는 것이라 온전한 문서여야 한다. */
const APP = process.argv.includes('--app');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, APP ? 'dist/app' : 'dist');
const OUT = path.join(OUT_DIR, APP ? 'index.html' : 'jaetbul.html');

// 로드 순서가 중요하다 — index.html 의 script 순서와 같아야 한다
const JS_FILES = [
  'js/config.js',
  'js/sprites.js',
  'js/bagslots.js',
  'js/util.js',
  'js/sound.js',
  'js/map.js',
  'js/fov.js',
  'js/actors.js',
  'js/heroes.js',
  'js/levels.js',
  'js/items.js',
  'js/memories.js',
  'js/pets.js',
  'js/story.js',
  'js/marks.js',
  'js/bosses.js',
  'js/achievements.js',
  'js/render.js',
  'js/ui.js',
  'js/net.js',
  'js/chat.js',
  'js/resume.js',
  'js/cast.js',
  'js/shell.js',
  'js/game.js',
];

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');
const css = read('style.css');

// index.html 의 <body> 안쪽만 꺼낸다
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) {
  console.error('index.html 에서 <body> 를 찾지 못했습니다.');
  process.exit(1);
}

// 원본의 <script src="..."> 줄들은 지우고 아래에서 통째로 인라인한다
const body = bodyMatch[1]
  .replace(/<script\s+src=["'][^"']+["']><\/script>\s*/gi, '')
  .trim();

/* 소스(js/config.js)는 건드리지 않는다. 굽는 동안만 값을 갈아 끼운다.

   아티팩트 — HOST 를 비운다. HTML 한 장이라 바깥으로 연결을 못 여는데
   주소가 박혀 있으면 붙지도 못하는 버튼이 보이고 "다시 붙는 중"만 끝없이 돈다.
   없는 기능은 없어 보이는 게 맞다.

   앱 — HOST 는 두고 CHAT 만 끈다. 흔적은 살리고 확성기·관전만 뺀다.
   사람이 쓴 글이 남의 화면에 뜨면 스토어가 신고·차단 기능을 요구하는데,
   흔적은 서버에 번호만 보내므로 그 요구를 애초에 안 받는다.
   덤으로 별명을 넣을 자리가 사라져서 흔적에 붙는 이름도 「누군가」가 된다.

   둘 다 끝의 쉼표까지 봐야 한다 — 바로 위 주석에 있는 예시 문장이 먼저 걸린다. */
function tweakConfig(src) {
  return APP
    ? src.replace(/(CHAT:\s*)true(\s*,)/, '$1false$2')
    : src.replace(/(HOST:\s*)'[^']*'(\s*,)/, "$1''$2");
}

const js = JS_FILES
  .map(f => {
    const src = f === 'js/config.js' ? tweakConfig(read(f)) : read(f);
    return `/* ===== ${f} ===== */\n` + src;
  })
  .join('\n\n');

// 인라인 스크립트 안에 </script> 문자열이 있으면 태그가 조기 종료된다
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;700&display=swap">`;

const inner = `<style>
${css}
</style>

${body}

<script>
${safeJs}
</script>
`;

/* 앱은 온전한 문서로 내보낸다.

   viewport-fit=cover 가 있어야 노치·둥근 모서리 아래까지 화면을 쓰고,
   그때부터 CSS 의 env(safe-area-inset-*) 에 실제 값이 들어온다.
   이게 없으면 위쪽 띠가 상태바에 깔린다.

   글꼴은 그대로 인터넷에서 받는다. 한글 웹폰트는 몇 MB 라 앱에 넣으면
   설치 용량이 게임 본체보다 커진다. 못 받으면 기기 글꼴로 떨어질 뿐
   게임은 그대로 돈다 — 그림과 소리는 이미 안에 들어 있다. */
const out = APP
  ? `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>잿불</title>
${FONTS}
</head>
<body>
${inner}</body>
</html>
`
  : `<title>잿불</title>
${FONTS}

${inner}`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
const where = path.relative(ROOT, OUT).replace(/\\/g, '/');
console.log(`${where} 생성 완료 — ${kb} KB` + (APP ? '  (확성기 꺼짐 · 흔적 켜짐)' : ''));
