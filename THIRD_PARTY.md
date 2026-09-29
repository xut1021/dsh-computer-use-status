# Sources and attribution

- This repository provides a DSH status/control plugin. It does not implement an LLM or claim authorship of its supported Computer Use backends.
- Wincu: [Yu-tao-Li/dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win), MIT, Copyright 2026 Yu-tao-Li. It derives from [cgissing/windows-computer-use](https://github.com/cgissing/windows-computer-use), MIT, Copyright 2026 cgissing. Patches under `patches/` contain portions of this code; the original license is retained in `licenses/WINCU-MIT.txt`.
- The temporary cursor geometry derives from [wushi2333/dsh-computer-use_codex-style](https://github.com/wushi2333/dsh-computer-use_codex-style/tree/72f390ae076948968370510ea7f5b44dcf3e6015). Its full MIT notice is retained in `assets/CursorLease.NOTICE.txt`. Cursor ownership, lease and watchdog logic are separate implementations.
- Electron, React, React DOM and esbuild retain their own licenses. They are obtained as npm dependencies; generated React bundles preserve inline license notices. No Electron distribution is committed in this source repository.
- The `cua_native` adapter recognizes tool names from a separate Cua integration. Cua source/binaries are not distributed here. Recognition does not establish backend availability or cancellation support.
- The blue theme's `assets/blue-mascot-perched.png` and `assets/blue-mascot-motion-base.png` were generated and edited with AI from a character reference supplied by the project owner for this UI. The original reference sheet is not included. Its original artist and character-design license have not been established; the repository's MIT code license is not a claim to those underlying rights. Animation assembly is in `ui/Mascot.tsx` and `ui/adapter.css`.

This is an independent community project, not an official DeepSeek, OpenAI, Microsoft or Apple product. Visual resemblance does not imply affiliation.
