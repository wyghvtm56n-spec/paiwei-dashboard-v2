## Hotfix

- Limit full Facebook and Instagram media insights to four items per dashboard request.
- Preserve all media list rows and public metrics; mark remaining insights as deferred instead of failing the entire dashboard.
- Fixes production HTTP 500 caused by Cloudflare Worker subrequest limits when ads, breakdowns, LINE, Facebook videos, and Instagram media loaded together.

## Verification

- Local `npm run verify`: 15/15 tests pass.
- Remote Verify Dashboard CI: success for commit `30b511d`.
- No content, messages, or Meta account data is deleted or modified.
