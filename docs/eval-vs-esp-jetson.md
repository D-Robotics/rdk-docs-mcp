# 对标 ESP / Jetson MCP，以及本仓库能不能解决问题

评测日期：2026-08-21。命令：`cd mcp && npm run eval:live`。

## 先对齐类别，再比能力

市面上常被一起提起的「板卡 MCP」其实不是一类东西。

| 产品 | 类别 | 典型工具 | 和 RDK Docs 是否同类 |
|------|------|----------|----------------------|
| [Espressif Documentation MCP](https://mcp.espressif.com/docs) | **文档检索** | 单个 `search_espressif_sources(query, language)`，语义检索，返回片段 + URL | 是。这是正确对标对象 |
| [ESP-IDF Tools MCP](https://developer.espressif.com/blog/2026/04/esp-idf-tools-mcp-server/) | 工程动作 | 设 target、编译、烧录、列设备 | 否。那是 `idf.py` 的手，不是手册 |
| [Zalmotek jetson-mcp](https://github.com/Zalmotek/jetson-mcp) / [ajeetraina/jetsonMCP](https://github.com/ajeetraina/jetsonMCP) | 设备运维 | SSH、硬件信息、Docker、JetPack | 否。要板子在线，不查 NVIDIA 手册 |
| [mcp-ragdocs-jetson](https://github.com/streetmeat/mcp-ragdocs-jetson) | 文档 RAG | 向量检索，依赖 OpenAI + Qdrant | 部分同类，但是自建向量库，不是官方索引 |
| **本仓库 rdk-docs** | **文档检索** | `list_manuals` / `search_docs` / `get_page` / `list_toc` | — |

NVIDIA **没有**官方 Jetson 文档 MCP。把本仓库去对标 Jetson 控板 MCP，会得出「我们不会 flash 真机」这种无意义结论——那本来就不是同一层。

乐鑫自己也拆成两套：Docs MCP 查手册，Tools MCP 动手。我们现在只做了前一半。

## 和 Espressif Docs MCP 的差距

| 维度 | Espressif Docs | 本仓库 |
|------|----------------|--------|
| 检索 | 语义 / embedding | 关键词（吃 Docusaurus / Sphinx 公开索引） |
| 返回 | 相关片段 + URL | 命中列表；正文要再 `get_page` |
| 部署 | 远程 HTTP，要 GitHub/微信登录 | 本地 stdio，无账号 |
| 语言 | 中英双语显式参数 | 中文站为主，英文 query 也能撞上部分页 |
| 配套 | 另有 Tools MCP 编译烧录 | 没有板端动作 |
| 教 Agent 怎么用 | 几乎只靠 tool description | 有 `rdk-docs` Skill 规定先搜再打开 |

本仓库的选择（第一期 SPEC 已写）：不自建向量库，直接用资料中心已经生成的 `search-index.json` / `searchindex.js`。冷启动后本地缓存 24h，无登录。

## 任务评测（12 个真实开发问题）

判定：`search_docs` 的前 5 条里是否出现该去的手册页，并且 `get_page` 正文里是否含关键事实。这是「Agent 有没有材料答题」，不是「模型有没有编对」。

| 问题 | 结果 | 落到的页面 |
|------|------|------------|
| X5 怎么把系统镜像烧到 SD 卡 | 过 | `.../system-burn/burn-sd-card` |
| X5 能不能 PoE、要注意什么 | 过 | `.../rdk_x5/POE` |
| 板上怎么查 RDK OS 版本 | 过 | `cmd_rdkos_info` |
| 40pin GPIO 怎么用 | 过 | `.../gpio` |
| X5 怎么升级 miniboot | 过 | `cmd_rdk-miniboot-update` |
| XBurn 是什么、支持哪些板 | 过 | `xburn_doc/install` |
| TROS 怎么安装 | 过 | `tros_doc/.../install_tros` |
| 双目摄像头怎么接 | 过 | `accessories_stereo_camera_doc/overview` |
| S600 有哪些应用案例 | 过 | `case_doc/case` |
| X5 OE 怎么量化 | 过 | `oe_x5_doc/.../qat_quickstart.html` |
| How do I flash an SD card | 过 | `burn-sd-card` |
| X5 怎么连 Wi-Fi | 过 | `remote_login`（相关，但不是专页） |

**12 / 12 过。** 评测中修掉了一个真 bug：OE X5 的 `searchindex.js` 是未加引号的 JS 对象，原先按 JSON 解析会整本手册搜不到。

## 还过不了、或过得勉强的地方

- **关键词 ≠ 语义。** 「连 Wi-Fi」打到远程登录页，能答但不是最好的专页。Espressif 的 embedding 在这种换说法上更稳。
- **Studio「连接设备」** 在探索检索里分数很低，没进这 12 题的强断言。
- **Model Zoo「YOLO」** 标题里经常没有 YOLO 三个字母，只靠片段命中，排序偏弱。
- **没有板端动作。** 对标 ESP Tools / Jetson 控板 MCP，我们不会替你 `flash` 真机。
- **Rspress 手册**（`oe-s` / `oe-llm-*`）没有固定路径的 `search-index.json`，要从首页 JS 发现带哈希的 `search_index`；站点发版后哈希会变，靠发现 + 24h 缓存跟上。

复跑：

```bash
cd mcp && npm test && npm run eval:live
```
