# Wincu fixes for upstream review

Base: [Yu-tao-Li/dsh-computer-use-win v0.2.2](https://github.com/Yu-tao-Li/dsh-computer-use-win/tree/1a826745f08734f01d8440c2c4bbb3483ac78263).

These patches were ported from a locally tested older installation. They retain newer upstream activation handling, schemas, version reporting and RuntimeId validation. They are independent of the overlay installer and are not applied automatically.

## Patches

- `wincu-server.patch`: process-owned buffers and pending requests; stale exit isolation; serialized dispatch; cancellation of queued calls; interruption of read/wait workers; retirement after already-issued input cleanup.
- `wincu-windows-uia.patch`: native top-level window enumeration, HWND/PID validation, UIA provider registration, checked cursor/mouse calls and a pre-paste input-desktop check.

The server patch does not make a physical drag instantly cancellable. Input-desktop checks are partial, not an all-action verification framework. `EnumWindows` addresses our reproducible desktop-root enumeration hang, not every UIA/provider hang.

## Reproduce on an isolated checkout

```powershell
git clone https://github.com/Yu-tao-Li/dsh-computer-use-win.git wincu-review
cd wincu-review
git checkout 1a826745f08734f01d8440c2c4bbb3483ac78263
# Replace D:/src with your clone location.
git apply --check --ignore-space-change D:/src/dsh-computer-use-status/patches/wincu-server.patch D:/src/dsh-computer-use-status/patches/wincu-windows-uia.patch
git apply --ignore-space-change D:/src/dsh-computer-use-status/patches/wincu-server.patch D:/src/dsh-computer-use-status/patches/wincu-windows-uia.patch
$env:WINCU_SOURCE = (Get-Location).Path
$env:WINDOWS_CU_POWERSHELL = (Get-Command pwsh).Source
node D:/src/dsh-computer-use-status/tests/wincu-regression.mjs
```

The regression script copies this checkout into temporary fixtures. It only waits, enumerates top-level windows without printing their titles, and uses a synthetic input worker to check cleanup ordering. It does not send physical input, alter DSH profiles, or overwrite the source checkout. The timeout is shortened only inside its fixture.

Checks: repeated real wait cancellation, queued cancellation, stale cancellation, independent MCP processes, bounded native enumeration, three timeout/replacement-worker cycles, and simulated input cleanup followed by successful restart.

## Historical local observations (September 27, 2026)

- UIA root child enumeration hung for about 30 seconds; immediately following calls could fail with a worker-exited error.
- After local fixes, three top-level enumeration calls completed in approximately 12–55 ms.
- Three forced-timeout/replacement-worker checks recovered in approximately 504–524 ms.
- With the old cancellation behavior, cancelling a 2500 ms wait returned to the caller quickly, but the next wait remained delayed by about 2367 ms.
- In the installed DSH session, stopping a 30000 ms wait at about 4.9 seconds allowed a later 1000 ms wait to complete normally.

These are single-machine observations on the earlier local backend. Fresh regression results for the ported patches are reported separately in the release notes; they must not be read as cross-platform performance guarantees.

Licensing: retained Wincu and cgissing MIT notice is in `../licenses/WINCU-MIT.txt`. The overlay IPC issue was our own integration defect and is not attributed to the upstream backend.
