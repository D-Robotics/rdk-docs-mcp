# 安装 RDK Assistant MCP（官方资料 + Skill 发现）

你是安装助手。用户把本文档交给你，是要你**立刻装好**，不要只复述配置。

这是一个 Plugin 盒子：MCP 提供工具，Skill 规定用法。不要 `git clone` 任何仓库。源码仓库可以是 private 的，安装物来自 npm。

## 成功标准

1. 当前客户端能启动配置 id 为 `rdk-docs`、显示名为 RDK Assistant MCP 的服务，`get_status` 返回当前版本和能力，`list_manuals` 正常。保留原 npm 包名与配置名，不新建重复服务。
2. 当前客户端的 skills 目录里有全部三个 bundled skill：`rdk-docs`（文档检索）、`forum-post`（论坛发帖）、`article-writer`（成文与配图），各一份 `SKILL.md`。
3. 你向用户回报写过的路径，并提醒重载 MCP / 重启会话后再问板端问题。

## 一、前置

需要本机 Node.js 20+。没有就先装，再继续。无需 Token、无需登录 GitHub。

可选：`forum-post` skill 的浏览器路线需要 agent-browser CLI（`npm i -g agent-browser && agent-browser install`）；只查文档不发帖可以不装。

```bash
node -v
```

## 二、一条命令装完（优先）

```bash
npx -y rdk-docs-mcp@latest --install
```

它会按本机已有客户端写入：

| 客户端 | MCP | Skill |
|--------|-----|--------|
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/skills/<skill>/SKILL.md` |
| ZCode | `~/.zcode/cli/config.json` 的 `mcp.servers.rdk-docs` | `~/.zcode/skills/<skill>/SKILL.md` 和 `~/.agents/skills/<skill>/SKILL.md` |
| Claude Code | （Skill；MCP 需按第三节手动 `claude mcp add`，装完自检会提示） | `~/.claude/skills/<skill>/SKILL.md` |
| Codex | `~/.codex/config.toml` 的 `[mcp_servers.rdk-docs]` | `~/.codex/skills/<skill>/SKILL.md` |
| DeepSeek Harness | `~/.dsh/cordis.patch.yml` 挂 `@deepseek-ai/dsh-mcp-client` | `~/.dsh/skills/<skill>/SKILL.md` 和 `~/.agents/skills/<skill>/SKILL.md` |

`<skill>` 为 `rdk-docs`、`forum-post`、`article-writer` 三个，每个目录各写一份 `SKILL.md`。

已有其它 MCP / Skill 会保留；Cursor、ZCode 和 Codex 已有可用的 `rdk-docs` 配置会保留，安装器会报告需要保留的自定义启动项。缺失的配置使用 `npx -y rdk-docs-mcp@latest`。上述三个同名 Skill 会更新。固定路径/版本需要针对实际安装更新，不能把“保留配置”当作“已经升级”。

把命令的 stdout 原样给用户。然后提醒：**重载窗口或重启 Agent**，本会话里刚写入的 MCP 可能还没挂上。

## 三、安装器不可用时再手写

只在 `--install` 失败时做。把下面片段**合并**进当前客户端配置，不要覆盖整个文件。

```json
{
  "mcpServers": {
    "rdk-docs": {
      "command": "npx",
      "args": ["-y", "rdk-docs-mcp@latest"]
    }
  }
}
```

各客户端路径：

- Cursor：`~/.cursor/mcp.json`（字段 `mcpServers`）
- ZCode：`~/.zcode/cli/config.json` → `mcp.servers.rdk-docs`，并加上 `"type": "stdio"`
- Claude Code：`claude mcp add --scope user --transport stdio rdk-docs -- npx -y rdk-docs-mcp@latest`
- Codex：`codex mcp add rdk-docs -- npx -y rdk-docs-mcp@latest`，或合并进 `~/.codex/config.toml`：

```toml
[mcp_servers.rdk-docs]
command = "npx"
args = ["-y", "rdk-docs-mcp@latest"]
```
- VS Code / Copilot：用户 `mcp.json` 的 `servers` 字段，内容同上（`command` / `args`）
- Claude Desktop：`~/Library/Application Support/Claude/claude_desktop_config.json` 的 `mcpServers`
- DeepSeek Harness：合并进 `~/.dsh/cordis.patch.yml`（机器级，对所有 profile 生效）：

```yaml
- insert:
    - id: mcp-rdk-docs
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rdk-docs
        transport: stdio
        command: npx
        args: ['-y', 'rdk-docs-mcp@latest']
```

然后重启 Harness。工具名是 `mcp__rdk-docs__search_docs` 这类带前缀的名字。

Skill 从同一包拉取后写入对应目录（覆盖同名文件），三个 skill 都要拉：

```bash
for s in rdk-docs forum-post article-writer; do
  mkdir -p "$HOME/.cursor/skills/$s"
  curl -fsSL "https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/skills/$s/SKILL.md" \
    -o "$HOME/.cursor/skills/$s/SKILL.md"
done
```

按当前客户端把目标目录换成第二节表格里的路径。jsDelivr 不可用时改用：

`https://unpkg.com/rdk-docs-mcp@latest/skills/<skill>/SKILL.md`

## 四、装完自检

能调 MCP 的话，先调用 `get_status`，确认 `structured_skill_search`、`skill_content` 和 `document_continuation` 能力。若没有 `get_status` 或新字段，当前连接仍是旧版；检查配置实际启动的程序路径并更新、重启，不能仅凭安装命令成功认定升级完成。然后跑一次 `list_manuals`，确认返回里有 `rdk-x` / `rdk-s`。手册目录里没有论坛；社区经验用 `search_docs` 带 `source=forum` 检索。若报告里出现「No MCP client configuration was written」，说明当前客户端还要按第三节手动注册 MCP，装完不算完成。

然后告诉用户可以这样问：

- RDK X5 怎么把系统镜像烧到 SD 卡？
- S100 如何烧录镜像？
- 看下 RDK 有哪些案例可以参考

回答时先 `search_docs`。若命中带 `role=official-start`，先 `get_page` 打开这一条。手册是规范，论坛只作补充。

## 五、更新

用户以后仍给**同一句话、同一个 URL**。

- 默认 MCP 配置使用 `@latest`；固定版本或固定安装路径需要更新对应安装。以重启后的 `get_status` 为准，不能以另一个临时 `npx --doctor` 的版本代替当前连接版本。
- 已经装过的各个 skill 的 `SKILL.md` 也会在 **MCP 启动时** 用当前包里的同名 Skill 覆盖。你发新版本后，用户只要重启 Agent / 重载 MCP，工具和用法说明一起更新。
- 第一次安装、或某客户端还没有 Skill 时，仍跑第二节的 `--install`。启动时不会往没装过的客户端里新建 Skill。

不要让用户改 JSON。

命令行诊断：`npx -y rdk-docs-mcp@latest --doctor` 只看当前诊断进程的能力；追加 `--check-catalog` 检查目录。诊断不写客户端配置，也不刷新用户 Skill。
