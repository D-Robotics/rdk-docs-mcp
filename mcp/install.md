# 安装 RDK 文档检索（MCP + Skill）

你是安装助手。用户把本文档交给你，是要你**立刻装好**，不要只复述配置。

这是一个 Plugin 盒子：MCP 提供工具，Skill 规定用法。不要 `git clone` 任何仓库。源码仓库可以是 private 的，安装物来自 npm。

## 成功标准

1. 当前客户端能启动名为 `rdk-docs` 的 MCP（`list_manuals` / `search_docs` / `get_page` / `list_toc`）。
2. 当前客户端的 skills 目录里有 `rdk-docs/SKILL.md`。
3. 你向用户回报写过的路径，并提醒重载 MCP / 重启会话后再问板端问题。

## 一、前置

需要本机 Node.js 20+。没有就先装，再继续。无需 Token、无需登录 GitHub。

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
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/skills/rdk-docs/SKILL.md` |
| ZCode | `~/.zcode/cli/config.json` 的 `mcp.servers.rdk-docs` | `~/.zcode/skills/rdk-docs/SKILL.md` 和 `~/.agents/skills/rdk-docs/SKILL.md` |
| Claude Code | （Skill） | `~/.claude/skills/rdk-docs/SKILL.md` |
| Codex | （Skill） | `~/.codex/skills/rdk-docs/SKILL.md` |

已有其它 MCP / Skill 会保留，只覆盖 `rdk-docs` 这一项。MCP 指向 `npx -y rdk-docs-mcp@latest`，之后发新版本，**下次启动 MCP** 会跟到 latest。

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
- VS Code / Copilot：用户 `mcp.json` 的 `servers` 字段，内容同上（`command` / `args`）
- Claude Desktop：`~/Library/Application Support/Claude/claude_desktop_config.json` 的 `mcpServers`

Skill 从同一包拉取后写入对应目录（覆盖同名文件）：

```bash
mkdir -p "$HOME/.cursor/skills/rdk-docs"
curl -fsSL https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/SKILL.md \
  -o "$HOME/.cursor/skills/rdk-docs/SKILL.md"
```

按当前客户端把目标目录换成第二节表格里的路径。jsDelivr 不可用时改用：

`https://unpkg.com/rdk-docs-mcp@latest/SKILL.md`

## 四、装完自检

能调 MCP 的话，跑一次 `list_manuals`，确认返回里有 `rdk-x` / `rdk-s` / `forum`。

然后告诉用户可以这样问：

- RDK X5 怎么把系统镜像烧到 SD 卡？
- S100 如何烧录镜像？
- 看下 RDK 有哪些案例可以参考

回答时先 `search_docs`。若命中带 `role=official-start`，先 `get_page` 打开这一条。手册是规范，论坛只作补充。

## 五、更新

用户以后仍给**同一句话、同一个 URL**。

- MCP 配置保持 `@latest`，**下次启动 MCP** 会拉新工具。
- 已经装过的 `rdk-docs/SKILL.md` 也会在 **MCP 启动时** 用当前包里的 Skill 覆盖。你发新版本后，用户只要重启 Agent / 重载 MCP，工具和用法说明一起更新。
- 第一次安装、或某客户端还没有 Skill 时，仍跑第二节的 `--install`。启动时不会往没装过的客户端里新建 Skill。

不要让用户改 JSON。
