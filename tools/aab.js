/* =========================================================
   aab.js — 스토어에 올릴 묶음(AAB)을 만든다

   실행:  npm run app:aab

   하는 일은 셋이다:
     1. dist/app/index.html 을 굽고 android/ 로 옮긴다 (build.js --app + cap sync)
     2. gradlew bundleRelease
     3. 나온 자리와 **서명이 붙었는지**를 알려준다

   ---- 왜 gradlew 를 그냥 부르지 않는가 ----

   Capacitor 8 의 capacitor-android 는 자바 21로 컴파일된다. 이 기계의
   JAVA_HOME 은 17이라 그냥 부르면 이렇게 죽는다:

     error: invalid source release: 21

   안드로이드 스튜디오는 자기가 품은 JBR(21 이상)로 빌드하므로 스튜디오에서는
   멀쩡하다 — 그래서 **명령줄에서만** 터지고, 하필 올리기 직전에 터진다.

   고치는 길이 몇 갈래인데 전부 마음에 안 든다:
     · gradle.properties 에 org.gradle.java.home 을 박는다
       → 그 경로는 이 기계에만 있다. 저장소에 넣으면 남의 기계에서 깨진다
     · ~/.gradle/gradle.properties 에 박는다
       → 저장소 바깥은 안 건드리는 편이 낫다. 다른 프로젝트까지 이 JDK 를 쓴다
     · 부를 때마다 JAVA_HOME 을 손으로 준다
       → 한 번은 되고 다음 달에는 잊는다

   그래서 **여기서 찾는다.** 지금 자바가 21 이상이면 그대로 쓰고, 아니면
   안드로이드 스튜디오가 품은 것을 찾아 이 명령에만 씌운다. 저장소에는 경로가
   한 줄도 안 들어가고, 바깥 설정도 안 건드린다.
   ========================================================= */

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const NEED = 21;                       // capacitor-android 가 요구하는 자바

/* 이 JDK 가 몇인가. `java -version` 은 stderr 로 나온다 (오래된 관례다). */
function versionOf(javaHome) {
  const bin = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!fs.existsSync(bin)) return 0;
  try {
    const out = execFileSync(bin, ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
              + spawnSync(bin, ['-version'], { encoding: 'utf8' }).stderr;
    const m = out.match(/version "(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch (e) {
    const m = String(e.stderr || '').match(/version "(\d+)/);
    return m ? Number(m[1]) : 0;
  }
}

/* 안드로이드 스튜디오가 품은 JBR. 자리는 운영체제마다 다르다.
   새 자리가 생기면 여기 한 줄을 더한다 — 못 찾아도 아래에서 말로 알려주므로
   막히지는 않는다. */
function studioJbr() {
  const home = os.homedir();
  const spots = process.platform === 'win32' ? [
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Android/Android Studio Preview/jbr',
    path.join(home, 'AppData/Local/Programs/Android Studio/jbr'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    path.join(home, 'Applications/Android Studio.app/Contents/jbr/Contents/Home'),
  ] : [
    '/opt/android-studio/jbr',
    path.join(home, 'android-studio/jbr'),
  ];
  return spots.filter(fs.existsSync);
}

function pickJava() {
  const cur = process.env.JAVA_HOME;
  if (cur && versionOf(cur) >= NEED) return { home: cur, why: 'JAVA_HOME 그대로' };
  for (const p of studioJbr()) {
    const v = versionOf(p);
    if (v >= NEED) return { home: p, why: `안드로이드 스튜디오의 JDK ${v}` };
  }
  return null;
}

/* shell 은 필요할 때만 쓴다. 윈도우에서 .bat 은 셸을 거쳐야 돌지만,
   셸을 켜면 인자를 따옴표로 안 감싸므로 «C:\Program Files\nodejs\node.exe» 처럼
   빈칸이 든 경로가 통째로 쪼개진다 — 실제로 여기서 한 번 터졌다. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) { console.error('\n못 불렀다: ' + cmd + ' — ' + r.error.message); process.exit(1); }
  if (r.status !== 0) process.exit(r.status || 1);
}

/* ---------- 1. 웹 자산 ---------- */
run(process.execPath, [path.join(ROOT, 'build.js'), '--app'], { cwd: ROOT });
run('npx', ['cap', 'sync', 'android'], { cwd: ROOT, shell: true });

/* ---------- 2. 묶기 ---------- */
const java = pickJava();
if (!java) {
  console.error(`\n자바 ${NEED} 이상이 필요한데 못 찾았다.`);
  console.error(`  지금 JAVA_HOME: ${process.env.JAVA_HOME || '(없음)'} — 자바 ${versionOf(process.env.JAVA_HOME || '') || '?'}`);
  console.error('  안드로이드 스튜디오를 깔았다면 그 안의 jbr 을 쓴다. 자리를 못 찾았으면');
  console.error('  JAVA_HOME 을 직접 잡고 다시 부르라. (capacitor-android 가 자바 21로 컴파일된다)');
  process.exit(1);
}
console.log(`\n자바: ${java.why}\n  ${java.home}\n`);

/* gradlew 를 부르는 데 함정이 둘 있다. 둘 다 실제로 밟았다:
     · cwd 를 줘도 셸은 거기서 명령을 안 찾는다(PATH 에서 찾는다) → 전체 경로로 부른다
     · 노드는 보안 때문에 .bat 을 셸 없이는 안 돌린다 → shell 을 켠다
   그런데 셸을 켜면 인자를 따옴표로 안 감싸므로, 빈칸 든 경로가 쪼개진다.
   그래서 **경로를 직접 따옴표로 씌워** 넘긴다. */
const gradlew = path.join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(JSON.stringify(gradlew), ['bundleRelease'],
    { cwd: ANDROID, shell: true, env: { ...process.env, JAVA_HOME: java.home } });

/* ---------- 3. 무엇이 나왔나 ---------- */
const aab = path.join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');
if (!fs.existsSync(aab)) {
  console.error('\n묶음이 안 나왔다: ' + aab);
  process.exit(1);
}
const kb = (fs.statSync(aab).size / 1024).toFixed(0);
const signed = fs.existsSync(path.join(ANDROID, 'keystore.properties'));
console.log(`\n${path.relative(ROOT, aab).replace(/\\/g, '/')} — ${kb} KB`);
console.log(signed
  ? '서명됨 (android/keystore.properties 를 읽었다)'
  : '**서명 안 됨** — android/keystore.properties 가 없다. 이대로는 스토어가 안 받는다.\n' +
    '  android/keystore.properties.example 을 복사해서 채우라.');
