# Clawd Companion 插件开发教程

> 这份内容可复制到 GitHub Wiki，用作插件开发页面。

## 1. 插件是什么

Clawd Companion 插件是一个本地 Node.js 脚本。应用在收到 Claude Code 事件时，会把事件 JSON 通过 stdin 传给插件脚本。

插件可以用于：

- 任务完成后通知其他工具
- 错误事件记录
- 根据工具调用做本地自动化
- 把事件同步到你自己的系统

插件拥有本机脚本执行能力，所以应用内市场安装后默认 **不信任、不启用**。用户必须手动信任并启用插件。

## 2. 最小插件

创建目录：

```text
plugin-market/plugins/my-plugin/
  index.js
  index.manifest.json
```

`index.js`：

```js
#!/usr/bin/env node

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const event = JSON.parse(input || "{}");
  console.log(`[My Plugin] ${event.event}: ${event.title}`);
});
```

`index.manifest.json`：

```json
{
  "name": "My Plugin",
  "description": "Logs Clawd events to stdout.",
  "events": ["done", "error"],
  "permissions": ["event"],
  "timeoutMs": 3000
}
```

## 3. 事件字段

常用字段：

```ts
interface CompanionEvent {
  id: string;
  source: "claude-code" | "cc-haha" | "manual";
  event: "session_start" | "prompt_submit" | "tool_start" | "tool_end" | "notification" | "permission_wait" | "done" | "error" | "heartbeat" | "git_operation";
  sessionId?: string;
  clientLabel?: string;
  tool?: string;
  cwd?: string;
  title: string;
  message: string;
  detail?: string;
  timestamp: number;
}
```

## 4. 权限声明

Manifest 里的 `permissions` 用于告诉用户插件想做什么：

- `event`：读取事件 JSON。
- `network`：访问外部网络。
- `filesystem`：读写本地文件。
- `shell`：执行命令或启动子进程。

权限声明不是沙箱，但必须诚实填写。不要声明不需要的权限。

## 5. 市场索引

把插件加入 `plugin-market/index.json`：

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Logs selected Clawd events.",
  "author": "Your Name",
  "version": "1.0.0",
  "entry": "plugins/my-plugin/index.js",
  "manifest": "plugins/my-plugin/index.manifest.json",
  "events": ["done", "error"],
  "permissions": ["event"],
  "tags": ["example"]
}
```

要求：

- `id` 使用小写 kebab-case。
- `entry` 和 `manifest` 必须在 `plugin-market/plugins/<id>/` 下。
- 插件代码应尽量短小、容易审查。
- 版本号使用语义化版本。

## 6. 调试方式

在应用内安装插件后：

1. 打开插件管理。
2. 找到插件。
3. 确认事件和权限。
4. 手动打开 Trusted。
5. 手动打开 Enabled。
6. 触发对应 Claude Code 事件。
7. 查看 Recent runs 中的 stdout/stderr、退出码和耗时。

## 7. 安全要求

插件不得：

- 悄悄上传用户 prompt、token、文件内容或路径。
- 隐藏网络请求。
- 执行破坏性命令。
- 后台长期运行。
- 规避 Clawd Companion 的超时或信任提示。

如果插件需要网络、文件系统或 shell 权限，PR 说明里必须解释原因。

## 8. 提交流程

1. Fork 仓库。
2. 在 `plugin-market/plugins/<id>/` 添加插件。
3. 更新 `plugin-market/index.json`。
4. 本地运行测试和构建。
5. 提交 PR。
6. PR 说明包含：
   - 插件用途
   - 触发事件
   - 权限原因
   - 是否访问网络或本地文件

维护者会拒绝权限过宽、行为不透明或难以审查的插件。
