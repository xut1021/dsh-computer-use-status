# Release validation — 2026-09-28

## Current release preparation

- `npm install` built the independent package from its declared dependencies, without a local DSH checkout or personal source paths.
- `npm test`: **41 passed**, zero skipped. Includes real Electron/pipe lifecycle with a test-double cursor, React card rendering, controller state transitions and Windows cursor-helper tests.
- `npm run test:host`: **2 passed**, against the locally built official DSH `0.1.7-rc.2` source.
- `git apply --check --ignore-space-change`: both patches apply to Wincu `1a826745f08734f01d8440c2c4bbb3483ac78263` / v0.2.2.
- `tests/wincu-regression.mjs`: **passed** on the ported backend. Three cancellation/restart cycles, separate MCP isolation, queued/stale cancellation, three read-only window enumerations, three forced-timeout recovery cycles, and synthetic input cleanup followed by restart.
- `npm pack`: inspected an explicit 27-file package; includes compiled helpers and bundled UI, excludes personal configurations, credentials, photos, revision backups, private reports and Electron distribution files.
- The tgz installed successfully as a dependency in a separate local test project. Its Electron dependency is installed separately; npm lifecycle-script policies may require the user's normal approval process.

These checks do not equal a fresh GUI installation on an unrelated machine. Live DSH desktop acceptance cited in README was performed on the earlier local installation. The public package changes build/runtime resolution for portability; its state/control implementation is retained.

## Not verified

All Windows applications, mixed-DPI/multi-monitor behavior, physical Esc end-to-end, physical mouse-held/key-held cancellation, and universal screenshot exclusion. Cua backend interruption and Codex native Edge URL detection are not fixed or certified here.

No new API/model requests or physical desktop input were needed for the release preparation tests. Read-only window enumeration stayed local and did not print titles.
