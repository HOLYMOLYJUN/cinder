/* =========================================================
   build.js — 여러 파일을 아티팩트용 HTML 한 장으로 합친다.

   실행:  node build.js
   결과:  dist/jaetbul.html

   아티팩트는 파일 하나만 받고, 게시할 때 <head>·<body> 골격을
   붙여주므로 여기서는 그 태그들을 빼고 알맹이만 내보낸다.
   ========================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'jaetbul.html');

// 로드 순서가 중요하다 — index.html 의 script 순서와 같아야 한다
const JS_FILES = [
  'js/config.js',
  'js/sprites.js',
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
  'js/bosses.js',
  'js/achievements.js',
  'js/render.js',
  'js/ui.js',
  'js/net.js',
  'js/chat.js',
  'js/resume.js',
  'js/cast.js',
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

/* 아티팩트에서는 확성기를 꺼서 굽는다.
   아티팩트는 HTML 한 장이라 바깥으로 연결을 못 연다. HOST 가 박힌 채로 구우면
   붙지도 못하는 버튼이 보이고 "다시 붙는 중"만 끝없이 돈다.
   없는 기능은 없어 보이는 게 맞다 — chat.js 가 HOST 가 비면 통째로 숨긴다.
   소스(js/config.js)는 건드리지 않는다. 여기서 굽는 동안만 비운다. */
const js = JS_FILES
  .map(f => {
    let src = read(f);
    // 끝의 쉼표까지 봐야 한다 — 위 주석에 있는 예시 문장이 먼저 걸린다
    if (f === 'js/config.js') src = src.replace(/(HOST:\s*)'[^']*'(\s*,)/, "$1''$2");
    return `/* ===== ${f} ===== */\n` + src;
  })
  .join('\n\n');

// 인라인 스크립트 안에 </script> 문자열이 있으면 태그가 조기 종료된다
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const out = `<title>잿불</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;700&display=swap">

<style>
${css}
</style>

${body}

<script>
${safeJs}
</script>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`dist/jaetbul.html 생성 완료 — ${kb} KB`);
