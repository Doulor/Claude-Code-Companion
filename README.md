<div align="center">

# Clawd Companion

**Claude Code 桌宠伴侣 — 透明桌宠窗口实时显示工具调用、会话状态和完成提醒。**

![GitHub all releases](https://img.shields.io/github/downloads/Doulor/Clawd-Companion/total?label=downloads)
![GitHub release](https://img.shields.io/github/v/release/Doulor/Clawd-Companion)
![License](https://img.shields.io/github/license/Doulor/Clawd-Companion)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)

[English](./README.en.md) · [安装](#安装) · [功能](#功能) · [开发](#开发) · [Star History](#star-history)

</div>

## 预览

<div align="center">
  <img src="README-ICON/thinking.png" width="340" alt="Clawd 正在思考" />
  &nbsp;
  <img src="README-ICON/thinking-card.png" width="240" alt="会话开始通知卡片" />
</div>

<div align="center">
  <img src="README-ICON/edit-tool.png" width="340" alt="Clawd 工作中 — Edit 工具" />
</div>

<div align="center">
  <img src="README-ICON/done.png" width="220" alt="Clawd 完成" />
  &nbsp;
  <img src="README-ICON/error.png" width="220" alt="Clawd 出错" />
</div>

## 目录

- [预览](#预览)
- [功能](#功能)
- [安装](#安装)
- [使用](#使用)
- [开发](#开发)
- [版本与发布](#版本与发布)
- [技术栈](#技术栈)
- [贡献](#贡献)
- [License](#license)
- [Star History](#star-history)

## 功能

### 核心体验

- 🪟 **透明桌宠窗口**，始终置顶，支持拖拽和边界限制。
- 🔌 **本地事件服务**：HTTP + WebSocket 接收 Claude Code hooks 事件。
- 📡 **Hook forwarder**：自动转发 `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Notification` / `Stop`。
- 🔄 **自动更新**：基于 GitHub Releases，启动时静默检查，一键安装。
- 🎬 **动作动画映射**：为每个工具/事件自定义 Clawd 精灵动画。
- 📊 **运行统计**：工具调用排行、会话数、权限统计、活跃时段等深度数据持久化。
- 💾 **配置导入/导出**：一键导出或导入 JSON 配置。

### 完成与错误提醒

完成和错误状态会用专属动画高亮，配合气泡/卡片反馈，立刻知道结果。

### Git 状态感知

实时监听项目 `.git` 变更，`commit` / `checkout` / `merge` 等操作以胶囊浮窗形式即时提示，不打断工作流。

### Token 用量看板

扫描 `~/.claude/projects` 下的会话数据：

- 今日 / 30 天 / 累计 Token 汇总
- 近 12 个月按月日历热力图
- 按模型拆分的 Token 排行（默认 Top 5，可展开查看全部）

### 音效系统

可配置的事件触发音效，支持内置和自定义 `WAV / MP3 / OGG / FLAC`：

- 完成、错误、权限请求、会话开始 4 种触发事件
- 每个事件可独立开关
- 基于 HTML5 Audio API，无需外部依赖

### Claude Code 启动时自动启动

默认**关闭**。在「设置 → 应用行为」中开启「Claude Code 启动时自动启动」后，每次 `SessionStart` 都会自动唤起 Clawd Companion：

- 主程序已运行 → 复用现有实例。
- 主程序未运行 → 开发模式 `npm start`，生产模式启动安装目录下的 exe。

环境变量覆盖（高级用户）：

```bash
CLAWD_COMPANION_AUTOSTART=1   # 强制开启
CLAWD_COMPANION_AUTOSTART=0   # 强制关闭
```

## 安装

1. 从 [Releases](https://github.com/Doulor/Clawd-Companion/releases) 下载最新安装包。
2. 双击 `Clawd-Companion-Setup-*.exe` 完成安装。
3. 启动 Clawd Companion，打开配置面板。
4. 点击「一键安装」自动配置 Claude Code hooks。
5. 重新打开 Claude Code 会话，即可看到 Clawd 实时响应。

> 需要 Windows 10 / 11，Node.js 22+ 仅在开发模式需要。

## 使用

启动后 Clawd 默认以透明桌宠形式停留在屏幕上，主要操作都在右键菜单和设置面板中完成。

| 区域 | 能力 |
| --- | --- |
| 右键菜单 | 显示/隐藏桌宠、打开设置、退出 |
| 设置 → 外观 | 主题（经典 / 液态玻璃）、尺寸、缩放、透明度 |
| 设置 → 行为 | 自动启动 Claude Code、动画映射、音效、通知规则 |
| 设置 → 数据 | 事件历史、运行统计、Token 用量、导入/导出 |
| 设置 → 插件 | 启用插件、查看权限与日志 |
| 编辑模式 | 在桌宠上直接拖动 Clawd 和气泡/卡片/工具条 |

更多细节见 [`CLAUDE.md`](./CLAUDE.md) 中的「Claude Code 启动时自动启动本应用」一节。

## 开发

```bash
# 克隆
git clone https://github.com/Doulor/Clawd-Companion.git
cd Clawd-Companion

# 安装依赖
npm install

# 开发模式（Electron + Vite 热更新）
npm run dev:electron

# 构建
npm run build

# 打包为安装程序
npm run dist

# 校验 latest.yml 文件名一致性
npm run dist:validate

# 类型检查
npm run typecheck

# 单元测试
npm test

# 统计 GitHub Release 下载量
npm run downloads
```

### 项目结构

```
.
├── apps/
│   ├── desktop/                # Electron 主进程 + 设置面板
│   └── hook-forwarder/         # Node.js CLI，转发 hooks 到本地事件服务
├── scripts/                    # 版本、校验、下载统计、lint 等工具
├── src/                        # 桌宠渲染层（React + Vite）
├── build/                      # 图标与安装器资源
├── plugin-market/              # 插件市场
├── release/                    # electron-builder 输出（已加入 .gitignore）
└── CLAUDE.md                   # 项目级 Claude Code 指引
```

## 版本与发布

```bash
npm run version:patch   # 递增 patch（1.5.2 → 1.5.3）
npm run version:minor   # 递增 minor（1.5.2 → 1.6.0）
npm run version:major   # 递增 major（1.5.2 → 2.0.0)
```

发布流程见 [`CLAUDE.md`](./CLAUDE.md)：

- 推送 `v*.*.*` tag → CI 自动构建、产物重命名、发布到 GitHub Releases。
- 手动发布：`npm run dist`，再 `gh release create`。

## 技术栈

- Electron + React + TypeScript + Vite
- `electron-updater` 自动更新（GitHub Releases）
- 本地 HTTP + WebSocket 事件服务
- Claude Code hooks 转发器（Node.js CLI，44 项单元测试）
- `electron-builder` NSIS 安装包

## 持续集成

- **CI**（`.github/workflows/ci.yml`）：push / PR 自动运行 typecheck + 单元测试
- **Release**（`.github/workflows/release.yml`）：推送 `v*.*.*` tag 自动构建、产物重命名、发布到 GitHub Releases

## 贡献

欢迎 Issue、PR 和功能建议。提交 PR 前请：

1. `npm run typecheck` 通过
2. `npm test` 通过
3. `npm run lint` 通过
4. 保持修改最小聚焦，避免无关重构

## License

[MIT](./LICENSE) © Doulor

## Star History

<a href="https://www.star-history.com/#Doulor/Clawd-Companion&type=Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Doulor/Clawd-Companion&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Doulor/Clawd-Companion&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Doulor/Clawd-Companion&type=Date" />
  </picture>
</a>
