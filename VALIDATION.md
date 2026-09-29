# Release validation — 2026-09-30

## Current 0.1.3 source revision (no tagged Release)

- `npm run build`: passed. `npm test`: **63 passed, zero skipped**. `npm run test:host`: **3 passed, zero skipped**, against the built DSH 0.1.7-rc.2 checkout. `npm run test:host:dsh-cua`: **1 passed, zero skipped**, with dsh-cua 0.4.0 and the current owned WinForms fixture: 19 tools registered, 11 real executor dispatches, exact fill/readback, unconfirmed press followed by separate effect readback, unchanged-value failure, pause/resume and stop-before-dispatch.
- Client tests exercise both accepted and refused/failed settings saves with revision fencing, read-only disabling, and card updates without losing disclosure. The official-host tests cover schema defaults/validation and live volatile theme updates while retaining the bridge and dispatch count.
- Built HUD tests cover both palettes, all receipt headings, control states, decorative image loading, tail/fringe/blink motion and reduced-motion behavior. The same renderer switches orange → blue → orange → blue → orange, retaining control DOM and pause state. The live-switch fixture uses a short-lived `showInactive()` window, matching production; fully hidden offscreen resizing stalled image decoding/transition progress during initial test development. Native main-process tests verify height-only resize, and the actual Effects renderer changes edge/cursor colors while retaining position and one-request sampling.
- One plugin now provides orange/minimal and blue/animated themes. The default stays orange. DSH's official volatile Config and `configForms` APIs persist the choice; the owning loader fiber republishes the current status after a theme update. The existing bridge, pending tool calls and control state are retained.
- The blue mascot uses two transparent image layers: tail and central fringe movement plus blinking. Reduced-motion mode disables these animations with the eyes open. Orange has no mascot and uses a 68px window; blue uses 164px. Both share the same 40px controls.
- Cursor sampling is now driven by renderer animation frames, with at most one outstanding request. A late reply cannot restart a paused/stopped cursor, stationary replies keep the loop alive, and a completed click's pulse survives a following action before the next frame. Edge glow is stronger in both palettes. dsh-cua still never enables cursor replacement, aura or pulses.
- The preceding full blue desktop preview was visibly checked by the user, who confirmed cursor following and edge-glow strength. A local GPU-enabled production-runtime probe recorded sampling-interval p50 4.159ms / p95 4.395ms; this is sampling cadence, not an input-to-photon latency measurement. That preview predates the settings integration and is not evidence of installation of this package.
- The README images are captures of the actual bundled HUD. Source artwork provenance is recorded in THIRD_PARTY.md. No personal reference sheet, profile, account configuration or Electron distribution is included.
- The locally built tgz contains 33 files, including both mascot images, built client/HUD bundles, compiled helpers and the two preview images. All packaged file bytes match the checked workspace; the 50-file source archive passed CRC and byte comparisons. Public text files were checked for personal absolute paths and credential-token patterns.
- Installation into the active desktop profile, clicking the settings page inside that installed GUI, mixed-DPI/multi-monitor validation and physical Esc/input interruption have not been performed for 0.1.3. CI remains an example YAML. No new GitHub Release is created by this source push.

## Previous 0.1.2 source revision

- Approved visual finish: soft orange `#b85c2c`, white text, and a moderate white halo (8px at 0.42 opacity plus 16px at 0.2). Card accents and existing effects use matching warm tones. The final built HUD was rendered and visually reviewed; `npm test` passed again with **56 tests, zero skipped**. These changes affect styling only. The two host tests and live dsh-cua test below were run on the preceding behavior revision, not repeated for this color adjustment.
- `npm run build`: passed. `npm test`: **56 passed, zero skipped**. `npm run test:host`: **2 passed, zero skipped**. `npm run test:host:dsh-cua`: **1 passed, zero skipped**, again observing 19 registered tools and 11 real MCP executor dispatches on the same Windows x64 / DSH 0.1.7-rc.2 / Python 3.14.6 / dsh-cua 0.4.0 / pywinauto 0.6.9 environment described below.
- Fixed an additional-agent stop race: a participant joining while global cancellation is pending is cancelled once and cannot dispatch, even if its signal has not aborted. The controller regression verifies cleanup and successful new-turn dispatch after all stopped participants become idle.
- A retired call cannot dispatch if the same agent starts a new turn before the old gate resumes. A regression checks that the old call is rejected while the new call remains usable.
- Failed/refused result metadata cannot replace the card's requested target. Failure guidance remains visible alongside foreground-change facts, and the host's original record stays available.
- HUD width is now 400 logical pixels (bounded by the display work area). An isolated hidden Electron window renders the built HUD with the production preload; all six receipt headings fit, tooltips include the full status, pausing means “cancel pause”, and disabled stop/pause buttons do not send commands. Receipt detail is suppressed during pause/stop, and stopping clears the controller's stale detail.
- The HUD test is part of `npm test`. It starts no keyboard/cursor helpers and performs no physical desktop input. Captures were visually checked on this machine's current display scale. This is not installed-desktop acceptance, physical Esc validation, or mixed-DPI coverage.
- The initial feedback reply was posted at https://github.com/Hutusion/dsh-cua/issues/1#issuecomment-5892091866 before this polishing pass. That comment's 51-test count describes the earlier local revision; it has not been edited to claim these later changes.
- These results cover the source revision and a locally built package. No installation into the running DSH profile or tagged release was performed. Automatic CI remains unconfigured; the Windows YAML remains an example. Custom service names and dsh-cua pointer effects remain unchanged.

## Original package preparation — 2026-09-28

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

## dsh-cua adaptation 0.1.1 — 2026-09-29

- DSH 0.1.7-rc.2, Windows x64, dsh-cua 0.4.0 (isolated Python 3.14.6).
- 47 plugin tests passed, including 6 dsh-cua-specific tests; 2 existing official-host integration tests passed.
- `tests/host-dsh-cua.test.mjs` passed with the real DSH MCP client and dsh-cua server: all 19 tool names registered, a dedicated WinForms input was filled and read back, effect receipt mapped to verified, pause/resume and stop-before-dispatch worked.
- The live test requires `DSH_STATUS_TEST_REPO`, `DSH_CUA_PYTHON`, and `DSH_CUA_TEST_TARGET` (a compiled copy of `tests/fixtures/CuaTarget.cs`). It does not use an LLM or account credentials. Without these variables it is explicitly skipped.
- Installed plugin files and generated bundles matched the tested files by SHA-256. The existing desktop profile was restarted normally; its desktop host launched the dsh-cua process.
- Not verified: immediate interruption of in-flight physical input, all application types, mixed-DPI behavior. User-active and arbiter-busy rendering used recorded-shape fixtures; no physical user input was synthesized to force contention.
- dsh-cua does not enable cursor replacement/halo/pulse: its success receipts do not reliably expose physical click coordinates. Read-only and UIA actions must not be presented as pointer movement.

## Initial dsh-cua feedback revision 0.1.2 — 2026-09-29 (before polish)

- Upstream feedback: https://github.com/Hutusion/dsh-cua/issues/1#issuecomment-5889717612 and https://github.com/Hutusion/dsh-cua/issues/1#issuecomment-5889853368.
- The existing false/null state split was already correct. Replaced the overbroad verified label with a state-check label; `type_text` explicitly describes a text change without claiming exact content equality. `select` may verify an already-satisfied target state, so not every true receipt is described as a change.
- Refusal labels now identify the rejected call. Fixed copy plus numeric `last_input_age_ms`/`waited_ms` facts are shown in card details and the HUD tooltip; arbiter-busy does not infer user-input age. Foreground-change flags produce bounded notices. Raw error text and effect notes are not copied to these surfaces.
- `npm run build`: passed. `npm test`: **51 passed, zero skipped**. Includes actual React rendering of the new receipt details, tri-state and privacy checks, refusal timing, foreground flags, a positive Wincu pointer control and all 19 dsh-cua tools through begin/gate/result with cursor effects disabled.
- Mutation check: removed the backend-prefix guard only in an isolated in-memory source copy and reran the actual no-halo test against it. The test failed on the unexpected physical pointer as intended; the production source was not modified. This proves the strengthened assertion catches the isolation regression that the old fixture missed.
- `npm run test:host`: **2 passed, zero skipped**, using the built DSH 0.1.7-rc.2 checkout.
- `npm run test:host:dsh-cua`: **1 passed, zero skipped**, using dsh-cua 0.4.0, Python 3.14.6 and pywinauto 0.6.9 on Windows x64. All 19 tools registered; 11 actual MCP executor dispatches were observed. The owned WinForms input was filled and read back exactly; UIA press returned null/unconfirmed while the owned outcome control changed as expected; repeating the same value returned false/state_unchanged/error. Pausing kept the dispatch counter unchanged, resuming added exactly one dispatch, and stopping the paused call added none.
- The live entry now fails when any required environment variable is missing; each of the three missing-variable cases exited 1 before launching a test window or MCP server. Ordinary `npm test` remains independent of desktop acceptance. The CI YAML is still an example, not an enabled workflow.
- The live host test captures actual controller frames with an overlay bridge test double; it does not constitute a fresh installed-desktop HUD/button acceptance. New GUI copy was rendered in the React tests. User-active/arbiter-busy timings and foreground-change notices were tested with source-shaped fixtures, not synthesized physical contention.
- At this initial verification stage, the revision had not been installed into the running DSH profile or pushed to GitHub. Its feedback reply was subsequently posted at the link above. Custom MCP service-name detection remains out of scope; `win32` is still required. No cursor-coordinate contract or automatic retry was introduced. In-flight physical cancellation, mixed-DPI and all-application coverage remain unverified.
