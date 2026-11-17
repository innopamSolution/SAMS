# 저장소 API 규약 (DB 연결용)

Spatial Log 는 메모·아이템 공개 여부·아이템 수정을 아래 세 개의 "문서"로 읽고 씁니다.
지금은 개발 서버가 `sams/data/*.json` 파일로 처리하고, GitHub Pages 에서는 빌드 때 담긴 읽기 전용 사본을 봅니다.
DB 를 붙일 때는 **같은 규약의 API 만 만들면** 화면 코드는 바꾸지 않아도 됩니다.

## 연결 방법
- 빌드할 때 `VITE_STORE_API_URL` 을 지정합니다. 예: `VITE_STORE_API_URL=https://api.example.com/store/`
  (GitHub Actions 라면 `.github/workflows/deploy.yml` 의 Build 단계 `env:` 에 추가)
- 지정하지 않으면 지금처럼 `/SAMS/api/store/` 와 정적 사본을 씁니다.

## 엔드포인트
`{BASE}{name}` — name 은 `annotations`, `itemStatus`, `itemEdits` 세 가지.

| 메서드 | 동작 | 응답 |
| --- | --- | --- |
| `GET` | 문서 전체를 읽는다 | `200` + JSON, 아직 저장된 것이 없으면 `404` |
| `PUT` | 문서 전체를 통째로 바꾼다 | `204` (JSON 이 아니면 `400`, 너무 크면 `413`) |

다른 출처에서 부르므로 CORS 에서 `GET, PUT, OPTIONS` 와 `Content-Type` 헤더를 허용해야 합니다.

## 문서 모양
- `annotations`: 메모 배열
  `[{ id, title, desc, tags[], urls[], photos[], panos[], visibility('public'|'private'), createdAt, itemId?, space?, scope?('site'|'period'), period?, lng, lat, alt }]`
  - 사진은 지금 data URL 로 들어 있어 용량이 큽니다. DB 로 옮길 때는 이미지는 파일 저장소에 두고 주소만 저장하는 편이 좋습니다.
- `itemStatus`: `{ "<공간>|<제목>|<날짜>": "published" | "draft" }`
- `itemEdits`: `{ "<공간>|<제목>|<날짜>": { title, desc, lng, lat } }` (키는 엑셀에서 가져온 원래 값)

## DB 를 붙일 때 정해야 할 것
- **누가 쓸 수 있나**: 지금 코드는 모두를 관리자로 취급합니다(`ANNOTATION_ADMIN = true`). `PUT` 은 로그인한 관리자만 허용하고, 화면의 관리자 여부는 그 로그인 결과로 정해야 합니다.
- **비공개 메모**: 비공개 메모는 관리자가 아닌 사람의 `GET` 응답에서 서버가 빼야 합니다. 화면에서만 숨기면 주소로 그대로 읽힙니다.
- **동시 수정**: 지금은 문서 전체를 덮어쓰므로 두 사람이 동시에 고치면 나중 것이 이긴다. 필요하면 건별 API(`POST/PATCH/DELETE /annotations/:id`)로 나누는 것이 안전합니다.
- **배포 사이트의 정적 사본**은 API 를 붙인 뒤에는 필요 없습니다(비공개 메모가 들어 있기도 합니다).
