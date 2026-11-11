# GitHub Pages + private Google Drive

## 먼저 할 일

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

## Notes

- Changes save to this device first, NOT automatically to Drive.
- Backup / Drive에 새 백업 creates a private timestamp-and-UUID snapshot in
  My Drive ROOT. No sharing permissions are changed or added.
- Another device: Drive 백업 선택·복원, explicitly choose a snapshot and confirm.
  A local rescue snapshot is saved first. No silent merge or latest-file guess.
  Work sequentially across devices.
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
