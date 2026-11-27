# 저장소 서버(DB) 배포 안내 — 서버 관리자용

메모·아이템 공개 여부·아이템 수정을 서버에 저장하기 위한 작은 프로그램입니다(`sams/server/store-server.mjs`).
Node.js 22.5 이상만 있으면 되고 추가 패키지 설치는 필요 없습니다. 데이터는 SQLite 파일 하나에 저장됩니다.

```
브라우저 → https://spatiallog.innopam.kr/store/…  → (openresty) → 저장소 서버(127.0.0.1:8787) → SQLite 파일
```

## 1. 관리자 계정 만들기 · 실행
로그인은 **아이디 + 비밀번호**입니다. 계정은 서버에서 직접 만들고, 비밀번호는 원문이 아니라 암호화(scrypt)된 값만 DB 에 저장됩니다.
```bash
cd /srv/sams        # 저장소를 받아 둔 곳
export SAMS_DB=/srv/sams-data/store.sqlite      # DB 파일 위치(배포로 폴더가 바뀌어도 지워지지 않는 곳, 백업 대상)

node sams/server/admin-user.mjs add 아이디       # 비밀번호를 물어본다(8자 이상). 같은 아이디로 다시 하면 비밀번호가 바뀐다
node sams/server/admin-user.mjs list             # 계정 목록
node sams/server/admin-user.mjs remove 아이디    # 계정 삭제

SAMS_TOKEN_SECRET='아무-긴-무작위-문자열' \
SAMS_SEED_DIR=/srv/sams/sams/data \
node sams/server/store-server.mjs               # 서버 시작
```
- 아이디는 영문·숫자와 `. _ @ -` 로 2~40자입니다. 관리자는 1~2명을 가정하지만 몇 명이든 만들 수 있습니다.
- `SAMS_TOKEN_SECRET`: 로그인 표 서명용 비밀값. 정해 두면 서버를 다시 시작해도 로그인이 유지됩니다(없으면 재시작 때마다 다시 로그인).
- `SAMS_SEED_DIR`: DB 가 비어 있을 때만 `annotations.json`·`itemStatus.json`·`itemEdits.json` 으로 처음 채웁니다(없으면 빈 상태로 시작).
- 처음 세팅을 한 번에 하려면, 관리자가 한 명도 없을 때만 `SAMS_ADMIN_ID`·`SAMS_ADMIN_PASSWORD` 환경변수로 첫 계정을 자동으로 만들 수도 있습니다.
- 그 밖의 선택 값(`PORT`, `HOST`, `SAMS_CORS_ORIGINS`, `SAMS_MAX_BODY_MB`, `SAMS_TOKEN_HOURS`)은 `store-server.mjs` 맨 위 설명을 보세요.

항상 켜 두려면 systemd 등으로 등록합니다. 예:
```ini
[Service]
WorkingDirectory=/srv/sams
Environment=SAMS_DB=/srv/sams-data/store.sqlite
EnvironmentFile=/etc/sams-store.env     # SAMS_TOKEN_SECRET=… 를 이 파일에(권한 600)
ExecStart=/usr/bin/node sams/server/store-server.mjs
Restart=always
```

## 2. openresty 설정
같은 도메인의 `/store/` 를 저장소 서버로 넘깁니다. (같은 도메인이라 CORS 설정은 필요 없습니다.)
```nginx
location /store/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header X-Forwarded-For $remote_addr;   # 로그인 실패 횟수를 접속자별로 세기 위해 필요
    client_max_body_size 30m;                         # 사진이 든 메모를 저장할 수 있게
}
```
- 서버에 정적 파일 `/store/annotations.json` 같은 **예전 사본이 남아 있으면 지워 주세요.** 비공개 메모가 들어 있어 주소만 알면 누구나 읽을 수 있습니다.

## 3. 화면(프런트) 빌드
빌드할 때 저장소 주소를 알려 줍니다. 이 값이 있으면 화면이 서버에 로그인·저장을 하고, 정적 사본(`store/*.json`)은 빌드에 들어가지 않습니다.
```bash
VITE_STORE_API_URL=/store/ VITE_VWORLD_KEY=… npx vite build --base=/
```

## 4. 동작 요약
| 구분 | 로그인 안 한 사람 | 관리자(비밀번호 로그인) |
| --- | --- | --- |
| 공개 메모·아이템 보기 | 가능 | 가능 |
| 비공개 메모 | 서버가 보내지 않음 | 보임 |
| 메모·아이템 저장 | 서버가 거부(401) | 가능 |
| 데이터 관리 화면 | 보이지 않음 | 보임 |
| 로그인 | 헤더 오른쪽 "로그인" → 아이디·비밀번호 | 로그인하면 아이디와 LOGOUT 표시 |

- 로그인 표는 12시간 유지됩니다. 비밀번호를 5번 틀리면 같은 접속지에서 1분간 막힙니다.
- 비밀번호 변경·계정 삭제는 `admin-user.mjs` 로 합니다(이미 받은 로그인 표는 만료될 때까지 유효하므로, 바로 끊으려면 `SAMS_TOKEN_SECRET` 을 바꿔 서버를 다시 시작하세요).
- 로그인 실패가 같은 접속지나 같은 아이디에서 1분에 5번이면 1분간 막힙니다. 아이디가 없는 경우와 비밀번호가 틀린 경우는 같은 메시지를 보여 줍니다.
- 관리자 계정은 "모든 기능 권한" 한 종류입니다. 역할을 나누려면 계정 표에 역할 칸을 추가하면 됩니다.

## 5. 확인
```bash
curl -i http://127.0.0.1:8787/store/me                       # {"admin":false} (로그인 전)
curl -i -X PUT -d '[]' https://spatiallog.innopam.kr/store/annotations   # 401 이어야 정상
```
