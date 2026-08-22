# RDK Docs

给各类 AI Agent 用的 [D-Robotics RDK 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 检索插件。

模型自己记不住板端手册里的烧录步骤、接口名和版本号。这个仓库把官方文档变成 **MCP 工具 + Skill**：Agent 先搜手册，再打开原文回答，并带上可点击链接。

适用于 Cursor、ZCode、Claude Code、Claude Desktop、VS Code Copilot，以及任何支持 [MCP](https://modelcontextprotocol.io/) 的 Agent。

## 给 Agent 的安装句（对外只留这一行）

把下面这句话复制给当前 AI：

```text
根据 https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/install.md 安装 RDK 文档检索。
```

Agent 会拉到安装剧本，执行 `npx -y rdk-docs-mcp@latest --install`，写入 MCP + Skill。不要把 JSON 或仓库地址发给用户。源码仓库可以 private；安装物是 npm 包。

装完后重载 MCP / 重启会话。之后发新版本：MCP 是 `@latest`，已安装的 Skill 会在 **下次 MCP 启动时** 被当前包装盖。用户不用再跑安装，也不用改那一行字。

jsDelivr 不可用时，同一文件在：

`https://unpkg.com/rdk-docs-mcp@latest/install.md`

## 价值和功能

**解决什么问题**

- 问「X5 怎么烧录 / TROS 某节点怎么启 / XBurn 支持哪些板」时，不再靠过期训练数据。
- 同一套能力可以装进不同 Agent，不用为每个 IDE 重写爬虫。

**四个工具**

| Tool | 做什么 |
|------|--------|
| `list_manuals` | 列出资料中心已上架手册（X/S 系列、TROS、Model Zoo、Studio、XBurn、OE、X5 SDK 等） |
| `search_docs` | 中英文关键词检索。指定手册只搜那一本；不指定时手册为主、论坛至多作补充。`forum` 只搜社区。 |
| `get_page` | 把一页官方文档或一篇论坛主题收成 Markdown |
| `list_toc` | 列出某一本手册的页面目录；`forum` 列出「开发与问题」和「通用」最近帖 |

**Skill `rdk-docs`**

规定 Agent：**先搜再打开页面**；手册是规范、答案主体，论坛只作补充参考，必须附可点击链接。

**不覆盖**

- 旧版资料 `https://developer.d-robotics.cc/information` 不在索引里。
- 论坛走 Discourse 公开 JSON（全站搜索 + 两个主板块最近帖），不当官方规范。不要去爬论坛 HTML。
- 不需要登录，也不写入文档站或论坛。

---

## 魔搭 MCP 广场（推荐对外分发）

国内用户走 [魔搭 MCP 广场](https://www.modelscope.cn/mcp) 安装。托管配置见 `modelscope/mcp-config.json`，介绍文案见 `modelscope/README.md`。

客户端手动加：

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

你更新 npm 包并在魔搭保存同一配置后，用户下次启动会拉到新版本（`npx -y`）。

创建入口：https://modelscope.cn/mcp/servers/create?template=customize  
选「可托管部署」，配置贴上面这段 JSON。

---

## 开发者本机（不对外）

对外安装走上面的 URL，不要让用户 clone。本机改代码时：

```bash
cd mcp && npm install && npm test && npm run build
```

本地 Plugin symlink（开发调试）：

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn "$(pwd)" ~/.cursor/plugins/local/rdk-docs
```

手动合并 MCP 片段见 `examples/*.mcp.json`（均已是 `npx -y rdk-docs-mcp@latest`）。

---

## 给 Agent 的使用约定

用户问 RDK / TROS / 烧录 / 量化等问题时：

1. `search_docs`（能确定产品就带 `manual`，如 `x5`、`tros`、`xburn`；只要社区就 `manual=forum`）
2. 对 1–2 个命中 URL 调用 `get_page`（手册或 `forum.d-robotics.cc` 主题）
3. 用原文回答，并附上官方文档或论坛链接

不要凭记忆编 `apt` 包名、镜像版本或管脚复用。

---

## 开发

```bash
cd mcp
npm install
npm test
npm run eval:live
npm run build
```

`eval:live` 用真实开发问题打资料中心（搜 + 拉页）。对标 ESP / Jetson MCP 的结论见 `docs/eval-vs-esp-jetson.md`。

索引缓存：`~/.cache/rdk-docs-mcp`（可用 `RDK_DOCS_CACHE_DIR` 覆盖），默认 TTL 24 小时。官方改文档后，缓存过期会重新拉最新索引；要立刻跟上就删掉缓存目录，或设 `RDK_DOCS_CACHE_TTL_MS=0`。

S 系列 OE / OE LLM 是 Rspress 站点：不写死 `search_index.*.json` 的哈希，每次从首页 JS 里发现当前文件名，所以站点发版后哈希变了也能搜。资料中心**新上架一本手册**时，还要在 `mcp/src/catalog.ts` 加一条（并补 `eval/cases.json`）。

契约见 `SPEC-rdk-docs.md`。MCP / Plugin / Skill 三者关系见 `mcp-plugin-skill.md`。

## 许可与来源

MIT。文档与帖子版权归 [D-Robotics 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 与 [社区论坛](https://forum.d-robotics.cc/) 原站。本仓库只提供检索与阅读适配，不镜像整站。
