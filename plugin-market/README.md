# Clawd Companion Plugin Market

This folder is the source of the in-app plugin market. The app loads `plugin-market/index.json` from this GitHub repository and lets users install listed plugins into their local Clawd Companion plugin directory.

Installed market plugins are **not trusted or enabled by default**. Users must explicitly trust and enable them in the app because plugins execute local Node.js code.

## Market index

Add your plugin to `plugin-market/index.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What the plugin does.",
  "author": "Your Name",
  "version": "1.0.0",
  "entry": "plugins/my-plugin/index.js",
  "manifest": "plugins/my-plugin/index.manifest.json",
  "events": ["done", "error"],
  "permissions": ["event"],
  "tags": ["notification"]
}
```

Rules:

- `id` must be lowercase kebab-case and unique.
- `entry` and `manifest` must stay inside `plugin-market/plugins/<id>/`.
- `version` should follow semantic versioning.
- Keep plugins small and easy to review.

## Manifest

Each plugin needs `<entry-name>.manifest.json` next to the script:

```json
{
  "name": "My Plugin",
  "description": "Short explanation shown in the app.",
  "events": ["done", "error"],
  "permissions": ["event", "network"],
  "timeoutMs": 3000
}
```

Supported permissions:

- `event` — reads the Clawd event JSON from stdin.
- `network` — intends to call external HTTP APIs.
- `filesystem` — intends to read/write local files.
- `shell` — intends to spawn child processes or run shell commands.

Permissions are a declaration for user review, not a sandbox. Do not request permissions you do not need.

## Runtime contract

Plugins are Node.js scripts. Clawd Companion runs them as:

```bash
node path/to/plugin.js
```

The current event is passed through stdin as JSON:

```js
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  console.log(event.event, event.title);
});
```

Useful event fields:

- `event`: event type, such as `done`, `error`, `tool_start`.
- `tool`: tool name when available.
- `title`, `message`, `detail`: display text.
- `sessionId`, `cwd`, `clientLabel`: session context when available.
- `timestamp`: event time in milliseconds.

The app also sets environment variables:

- `CLAWD_PLUGIN_EVENT`
- `CLAWD_PLUGIN_PERMISSIONS`

## Safety guidelines

- Never collect secrets, tokens, prompts, or file contents unless the user clearly opted in.
- Avoid long-running work; default timeout is 3 seconds.
- Print useful stdout/stderr for debugging.
- Fail safely and never block Claude Code.
- Do not hide network calls or shell execution.

## Submitting a plugin

1. Create `plugin-market/plugins/<your-plugin-id>/`.
2. Add `index.js` and `index.manifest.json`.
3. Add an entry to `plugin-market/index.json`.
4. Test locally by installing from the in-app market.
5. Open a pull request explaining what the plugin does and why it needs each permission.

The maintainers may reject plugins that are hard to review, request excessive permissions, or behave unexpectedly.
