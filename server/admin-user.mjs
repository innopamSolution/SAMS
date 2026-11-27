// 관리자 계정 관리 (서버에서 직접 실행)
//   node server/admin-user.mjs add <아이디>      계정을 만들거나 비밀번호를 바꾼다(비밀번호는 물어본다)
//   node server/admin-user.mjs remove <아이디>   계정을 지운다
//   node server/admin-user.mjs list              계정 목록
// DB 파일은 SAMS_DB(기본 server/data/store.sqlite). 물어보지 않고 넣으려면 SAMS_NEW_PASSWORD 환경변수를 쓴다.
import readline from 'node:readline';
import { openDb, DEFAULT_DB, setAdmin, removeAdmin, listAdmins } from './accounts.mjs';

const [cmd, id] = process.argv.slice(2);
const db = openDb(process.env.SAMS_DB || DEFAULT_DB);

function ask(question) { // 입력이 화면에 보이지 않게 받는다
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

try {
  if (cmd === 'add' && id) {
    let pw = process.env.SAMS_NEW_PASSWORD;
    if (!pw) {
      pw = await ask('비밀번호: ');
      if (pw !== await ask('비밀번호 확인: ')) throw new Error('두 비밀번호가 같지 않습니다');
    }
    setAdmin(db, id, pw);
    console.log(`관리자 '${id}' 저장 완료`);
  } else if (cmd === 'remove' && id) {
    console.log(removeAdmin(db, id) ? `관리자 '${id}' 삭제 완료` : `'${id}' 계정이 없습니다`);
  } else if (cmd === 'list') {
    const rows = listAdmins(db);
    console.log(rows.length ? rows.map((r) => `${r.id}  (${new Date(r.created_at).toLocaleString('ko-KR')})`).join('\n') : '관리자가 없습니다');
  } else {
    console.log('사용법: node server/admin-user.mjs add|remove <아이디>  /  list');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
