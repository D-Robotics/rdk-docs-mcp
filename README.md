# RDK Docs

给各类 AI Agent 用的 [D-Robotics RDK 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 检索插件。

模型自己记不住板端手册里的烧录步骤、接口名和版本号。这个仓库把官方文档变成 **MCP 工具 + Skill**：Agent 先搜手册，再打开原文回答，并带上可点击链接。

适用于 Cursor、Claude Code、Claude Desktop、VS Code Copilot，以及任何支持 [MCP](https://modelcontextprotocol.io/) 的 Agent。

## 价值和功能

**解决什么问题**

- 问「X5 怎么烧录 / TROS 某节点怎么启 / XBurn 支持哪些板」时，不再靠过期训练数据。
- 同一套能力可以装进不同 Agent，不用为每个 IDE 重写爬虫。

**四个工具**

| Tool | 做什么 |
|------|--------|
| `list_manuals` | 列出资料中心已上架手册（X/S 系列、TROS、Model Zoo、Studio、XBurn、OE、X5 SDK 等） |
| `search_docs` | 中英文关键词检索。可限定手册：`x5` / `s100` / `tros` / `studio` / `xburn` … |
| `get_page` | 把一页官方文档收成 Markdown |
| `list_toc` | 列出某一本手册的页面目录 |

**Skill `rdk-docs`**

规定 Agent：**先搜再打开页面**，用手册原文回答，必须附官方 URL；手册没写就说没写，不编命令和版本号。

**不覆盖**

- `oe-s` / `oe-llm-*` 没有公开搜索索引，只能打开首页再顺着链接读。
- 旧版资料 `https://developer.d-robotics.cc/information` 不在索引里。
- 不需要登录，也不写入文档站。

---

## 其他 Agent 怎么用

核心就两件事，按你的 Agent 选一条路即可：

1. **装 MCP Server**（让 Agent 真的能搜、能拉页）
2. **装 Skill**（让 Agent 知道何时搜、按什么顺序用工具）

两条都装，效果最好。只装 MCP 也能搜；只装 Skill 没有工具，等于只有说明书。

先 clone 一次，后面所有 Agent 共用这一份：

```bash
git clone https://github.com/QiaolongLi1201/rdk-docs.git
cd rdk-docs/mcp && npm install && npm run build
```

`mcp/bin/run.sh` 在缺依赖或缺构建产物时会自动 `npm install` / `npm run build`。需要 Node.js 20+。

把下面的 `<REPO>` 换成你本机的绝对路径，例如 `/Users/you/rdk-docs`。

### Cursor

**方式 A：当本地 Plugin 装（MCP + Skill 一次到位）**

本仓库符合 [Agent Plugins](https://agent-plugins.org/)：根目录有 `plugin.json`、`mcp.json`、`skills/`。

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn <REPO> ~/.cursor/plugins/local/rdk-docs
```

然后 **Developer: Reload Window**。Customize 里应出现 `rdk-docs` 的 MCP 和 Skill。

**方式 B：只挂 MCP**

把 `examples/cursor.mcp.json` 里的路径改成你的 `<REPO>`，合并进：

- 用户级：`~/.cursor/mcp.json`
- 或某个项目：`.cursor/mcp.json`

**方式 C：只挂 Skill**

```bash
mkdir -p ~/.cursor/skills
ln -sfn <REPO>/skills/rdk-docs ~/.cursor/skills/rdk-docs
```

项目内也可以放 `.cursor/skills/rdk-docs`。Cursor 还会读 `~/.claude/skills/` 和 `~/.codex/skills/`。

团队若有 Cursor Team Marketplace，可以把本 Git 仓库导入为团队插件，同事一键安装。

### Claude Code

**MCP（推荐，装到当前用户，所有项目可用）**

```bash
claude mcp add --scope user --transport stdio rdk-docs -- <REPO>/mcp/bin/run.sh
claude mcp list
```

或把 `examples/claude.mcp.json` 合并进项目根的 `.mcp.json`（`--scope project`），和仓库一起提交，同事打开项目即可用。

**Skill**

```bash
mkdir -p ~/.claude/skills
ln -sfn <REPO>/skills/rdk-docs ~/.claude/skills/rdk-docs
```

### Claude Desktop

编辑 Claude Desktop 的 MCP 配置（macOS 一般是 `~/Library/Application Support/Claude/claude_desktop_config.json`），合并 `examples/claude-desktop.json`，把路径换成 `<REPO>`，然后重启 Desktop。

Skill：同样 symlink 到 `~/.claude/skills/rdk-docs`。

### VS Code / GitHub Copilot

在用户或工作区 `mcp.json` 里加入 `examples/vscode.mcp.json` 那一段（VS Code 用 `servers` 字段）。需要已开启 Copilot Agent / MCP。

Skill 不是 VS Code 的一等概念；把 `skills/rdk-docs/SKILL.md` 写进项目的 `.github/copilot-instructions.md` 或仓库 `AGENTS.md` 即可。

### 任意 MCP Client

只要能拉起本地 stdio 进程：

```text
command: <REPO>/mcp/bin/run.sh
```

或：

```text
command: node
args:    [<REPO>/mcp/dist/index.js]
```

第二种需要先 `cd mcp && npm install && npm run build`。

然后再把 `skills/rdk-docs/SKILL.md` 拷到该 Agent 的 skills 目录（Cursor / Claude / Codex 都认 `SKILL.md` 开放标准）。

---

## 给 Agent 的使用约定

用户问 RDK / TROS / 烧录 / 量化等问题时：

1. `search_docs`（能确定产品就带 `manual`，如 `x5`、`tros`、`xburn`）
2. 对 1–2 个命中 URL 调用 `get_page`
3. 用原文回答，并附上 `https://developer.d-robotics.cc/...` 链接

不要凭记忆编 `apt` 包名、镜像版本或管脚复用。

---

## 开发

```bash
cd mcp
npm install
npm test
npm run build
```

索引缓存：`~/.cache/rdk-docs-mcp`（可用 `RDK_DOCS_CACHE_DIR` 覆盖），TTL 24 小时。

契约见 `SPEC-rdk-docs.md`。MCP / Plugin / Skill 三者关系见 `mcp-plugin-skill.md`。

## 许可与来源

文档内容版权归 [D-Robotics 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 原站。本仓库只提供检索与阅读适配，不镜像整站。
