// 계정 관리 (서버에서 직접 실행)
//   node server/admin-user.mjs add <아이디> [admin|user]   계정을 만들거나 비밀번호·역할을 바꾼다(비밀번호는 물어본다). 역할을 생략하면 admin
//   node server/admin-user.mjs remove <아이디>             계정을 지운다
//   node server/admin-user.mjs list                        계정 목록
// 역할: admin = 메모 작성·수정·삭제와 데이터 관리까지 / user = 일반 사용자(보기만)
// DB 파일은 SAMS_DB(기본 server/data/store.sqlite). 물어보지 않고 넣으려면 SAMS_NEW_PASSWORD 환경변수를 쓴다.
import readline from 'node:readline';
import { openDb, DEFAULT_DB, setAccount, removeAccount, listAccounts } from './accounts.mjs';

const [cmd, id, role = 'admin'] = process.argv.slice(2);
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
    setAccount(db, id, pw, role);
    console.log(`계정 '${id}' (${role}) 저장 완료`);
  } else if (cmd === 'remove' && id) {
    console.log(removeAccount(db, id) ? `계정 '${id}' 삭제 완료` : `'${id}' 계정이 없습니다`);
  } else if (cmd === 'list') {
    const rows = listAccounts(db);
    console.log(rows.length ? rows.map((r) => `${r.id}  ${r.role}  (${new Date(r.created_at).toLocaleString('ko-KR')})`).join('\n') : '계정이 없습니다');
  } else {
    console.log('사용법: node server/admin-user.mjs add <아이디> [admin|user]  /  remove <아이디>  /  list');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
