# GitHub Pages + private Google Drive

## 먼저 할 일

### 기존 로컬 앱 전체 자료 이전

휴대폰에서는 파일을 수천 개 선택하지 않습니다. Drive 자료 관리의
자료 한 번에 가져오기 > Drive에서 전체 자료 ZIP 선택을 누르면 전체 이전
ZIP만 검색됩니다. 이미 휴대폰에 ZIP이 있다면 압축을 풀지 말고
휴대폰·컴퓨터의 ZIP 파일 하나 선택에서 선택하세요.
개별 파일 선택에서도 전체 자료 ZIP을 받을 수 있습니다.
일반적인 성경·악보 폴더 ZIP도 지원합니다. ZIP과 .report.json을 함께
선택했다면 ZIP만 처리합니다. ZIP 안에 또 ZIP이 있는 다운로드 묶음은
바깥 압축만 풀고 안의 실제 자료 ZIP을 선택하세요.
맥에서 압축할 때 생기는 __MACOSX 폴더, ._ 보조 파일과 .DS_Store는
실제 성경 데이터가 아니므로 일반 ZIP·폴더·개별 파일 가져오기에서 건너뜁니다.
가져오기 완료 후 같은 화면의 성경 본문 열기를 누릅니다.
이미 게시된 사이트에서는 인터넷 사이트 열기 대신 성경 본문 보기로 표시되며
불필요하게 같은 주소로 다시 이동하거나 로그인을 초기화하지 않습니다.

상위 migration_exports 폴더의 성경앱-전체이전-날짜.zip은 개인 자료이므로
GitHub에 절대로 올리지 않습니다. 웹 앱의 Drive 자료 관리 > 로컬 자료 전체 이전 >
전체 이전 파일 선택에서 해당 ZIP 하나를 선택합니다. 또는 Google Drive에서
비공개 ZIP을 선택할 수 있습니다. 기기의 여유 저장공간 약 1.3GB 이상을 권장합니다.

각 파일의 SHA-256을 확인하며 순차적으로 가져옵니다. 모든 파일 검증이 끝난 후에만
개인 메모·주제를 합칩니다. 이전이 끊기면 원본을 지우지 말고 다시 선택해 주세요.
같은 구절의 기존 웹 메모와 로컬 메모가 다르면 두 내용을 함께 보존합니다.
주제와 메모·표시·태그는 Google 연결 후 자동 동기화되지만, 성경 DB·악보와
과거 백업의 보관본은 기기별로 한 번씩 전체 이전 파일을 읽어야 합니다.
과거 백업 및 현재 웹 기능에서 사용하지 않는 원본 형식도 보관하며 다운로드할 수 있습니다.
로컬 원본은 이전 확인 후에도 복구용으로 보관하세요. 브라우저별 화면 설정은
파일에 없으므로 자동 추출하지 않으며 기기에서 별도로 조절합니다.

1. GitHub에 personal-bible-study 공개 저장소를 새로 만들어 연결합니다.
2. 이 github-pages 폴더만 게시합니다. 상위 폴더의 성경·악보·메모는 올리지 않습니다.
3. Google Cloud에서 웹 OAuth 클라이언트 ID, 제한된 Picker API 키,
   프로젝트 번호를 발급합니다. 비밀번호와 클라이언트 보안 비밀은 필요하지 않습니다.
4. 첫 화면의 Drive 설정에 위 3가지를 넣고 Google 연결을 누릅니다.
5. 기존 드라이브 폴더에서 원하는 역본 .bdb 파일부터 선택합니다.
   원전분해.sdb, 성경관주.cdb, 새찬송가.hdb와 new_번호.jpg도 추가할 수 있습니다.
6. 기존 메모는 user_data 안의 notes.json 파일을 선택해 가져옵니다.
7. 메모 수정은 기기에 먼저 저장됩니다. 다른 기기로 이동하기 전에 Backup을
   누르세요. 백업은 내 드라이브 최상위에 새 파일로 생성됩니다.
8. 다른 기기에서는 Restore에서 사용할 백업을 직접 선택합니다.
   여러 기기의 변경을 자동 병합하지 않으므로 순서대로 작업해 주세요.
9. 공용 기기에서는 사용 후 이 기기의 자료 모두 삭제를 실행합니다.

## 게시된 주소

https://chaeyoung25.github.io/personal-bible-study/

Google 웹 OAuth의 승인된 JavaScript 원본에 https://chaeyoung25.github.io 를
추가하고, Picker API 키의 웹사이트 제한에 https://chaeyoung25.github.io/* 를
추가합니다. localhost와 docs.google.com 항목, API 제한은 유지하세요.
이 설정은 Google Cloud 계정 소유자만 변경할 수 있습니다.

로컬 시험 앱에서 Drive 자료 관리 > 인터넷 사이트 열기를 누르면 공개 연결설정
3가지만 새 사이트로 전달됩니다. 받는 쪽에서 확인 후 주소 조각을 즉시 지웁니다.
토큰·개인 자료는 포함되지 않으며 설정은 GitHub에 게시되지 않습니다.
다른 기기용 연결설정 링크 복사를 사용해 본인 휴대폰에 전달할 수도 있습니다.
이 링크는 공개 게시하지 마세요. 새 기기에서 본인 Google 로그인은 필요합니다.

계정 비밀번호·인증 코드·클라이언트 보안 비밀을 앱이나 채팅에 입력하지 마세요.
Google 로그인과 실제 Drive 연결은 Google 설정을 마친 뒤 최종 확인해야 합니다.

This is a separate browser edition. The original Python app is unchanged.
Never initialize Git in the parent application folder.

## Publish

1. Create a new public empty repository named personal-bible-study.
2. Upload only this directory, never the parent data, user_data or backups.
3. Settings > Pages > Deploy from a branch > main > /docs.
4. Open the HTTPS URL GitHub returns. Python is not required in production.

## Google setup (account owner must complete)

Never send passwords, client secrets, refresh tokens or recovery codes.

1. Create a dedicated Google Cloud project. Do not enable paid resources.
   Review API quotas/billing terms; do not assume zero cost forever.
2. Enable Google Drive API and Google Picker API.
3. Configure Google Auth Platform consent. For personal testing, register only
   your own Google account as a test user. Review testing-mode expiration and
   verification restrictions before wider use.
4. Create a Web application OAuth client. Authorized JavaScript origins:
   the exact published origin, e.g. https://YOUR_ACCOUNT.github.io (no path).
5. Create a browser API key restricted to Google Picker API, and website
   referrers https://YOUR_ACCOUNT.github.io/personal-bible-study/* and
   https://docs.google.com/* (required by the Picker iframe). Consult Google's
   current Picker guide if its required referrers change.
6. In Drive settings enter the PUBLIC client ID, restricted Picker API key and
   numeric project number. Never enter a client secret.
7. Connect and confirm the displayed Google account. Requested scopes:
   openid, email, drive.file. Whole-Drive access is not requested.
8. Select individual .bdb translations, 원전분해.sdb, 성경관주.cdb, 새찬송가.hdb
   and new_N.jpg/png scores. Multi-select is supported. Selecting a folder alone
   does not grant access to its children. Downloads run sequentially.
9. Press 성경 열기. Browser SQLite searches run in a Worker using vendored sql.js.

## Automatic synchronization (browser edition)

- Google 연결 후 자동 동기화가 기본으로 켜집니다.
- 변경은 IndexedDB에 즉시 저장되고 마지막 변경 약 5초 후 Drive로 전송됩니다.
- 앱이 열린 동안 20초마다 다른 기기의 변경을 확인합니다. 화면으로 돌아오거나
  인터넷이 복구되면 다시 확인합니다. 연결 만료 시 Google 연결을 다시 눌러주세요.
- 인터넷·브라우저 중지·모바일 절전 때문에 지연될 수 있습니다. 앱이 닫힌 동안
  계속 실행되지는 않습니다. 나가기 전에 동기화 완료 표시를 확인하세요.
- 자동 동기화는 메모·태그·형광펜·밑줄·선택 표시와 가져온 주제 자료를 대상으로 합니다.
  성경 DB·악보 다운로드나 화면 배치는 자동 동기화하지 않습니다.
- Drive에는 pbs-sync-v1-UUID.json 형태의 비공개 변경 기록이 새 파일로 쌓입니다.
  기존 파일을 덮어쓰지 않으며, 모든 기기에서 동일한 OAuth 앱·계정을 사용해야 합니다.
- 기존 메모는 첫 연결 때 변경 기록으로 등록됩니다. 구형 앱은 자동 동기화를
  지원하지 않으므로 모든 기기에서 새 버전을 열어 주세요.
- 같은 항목을 동시에 바꾸면 두 내용을 보존합니다. Drive 자료 관리의
  동시 수정 항목에서 하나를 선택하거나 메모를 합쳐 저장하세요.
- 삭제도 기록되므로 예전 파일을 다시 받아도 삭제한 메모가 되살아나지 않습니다.
- 첫 변경 동기화 후, 이후 변경이 있고 마지막 백업으로부터 24시간이 지나면
  별도 복구용 전체 백업을 만듭니다. 수동 Backup도 계속 사용할 수 있습니다.
- 변경 파일을 임의 삭제하면 새 기기가 전체 이력을 받지 못할 수 있습니다.
  자동 정리는 아직 하지 않으므로 사용량이 커지면 백업 후 별도 정리가 필요합니다.

## Manual recovery

- Changes save to this device first; automatic Drive sync requires an active
  connection and the automatic-sync checkbox enabled.
- Backup / Drive에 새 백업 creates a private timestamp-and-UUID snapshot in
  My Drive ROOT. No sharing permissions are changed or added.
- Another device: Drive 백업 선택·복원, explicitly choose a snapshot and confirm.
  A local rescue snapshot is saved first. Restore creates explicit new changes
  which can then synchronize to other devices; do not restore an old snapshot
  merely to refresh another device. Use automatic sync / 지금 동기화 instead.
- Import original user_data/notes.json or a downloaded backup to migrate notes.
- 기기에 백업 다운로드 works without Google.
- Access tokens remain in memory, expire and require reconnection. They are
  never embedded in URLs or persisted by the app.
- Account binding blocks backing up local data into a different Google account
  without clearing the device first.

## Offline / shared devices

After the first online load, the service worker caches only public app files.
No Google response, credential or private file is added to its cache.
Imported files and notes stay in IndexedDB. Browser storage persistence is
requested, not guaranteed. Always retain Drive/downloaded backups.

Connection logout does not delete local data. Use 이 기기의 자료 모두 삭제.
Close other app tabs to finish deletion. This clears the app IndexedDB,
app-prefixed local storage and shell cache, not Drive originals.
Use a dedicated GitHub Pages origin when possible: IndexedDB/browser storage is
origin-scoped, not isolated by repository path.

## Build / test

Dependency: sql.js 1.13.0 (MIT), docs/vendor. Run python3 build.py in this folder.
Only allowlisted UI assets are copied. Topic Bible text is removed from public
JSON and reconstructed from an imported translation on the device.
Run python3 tests/audit.py before publishing.
Serve docs using a static HTTP server for local testing, never the parent folder.
Live Google authorization requires your actual project and is not mock-verifiable.
