# CursorLease

Windows x64 helper for a temporary black arrow with a white outline. It replaces
14 standard system cursor images; it does not write registry settings or hide
the pointer. Application-owned custom cursor images are outside this mechanism.

## Protocol

Start `CursorLease.exe` with redirected stdin/stdout and a hidden console.
It emits `ready` only after its independent watchdog holds the session mutex.

- `enable\n`: save the current images in both processes, arm the watchdog, then
  replace the standard cursor images. Reply: `enabled`.
- Repeated `enable`: reply again without replacing the original backups.
- `disable\n`: restore the exact saved images and disarm recovery. Reply: `disabled`.
- Stdin EOF: restore and exit.
- A failure emits `failure`, writes a fixed diagnostic to stderr, restores, and exits nonzero.

The caller should treat `enabled` as the activation acknowledgement, not `ready`.
Disable on pause, stop, or end of operation. Do not draw another arrow in Electron.

## Recovery

The watchdog snapshots the original cursor images before acknowledging Arm.
If the main helper is killed, the watchdog restores its independent copies.
If the watchdog dies first, the main helper restores its copies and exits.
Each process owns a mutex so another instance cannot replace cursors while either
recovery path is still running. No desktop content is read or saved.

If restoring an image fails, `SPI_SETCURSORS` reloads Windows' configured cursor
scheme. That fallback cannot reproduce another application's temporary cursor
replacement. Simultaneously force-killing both helper processes cannot execute
either recovery path; unlike a transparent-cursor approach, a visible arrow remains.

## Diagnostics without enabling the lease

- `--self-test`: copy the current cursor images, construct private cursor handles,
  and free them; never calls `SetSystemCursor`.
- `--fingerprint`: one JSON line containing `count`, a combined `sha256`, and
  `cursors: [{id, hotspotX, hotspotY, sha256}]`. Hashes include image pixels, mask,
  dimensions, and hotspot; no screen content or settings are included.
- `--render-preview PATH.png`: export the arrow only; no watchdog or global changes.
- `node tests/cursor-lease.test.mjs` via `node --test`: native no-change checks and
  real process lifecycle tests with fake replacement/restoration calls. The fake
  backend uses an isolated test mutex and does not affect the production lease.

Arrow geometry attribution and the upstream MIT license are in `CursorLease.NOTICE.txt`.
