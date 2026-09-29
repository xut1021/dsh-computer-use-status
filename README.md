# DSH Computer Use Status

**实验性 Windows 插件：让 DeepSeek Harness 的电脑操作可见、可暂停、可请求停止。**

提供悬浮状态条、当前动作与目标窗口、鼠标光晕、屏幕边光、临时系统指针，以及对话内操作记录。无需改动官方 DSH 程序。

## 0.1.3：同一个插件，两套 UI

在 DSH 的插件管理页打开 **dsh-computer-use-status → 配置**，选择主题并保存：

| 主题 | 外观 |
| --- | --- |
| 橙色简洁版（默认） | 柔和橙色状态条、白色外发光，紧凑无角色 |
| 蓝色角色动画版 | 蓝色状态条，角色趴在上方，尾巴和额前头发轻晃、自然眨眼 |

![橙色简洁版](docs/ui-orange.png)

![蓝色角色动画版](docs/ui-blue.png)

保存后，状态条、屏幕边光、鼠标光圈和对话卡片同步换色，进行中的任务继续运行。蓝色切回橙色时会收起角色区域。两套 UI 共用暂停、继续和停止逻辑；跟随系统“减少动态效果”设置时，角色保持睁眼静止。

鼠标位置现在按渲染帧请求新采样，避免旧定时器带来的跟随滞后；屏幕边光同时加强。上述截图来自实际构建后的界面。dsh-cua 仍只显示状态条和边光，原因见下面的后端说明。

## 到底用的是哪个 Computer Use？

这不是从零实现的 Computer Use 引擎，也不是 Codex 原生 Computer Use 的开源版本。

| 部分 | 来源与职责 |
| --- | --- |
| 决策模型 | 使用你在 DSH 会话中选择的模型，本插件不提供模型或账号 |
| 主要验收后端 | [Yu-tao-Li/dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win)，工具前缀 `mcp__wincu__windows_computer_use_` |
| 更早的上游 | Wincu 派生自 [cgissing/windows-computer-use](https://github.com/cgissing/windows-computer-use)，底层是 Windows UI Automation、截图及输入接口 |
| 本仓库 | 状态界面、操作卡片、暂停门控、停止请求、光标恢复监护，以及单独提供的后端修复补丁 |
| 其他适配 | 识别 `mcp__cua_native__` 下的确定工具名单；这是另一条 Cua 集成，不是 OpenAI Codex 原生工具 |
| dsh-cua 适配 | [Hutusion/dsh-cua](https://github.com/Hutusion/dsh-cua) 0.4.0，服务名 `win32`，识别 `mcp__win32__tool_` 下的 19 个工具 |

界面可识别以上后端，但不会安装它们、替它们选择模型或保证其全部能力。之前调研过的 freecomputeruse、computer-use-cache、ScreenPeek **不是本仓库正在使用的底层引擎**。

### dsh-cua（0.1.1 新增）

独立安装 `dsh-cua==0.4.0`，在 DSH MCP 配置中使用 `serverName: win32`、Python 命令和参数 `['-m', 'dsh_cua']`。其他服务名暂不自动匹配。

浮层及对话卡片识别 `success:false`、`effect_verified` 和派发回执。`effect_verified: false` 为失败，`null` 为“效果未确认”，`true` 为“状态检查通过”。`type_text` 的通过仅代表检测到内容变化，不保证写入内容已逐字核对；`press` 被接受时没有可比较状态，仍显示“效果未确认”。

`user-active` 显示“已让行，本次未执行”，`arbiter-busy` 显示“其他任务占用，本次未执行”。卡片详情及浮层悬停提示显示回执中的用户输入间隔、门控总耗时和前台窗口变化；这些是调用结束时的记录，不是实时队列进度。输入间隔不区分键盘和鼠标，门控耗时包含获取互斥锁的时间，`arbiter-busy` 不展示用户输入间隔。插件不会自动重试，也不转发原始 `effect_note` 或错误正文。

控件操作不代表鼠标点击；0.4.0 成功点击回执未稳定提供屏幕坐标，因此 dsh-cua 不启用鼠标替换、光晕和点击脉冲，保留状态条与边光。截图文件路径不会被直接加载进卡片。

暂停阻止后续派发，停止请求宿主取消；未证明 dsh-cua 已经发出的物理输入能够立即中断。

### 0.1.2 回执与控制改进

- 回执提示补充门控耗时、用户输入间隔和前台变化；失败卡片始终保留错误说明，并忽略失败回执中的窗口标题。
- 状态条加宽以完整显示回执标题，悬停可查看完整状态；“正在暂停”时按钮明确为“取消暂停”，暂停或停止时不混入上一条回执说明。
- 全局停止尚未结束时，新加入的电脑操作也会取消，不会在停止按钮不可用时继续派发。参与任务结束后，新一轮操作可正常启动。

## 安装与构建

当前发布是实验性源码及预构建插件包。验证环境为 Windows x64、DSH `0.1.7-rc.2`；未承诺所有新版 DSH 兼容。需要 Node.js 22+、.NET Framework 4.x，以及支持 agent 工具事件的 DSH 宿主。Electron 会作为依赖下载，需要网络；不要绕过你所在环境的安装脚本策略。

先安装并验证 Wincu 或兼容的 Cua 后端，再安装状态插件。状态插件不提供 API 密钥或后端配置。

### 从源码构建

在 PowerShell 7 中执行：

```powershell
git clone https://github.com/xut1021/dsh-computer-use-status.git
cd dsh-computer-use-status
npm ci
npm test
npm pack
```

`npm ci` 的 prepare 阶段会构建 React 界面、DSH 对话客户端和两个 C# 辅助程序。构建产物不需要从作者个人目录复制。源码仓库不提交 Electron 二进制。

在已配置好正确 DSH_HOME 的 DSH CLI 中，使用**实际使用的 profile**安装：

```powershell
# desktop 是示例；如果你的实际 profile 名称不同，请替换它。
dsh plugin --profile desktop add (Resolve-Path ./dsh-computer-use-status-0.1.3.tgz).Path
```

已发布的旧版本可从 Releases 下载 tgz；0.1.3 可按上面的命令从源码构建，本次未创建新的 Release。不要为了安装创建第二个同时使用同一 profile 的 DSH 实例。安装或升级插件后正常退出并重新打开 DSH；之后修改主题无需重启。在插件管理界面禁用/移除本插件，再正常重启即可卸载；不会删除会话。

首次验收建议让模型只调用一次窗口列表和短等待，检查状态条是否随操作出现、卡片是否返回结果，再测试暂停/停止。只看到插件列表项不代表全部链路已经正常。

## 暂停、停止分别意味着什么？

- **暂停**：阻止下一次工具派发。已有动作在执行时显示“正在暂停”，不能把它说成物理输入已经停止。
- **停止 / Esc**：请求参与会话的 `agent.cancel`，取消后续调度。已经发出的动作可能仍需完成收尾。
- **Wincu 补丁**：可中断等待/读取，取消排队请求；已发出的输入先完成收尾，再回收 worker，避免中途留下按下的鼠标或按键。
- **Cua**：本插件能够发出取消请求，但没有证明其所有底层动作能立即中断。

后端修复**不会随状态插件自动打入**。需要它们时，先阅读 [补丁与验证说明](patches/README.md)，在隔离副本验证，或等待上游吸收。

## 我们修复了什么？

| 问题 | 处理 | 范围 |
| --- | --- | --- |
| 停止请求返回后，Wincu 的等待仍占着后端 | 消费取消通知、管理队列，按动作类型结束 worker | 后端补丁 |
| 旧 worker 的退出事件误伤替代 worker 的请求 | 缓冲区、请求和退出处理绑定 worker 实例 | 后端补丁 |
| 本机 UIA 桌面根节点枚举卡住 | Win32 EnumWindows 枚举顶层窗口，后续控件仍走 UIA；校验 HWND/PID | 本机复现，后端补丁 |
| 部分 Win32 控件缺少可用 UIA pattern | 显式注册客户端 provider | Windows/.NET 兼容补丁 |
| Windows 拒绝部分输入却仍可能返回成功 | 检查定位和鼠标输入返回值，文本粘贴前检查输入桌面 | 局部改进，不等于所有输入路径全面验证 |
| 状态条因宿主 stdin 提前关闭而退出 | 改用随机本机命名管道 | 本插件自身修复，不归咎于 Wincu 作者 |

补丁基于上游 **0.2.2 / `1a826745f08734f01d8440c2c4bbb3483ac78263`** 整理，保留上游新增的激活逻辑、工具 schema 和动态版本号，不以本机旧版覆盖上游新版。

## 验证与边界

- 0.1.3 本地验证：63 项本插件测试、3 项官方 DSH 宿主测试及 1 项真实 dsh-cua 集成测试通过，均无跳过。详细环境和限制见 [VALIDATION.md](VALIDATION.md)。
- 独立 Electron 窗口渲染两套真实 HUD，检查六种回执标题、暂停/继续及停用按钮、角色动画及减少动态效果，并在同一窗口来回切换主题。切换测试短暂显示自己的窗口以匹配正式浮层的渲染条件；不启动输入辅助程序，不等于安装后的设置页验收。
- Electron 命名管道测试启动真实 runtime；光标在测试副本中使用隔离的替身，避免占用用户正在使用的全局光标租约。
- 之前在本机安装版实测过：发现专用测试窗口、写入字段、调用按钮、读回结果；点击状态条停止长等待，再发起新的短等待成功。这是历史本机验收，不代表本次公开包在所有电脑上都已验证。
- 多显示器/混合缩放、物理 Esc 全链路、物理拖动途中停止、所有应用类型：**未完成全面验收**。
- 原生 Codex CU 的 Edge URL 判定故障不属于本仓库；**没有修复或绕过该检查**。
- 独立 Electron 浮层有额外资源开销；截图隐藏效果依赖系统与截图方式。没有“绝不进入任何截图”的承诺。

可选宿主测试需要自行准备构建好的 DSH 源码：

```powershell
$env:DSH_STATUS_TEST_REPO = 'D:/src/deepseek-harness'
npm run test:host
```

真实 dsh-cua 验收有独立入口，需要可交互的 Windows 桌面、已构建的 DSH 源码和装有 `dsh-cua==0.4.0` 的 Python 环境。它会创建并操作自己的 WinForms 测试窗口：

```powershell
$env:DSH_STATUS_TEST_REPO = 'D:/src/deepseek-harness'
$env:DSH_CUA_PYTHON = 'D:/venvs/dsh-cua/Scripts/python.exe'
New-Item -ItemType Directory -Force ./work | Out-Null
$fixture = (Resolve-Path ./tests/fixtures/CuaTarget.cs).Path
$env:DSH_CUA_TEST_TARGET = Join-Path (Resolve-Path ./work).Path 'CuaTarget.exe'
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:exe /platform:x64 /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/out:$env:DSH_CUA_TEST_TARGET" $fixture
if ($LASTEXITCODE -ne 0) { throw 'Could not compile the owned test window' }
npm run test:host:dsh-cua
```

缺少任一必要环境变量时此入口明确失败，不会以跳过测试代替验收通过。它覆盖 UIA `set_value`、`press` 及结果读回、重复填入相同值时的未生效回执，以及真实工具派发计数下的暂停/恢复/派发前停止。`npm test` 和 `ci/windows-tests.example.yml` 不运行该桌面测试；该 YAML 仍是示例，不是已启用的 GitHub Actions 工作流。

## 数据与安全边界

浮层仅接收筛选后的动作、窗口标题、状态和坐标；不复制输入正文、控件文本、截图或原始错误。窗口标题也可能含隐私，录屏/直播前自行判断。对话卡片只通过宿主授权的附件加载接口读取截图。

renderer 禁用 Node 集成，启用 sandbox/context isolation；控制通道使用本机随机命名管道，没有新增 TCP 服务。光效层穿透鼠标，状态条有明确控制按钮。临时替换标准系统光标时，由独立监护进程负责恢复；应用自定义光标不在此机制内。

## 开源与反馈

代码采用 MIT；上游署名、许可证及角色素材来源见 [THIRD_PARTY.md](THIRD_PARTY.md)。这是独立社区项目，与 DeepSeek、OpenAI、Microsoft、Apple 无官方隶属关系。

欢迎提供能复现的问题、版本及脱敏日志。项目按现状提供，不承诺持续维护、响应时限或“比某个模型更强”。发布与整理过程中使用了 AI 辅助开发；测试范围和未验证边界如上。
