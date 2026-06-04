# Clawd Companion 项目指南

## 发布流程

当用户说"提交release"或类似表述时，自动执行以下流程：

1. **版本号递增**：将 `package.json` 和 `package-lock.json` 中的版本号 patch +1（如 `1.3.2` → `1.3.3`）
   - 如果用户主动指定了版本号（如"发布1.4.0"），则使用用户指定的版本
   - 永远不要覆盖已有的 GitHub Release
2. **构建**：运行 `npm run dist` 生成安装包
3. **文件重命名**：将生成的 exe 和 blockmap 文件名从空格格式改为连字符格式（如 `Clawd Companion Setup 1.3.3.exe` → `Clawd-Companion-Setup-1.3.3.exe`），以匹配 `latest.yml` 中的文件名
4. **提交推送**：git add → commit → tag → push（tag 格式 `v{版本号}`）
5. **创建 Release**：使用 `gh release create` 创建新 Release，上传 exe、blockmap 和 latest.yml

## 版本号规则

- 当前版本存储在 `package.json` 的 `version` 字段
- 每次发布自动 patch 递增，除非用户明确指定
- `latest.yml` 中的文件名必须与上传到 Release 的文件名完全一致

## Release 文件命名规范

- **上传到 GitHub Release 的文件**必须使用连字符格式：`Clawd-Companion-Setup-{版本号}.exe`
- **electron-builder 生成的文件**使用空格格式：`Clawd Companion Setup {版本号}.exe`
- **必须在构建后重命名**：exe 和 blockmap 文件都需要从空格格式改为连字符格式
- **latest.yml** 中的文件名必须与重命名后的文件名完全一致

## 构建命令

- `npm run build` — 编译 TypeScript + Vite 构建
- `npm run dist` — 构建 + electron-builder 打包
- `npm run dist:validate` — 校验 latest.yml 文件名一致性
