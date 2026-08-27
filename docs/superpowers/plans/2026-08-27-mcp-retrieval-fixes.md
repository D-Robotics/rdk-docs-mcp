# MCP 检索纠偏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 rdk-docs-mcp 在真实问答里不再打开空壳页、不再把 X3 题钉到 X5 专题页，并让规格类问题优先落到现网有正文的硬件简介或手册首页。

**Architecture:** 不新增工具。在现有 `search_docs` / `get_page` / `list_toc` 上补三层：问句型号识别（共享给路由和排序）、Docusaurus 空壳检测与索引还原、规格类 `official-start` 只钉有正文的页。不把已拆分的 `/rdk_doc/` 加回手册目录。

**Tech Stack:** 现有 TypeScript MCP（`mcp/src`）、Vitest、`npm test` / `npm run eval:live`。

---

## Spec（验收清单）

**Done**

1. `matchOfficialPath("RDK X3 是否支持 PoE", "rdk-x")` 不得返回 X5 PoE 页。
2. `matchOfficialPath("RDK X3 HDMI", "rdk-x")` 不得返回 X5 `display_rdkx5`。
3. `matchOfficialPath("RDK X3 Micro SD 卡推荐容量", "rdk-x")` 不得返回 `burn-sd-card`。
4. 问 X5「几路 USB 3.0 / 硬件简介」时，`official-start` 为 `.../hardware_introduction/rdk_x5`。
5. 问 S600「开发者套件 / 算力 / 供电电压」时，`official-start` 为现网 S600 kit 页。
6. 问 X3 / S100 规格且现网硬件简介是空壳时，`official-start` 为对应手册首页 `.../RDK`，不是空壳 URL。
7. `compactDocusaurusIndex` 不再丢掉「有 URL、无标题」的页；`list_toc("rdk-x", "rdk_x3")` 能看到 X3 硬件简介路径。
8. `get_page` 对 Docusaurus 空壳：能从索引拼出正文则返回正文；拼不出则 `markdown` 以明确一句说明开头（含「空壳页」），不得返回纯空字符串。
9. `get_page` 收到旧前缀 `/rdk_doc/` 时改走 `/rdk_x_doc/`（仅改前缀，不新增 catalog 手册）。
10. 问句只提 X3 时，`rankHits` 对 URL/标题含 `x5`、不含 `x3` 的页降权；S100 vs S600 同理。
11. `search_docs` 的 heading 命中必须带非空 `snippet`（面包屑或索引摘录）。
12. `npm test` 全绿；`npm run eval:live` 现有可用性用例不回退。

**Non-goals**

- 不把 `rdk_doc` 加进 `MANUALS`。
- 不做向量检索 / 换搜索引擎。
- 不改论坛/手册分流。
- 不改测评集 `d-wiki-eval`。
- 不在本计划里 npm publish（发布另说）。
- 不把光秃的「电源」做成 `official-start`（现有 `routes.test.ts` 规定 `电源 + x5` 不猜）。

**改动范围（已核对存在）**

- `mcp/src/routes.ts`：`OFFICIAL_PATHS`、`matchOfficialPath`
- `mcp/src/search.ts`：`scoreDoc` / `rankHits`
- `mcp/src/docusaurus.ts`：`compactDocusaurusIndex`
- `mcp/src/service.ts`：`getPage` 空壳还原
- `mcp/src/fetch-page.ts`：旧路径规范化（或新小文件 `doc-urls.ts`）
- `skills/rdk-docs/SKILL.md` + `mcp/SKILL.md`（prepack 会拷）
- 测试：`routes.test.ts`、`search.test.ts`、`docusaurus` 段、`service.test.ts`、`fetch-page.test.ts`

**验证**

```bash
cd mcp && npm test && npm run eval:live
```

再手工三条（必须真跑 `searchDocs` / `getPage`，不看静态分）：

```text
search_docs query="RDK X3 是否支持 PoE" manual=rdk-x
  → 首条不是 X5 POE 页

search_docs query="RDK X5 几路 USB 3.0 Type-A" manual=rdk-x
  → official-start 或首条为 hardware_introduction/rdk_x5

get_page url=https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3
  → markdown 非空（索引还原或「空壳页」说明）
```

**风险**

- 现网 X3 / S100 硬件简介若一直无正文，索引还原可能仍薄。验收是「不装作成页」，不是「补回旧手册全文」。
- 型号加权过猛会压掉「X3 和 X5 对比」题。只在问句**只出现一个系列型号**时降权另一型号。

---

## Files

| 文件 | 职责 |
|---|---|
| Create: `mcp/src/products.ts` | 从问句解析型号；给路由和排序共用 |
| Create: `mcp/src/products.test.ts` | 型号解析单测 |
| Create: `mcp/src/doc-urls.ts` | 旧 `/rdk_doc/` 前缀、S 系列路径归一 |
| Modify: `mcp/src/routes.ts` | 型号冲突时不钉错板；补规格入口 |
| Modify: `mcp/src/docusaurus.ts` | 保留无标题 URL；把 snippet 写回 `text` |
| Modify: `mcp/src/search.ts` | 型号加权；合并命中时保留 page 标题 + 非空 snippet |
| Modify: `mcp/src/service.ts` | 空壳 `get_page` 从索引还原 |
| Modify: `mcp/src/fetch-page.ts` | `isDocusaurusShell` |
| Modify: `skills/rdk-docs/SKILL.md` | Agent 看到空壳说明时换下一条，不要报「手册没写」 |
| Test: 上表对应 `*.test.ts` + 现有 `eval-usability.ts` 不回退 |

---

### Task 1: 问句型号解析

**Files:**
- Create: `mcp/src/products.ts`
- Create: `mcp/src/products.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { mentionedBoards, soleBoard } from "./products.js";

describe("mentionedBoards", () => {
  it("reads explicit board names and treats Module / S100P as the family", () => {
    expect(mentionedBoards("RDK X3 是否支持 PoE")).toEqual(["x3"]);
    expect(mentionedBoards("RDK X3 Module 调试串口")).toEqual(["x3"]);
    expect(mentionedBoards("RDK X5 几路 USB")).toEqual(["x5"]);
    expect(mentionedBoards("S100P 算力")).toEqual(["s100"]);
    expect(mentionedBoards("S600 供电")).toEqual(["s600"]);
  });

  it("keeps both boards when the question compares them", () => {
    expect(mentionedBoards("X3 和 X5 的 USB 有何不同").sort()).toEqual(["x3", "x5"]);
    expect(soleBoard("X3 和 X5 的 USB 有何不同")).toBeUndefined();
  });

  it("returns empty when no board is named", () => {
    expect(mentionedBoards("如何烧录")).toEqual([]);
    expect(soleBoard("如何烧录")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd mcp && npx vitest run src/products.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `products.ts`**

```ts
export type BoardId = "x3" | "x5" | "s100" | "s600";

const RULES: Array<{ id: BoardId; re: RegExp }> = [
  { id: "x5", re: /x5|x\s*5/i },
  { id: "x3", re: /x3|x\s*3|旭日\s*x3/i },
  { id: "s600", re: /s600/i },
  { id: "s100", re: /s100p?|s100\s*p/i },
];

export function mentionedBoards(query: string): BoardId[] {
  const found = new Set<BoardId>();
  for (const rule of RULES) {
    if (rule.re.test(query)) found.add(rule.id);
  }
  return [...found];
}

export function soleBoard(query: string): BoardId | undefined {
  const boards = mentionedBoards(query);
  return boards.length === 1 ? boards[0] : undefined;
}

export function urlLooksLikeBoard(url: string, board: BoardId): boolean {
  const u = url.toLowerCase();
  if (board === "x3") return /rdk_x3|\/x3(?:_|\/|$)|hardware_introduction\/rdk_x3/.test(u);
  if (board === "x5") return /rdk_x5|\/x5(?:_|\/|$)|hardware_introduction\/rdk_x5|display_rdkx5/.test(u);
  if (board === "s100") return /s100/.test(u) && !/s600/.test(u);
  return /s600/.test(u);
}
```

- [ ] **Step 4: 再跑测试确认通过**

```bash
cd mcp && npx vitest run src/products.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add mcp/src/products.ts mcp/src/products.test.ts
git commit -m "Identify the board named in a docs query."
```

---

### Task 2: official-start 不再串台

**Files:**
- Modify: `mcp/src/routes.ts`
- Modify: `mcp/src/routes.test.ts`

现有问题（已用真查询证实）：

- `x5-poe` 是 `scope: "global"` + `/poe/i`，X3 问 PoE 也会钉 X5 PoE 页。
- `x5-hdmi` 是 `named-manual`，`manual=rdk-x` 时 X3 HDMI 钉到 `display_rdkx5`。
- `x5-sd-flash` 的 `/sd\s*卡/` 把「Micro SD 容量/在哪一面」钉到烧录页。

- [ ] **Step 1: 在 `routes.test.ts` 的 `matchOfficialPath` 里追加失败用例**

```ts
it("does not pin X5 how-to pages onto an X3-only question", () => {
  expect(matchOfficialPath("RDK X3 是否支持 PoE", "rdk-x")?.url).not.toMatch(/\/POE$/i);
  expect(matchOfficialPath("RDK X3 的 HDMI 最高分辨率", "rdk-x")?.url).not.toMatch(/display_rdkx5/);
  expect(matchOfficialPath("RDK X3 Micro SD 卡推荐容量", "rdk-x")?.url).not.toMatch(/burn-sd-card/);
});

it("still pins X5 PoE / HDMI when the question is about X5", () => {
  expect(matchOfficialPath("RDK X5 PoE", "rdk-x")?.url).toMatch(/\/POE$/i);
  expect(matchOfficialPath("RDK X5 HDMI", "rdk-x")?.url).toMatch(/display_rdkx5/);
});
```

保留原用例：`电源 + x5` 仍为 `undefined`；未点名型号的「烧录」仍不猜板。

- [ ] **Step 2: 跑测试确认新用例失败**

```bash
cd mcp && npx vitest run src/routes.test.ts
```

- [ ] **Step 3: 改 `matchOfficialPath`，问句只有一块板时拒绝指向另一块板的 path**

在 `mcp/src/routes.ts` 给需要锁板的 path 补可选字段（只加字段，不改已有 id）：

```ts
boards?: BoardId[]; // 此入口只服务这些板；问句 soleBoard 不在其中则跳过
```

赋值：

- `x5-poe`、`x5-hdmi`、`x5-usb-camera`、`x5-can`、`x5-sd-flash`：`boards: ["x5"]`
- `s100-burn`、`s100-gpio`：`boards: ["s100"]`
- `s600-burn`、`s600-gpio`：`boards: ["s600"]`

`x5-poe` 的 `scope` 从 `global` 改为 `product`，`product: /x5/i`（与 `boards` 一致）。

`matchOfficialPath` 循环里，在 `return path` 之前：

```ts
import { soleBoard, type BoardId } from "./products.js";

function boardConflict(path: OfficialPath, query: string): boolean {
  const sole = soleBoard(query);
  if (!sole || !path.boards?.length) return false;
  return !path.boards.includes(sole);
}
```

`boardConflict` 为 true 则 `continue`。

`x5-sd-flash` 的 query 收窄为烧录语义，避免「推荐 SD 容量」误中：

```ts
query: /flash\s*sd|(?:烧录|镜像).{0,12}sd|sd.{0,12}(?:烧录|镜像)/i,
```

「Micro SD 卡推荐容量」不得再匹配。

- [ ] **Step 4: 再跑 `routes.test.ts`，新旧用例都过**

- [ ] **Step 5: 提交**

```bash
git add mcp/src/routes.ts mcp/src/routes.test.ts
git commit -m "Stop pinning X5 how-tos onto X3-only questions."
```

---

### Task 3: 规格题的 official-start（只钉有正文的页）

**Files:**
- Modify: `mcp/src/routes.ts`（`OFFICIAL_PATHS` 数组**前部**，先于 HDMI/PoE/烧录）
- Modify: `mcp/src/routes.test.ts`

现网已核实有正文：

- X5：`https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5`
- S600 kit：`https://developer.d-robotics.cc/rdk_s_doc/01_Quick_start/01_hardware_introduction/02_rdk_s600/01_rdk_s600_kit`
- X 手册首页：`https://developer.d-robotics.cc/rdk_x_doc/RDK`
- S 手册首页：`https://developer.d-robotics.cc/rdk_s_doc/RDK`

空壳，禁止当作 official-start：

- `.../hardware_introduction/rdk_x3`
- `.../01_rdk_s100/01_rdk_s100_kit`

- [ ] **Step 1: 失败测试**

```ts
it("pins hardware-spec questions to a live page, not an empty shell", () => {
  expect(matchOfficialPath("RDK X5 几路 USB 3.0 Type-A", "rdk-x")?.url)
    .toContain("/hardware_introduction/rdk_x5");
  expect(matchOfficialPath("RDK S600 供电电压范围", "rdk-s")?.url)
    .toContain("01_rdk_s600_kit");
  expect(matchOfficialPath("RDK X3 几路 USB 3.0", "rdk-x")?.url)
    .toMatch(/\/rdk_x_doc\/RDK$/);
  expect(matchOfficialPath("RDK S100 有哪些 USB 接口", "rdk-s")?.url)
    .toMatch(/\/rdk_s_doc\/RDK$/);
});

it("does not steal how-tos that already have a better pin", () => {
  expect(matchOfficialPath("RDK X5 USB 摄像头", "rdk-x")?.id).toBe("x5-usb-camera");
  expect(matchOfficialPath("电源", "x5")).toBeUndefined();
});
```

规格 query 必须同时像规格，避免「USB 摄像头」被抢走。建议：

```ts
const SPEC_QUERY = /硬件简介|接口总览|几路|多少路|供电电压|默认静态\s*ip|type-a 接口|算力|tops/i;
```

四条新 path（插在 `OFFICIAL_PATHS` **最前**，这样规格优先于 HDMI/PoE）：

| id | boards | manuals | url |
|---|---|---|---|
| `x5-hardware-intro` | x5 | rdk-x | `.../hardware_introduction/rdk_x5` |
| `s600-hardware-kit` | s600 | rdk-s | S600 kit 现网地址 |
| `x3-hardware-home` | x3 | rdk-x | `.../rdk_x_doc/RDK` |
| `s100-hardware-home` | s100 | rdk-s | `.../rdk_s_doc/RDK` |

每条 `scope: "product"`，`query: SPEC_QUERY`。

- [ ] **Step 2–4: 红 → 实现 → 绿**
- [ ] **Step 5: 提交**

```bash
git add mcp/src/routes.ts mcp/src/routes.test.ts
git commit -m "Pin board-spec questions to live hardware pages."
```

---

### Task 4: Docusaurus 不再丢掉无标题页，并补上 snippet/text

**Files:**
- Modify: `mcp/src/docusaurus.ts`
- Modify: `mcp/src/search.test.ts`（已有 `docusaurusFixture`）

根因：`compactDocusaurusIndex` 在 `if (!title) continue` 时丢掉 X3 硬件简介 / S100 kit 这种「有 URL、标题空」的记录；heading 的 `snippet` 常为空。

- [ ] **Step 1: 在 `search.test.ts` 的 docusaurus describe 里加用例**

```ts
it("keeps untitled page urls and copies snippet text onto the page", () => {
  const raw = [
    { documents: [{ u: "/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3" }] },
    {
      documents: [
        {
          t: "开发板提供一路 USB 3.0 Type A 接口。",
          s: "USB 接口",
          u: "/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3",
        },
      ],
    },
  ];
  const docs = compactDocusaurusIndex(raw, "rdk-x");
  const page = docs.find((d) => d.kind === "page" && d.url.includes("rdk_x3"));
  expect(page).toBeTruthy();
  expect(page?.title.length).toBeGreaterThan(0);
  expect(page?.text).toContain("USB 3.0");
  const headingOrSnippet = docs.find((d) => d.url.includes("rdk_x3") && d.kind !== "page");
  expect(headingOrSnippet?.snippet || headingOrSnippet?.text).toBeTruthy();
});
```

- [ ] **Step 2: 跑失败**
- [ ] **Step 3: 改 `compactDocusaurusIndex`**

1. 标题为空时用 `breadcrumbs` 末段，再退回 URL 最后一段，**不要 skip**。
2. 第一遍收集后，按去 hash 的 URL 把 `kind === "snippet"` 的 `t` 拼进对应 `page.text`。
3. heading 若没有 snippet，用同 URL 的 page.title 或 breadcrumbs 填 `snippet`。

导出一个小函数便于测试：

```ts
export function titleFromDoc(item: { t?: string; s?: string; b?: string[]; u: string }): string {
  const titled = (item.s || item.t || "").trim();
  if (titled) return titled;
  const crumb = item.b?.filter(Boolean).at(-1)?.trim();
  if (crumb) return crumb;
  return item.u.split("/").filter(Boolean).at(-1) || item.u;
}
```

- [ ] **Step 4: 绿**
- [ ] **Step 5: 提交**

```bash
git add mcp/src/docusaurus.ts mcp/src/search.test.ts
git commit -m "Keep untitled Docusaurus pages and attach snippet text."
```

---

### Task 5: `get_page` 处理空壳 + 旧 `/rdk_doc/` 前缀

**Files:**
- Create: `mcp/src/doc-urls.ts`
- Create: `mcp/src/doc-urls.test.ts`
- Modify: `mcp/src/fetch-page.ts`（`isDocusaurusShell`）
- Modify: `mcp/src/fetch-page.test.ts`
- Modify: `mcp/src/service.ts`（`getPage`）
- Modify: `mcp/src/service.test.ts`

- [ ] **Step 1: URL 归一测试**

```ts
import { describe, expect, it } from "vitest";
import { canonicalizeDocUrl } from "./doc-urls.js";

describe("canonicalizeDocUrl", () => {
  it("rewrites the retired /rdk_doc/ prefix onto /rdk_x_doc/", () => {
    expect(
      canonicalizeDocUrl("https://developer.d-robotics.cc/rdk_doc/Quick_start/hardware_introduction/rdk_x3"),
    ).toBe("https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3");
  });

  it("leaves current handbook urls unchanged", () => {
    const live = "https://developer.d-robotics.cc/rdk_s_doc/RDK";
    expect(canonicalizeDocUrl(live)).toBe(live);
  });
});
```

实现：只替换 origin 下的路径前缀 `/rdk_doc/` → `/rdk_x_doc/`。不要改 `rdk_s_doc`。

- [ ] **Step 2: 空壳检测测试（`fetch-page.test.ts`）**

用一份短 HTML：`<title>RDK X3/X5 DOC</title>` + 空 `article.theme-doc-markdown`。`htmlToMarkdown` 的 markdown 为空或极短时，`isDocusaurusShell(html, markdown)` 为 true。对照：带 `<h1>` 和一段正文的 X5 页为 false。

- [ ] **Step 3: `getPage` 还原测试（`service.test.ts`，http mock）**

Mock `http(url)`：

- 空壳 HTML（X3 硬件简介 URL）
- `search-index.json` 里有该 URL 的 snippet 正文

断言：`getPage` 返回的 markdown 含索引里的句子，`title` 不是空串。

第二例：索引也没有该 URL 的 snippet → markdown 以 `这是现网空壳页` 开头，并建议改开 `search_docs` 下一条或手册首页。**禁止**再返回 `markdown: ""`。

还原逻辑放 `service.ts`，对齐已有 `rspressPageFromIndex`：按 URL 路径收集 `loadIndex("rdk-x"|"rdk-s")` 里同 path 的 `text`/`snippet`，拼成 Markdown。

`getPage` 顺序：

1. `canonicalizeDocUrl`
2. 拉 HTML → `htmlToMarkdown`
3. 若 Rspress 空壳：走现有还原
4. 若 Docusaurus 空壳：走索引还原
5. 仍空：写入空壳说明（含原 URL）

- [ ] **Step 4: `cd mcp && npm test` 全绿**
- [ ] **Step 5: 提交**

```bash
git add mcp/src/doc-urls.ts mcp/src/doc-urls.test.ts mcp/src/fetch-page.ts mcp/src/fetch-page.test.ts mcp/src/service.ts mcp/src/service.test.ts
git commit -m "Recover or label empty Docusaurus shells in get_page."
```

---

### Task 6: 排序按型号加权，命中带上非空 snippet

**Files:**
- Modify: `mcp/src/search.ts`
- Modify: `mcp/src/search.test.ts`

- [ ] **Step 1: 失败测试**

用两份 `IndexedDoc`：X3 FAQ 与 X5 硬件简介。query = `RDK X3 几路 USB 3.0 Type-A`。

```ts
it("demotes the other board when the question names only one", () => {
  const docs: IndexedDoc[] = [
    {
      manualId: "rdk-x",
      title: "1.1.2 硬件简介",
      url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5",
      kind: "page",
      text: "4 路 USB 3.0 Type A 接口",
    },
    {
      manualId: "rdk-x",
      title: "Q18: RDK X3 不同系统版本的有线网口的 IP 是什么？",
      url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system",
      kind: "page",
      text: "RDK X3 USB 3.0",
    },
  ];
  const hits = rankHits(docs, "RDK X3 几路 USB 3.0 Type-A", 5);
  expect(hits[0]?.url).toContain("hardware_and_system");
  expect(hits[0]?.url).not.toContain("rdk_x5");
});

it("fills snippet from breadcrumbs or text when the index left it blank", () => {
  const hits = rankHits(
    [
      {
        manualId: "rdk-x",
        title: "调试串口",
        url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5",
        kind: "heading",
        breadcrumbs: ["1 快速开始", "硬件简介"],
      },
    ],
    "调试串口",
    3,
  );
  expect(hits[0]?.snippet.length).toBeGreaterThan(0);
});
```

对比题 `X3 和 X5 的 USB 有何不同` 不得把 X5 页分数打到 0。

- [ ] **Step 2: 改 `scoreDoc`**

在现有 FAQ 降权之后：

```ts
const sole = soleBoard(queryTokens.join(" ") /* 不行：tokens 已切碎 */);
```

必须对**原始 query 字符串**调 `soleBoard(query)`。把 `query` 传入 `scoreDoc`：

```ts
function scoreDoc(doc: IndexedDoc, matchers: Matcher[], query: string): number {
  // ...existing scoring...
  const sole = soleBoard(query);
  if (sole) {
    const mine = urlLooksLikeBoard(doc.url, sole) || urlLooksLikeBoard(doc.title, sole);
    const other = (["x3", "x5", "s100", "s600"] as const)
      .filter((b) => b !== sole)
      .some((b) => urlLooksLikeBoard(doc.url, b) && !urlLooksLikeBoard(doc.url, sole));
    if (mine) score += 8;
    if (other) score -= 12;
  }
  return score;
}
```

`rankHits` 合并同一 URL 时：

- `title`：优先 `kind === "page"` 的标题，其次当前最高分标题
- `snippet`：`doc.snippet || doc.text?.slice(0, 180) || breadcrumbs.join(" / ")`，保证非空（至少 URL 末段）

- [ ] **Step 3: 绿 + 全量 `npm test`**
- [ ] **Step 4: 提交**

```bash
git add mcp/src/search.ts mcp/src/search.test.ts
git commit -m "Prefer the named board and keep search snippets populated."
```

---

### Task 7: Skill 口径 + 可用性回归

**Files:**
- Modify: `skills/rdk-docs/SKILL.md`
- Modify: `mcp/src/eval-usability.ts`（只加断言，不改评分框架）
- Modify: `mcp/src/eval.ts` 若 live case 列表在那边

Skill 增加三句（放手册步骤里，不要新开论坛段落）：

1. `official-start` 先打开；若 `get_page` 正文以「空壳页」开头，立刻改开下一条 `related`，不要对用户说「手册没写」。
2. 问句点名 X3 / X5 / S100 / S600 时，不要用另一型号的专题页当答案。
3. 规格（几路 USB、供电、算力、接口编号）优先硬件简介或手册首页，不要先开烧录 / 网络配置 / 驱动指南。

可用性探测（`eval-usability.ts`）加 2 条，http 走真站（与现有 PoE 探测同类）：

```ts
{
  id: "x3-poe-not-x5-poe-start",
  async run(http) {
    const search = await searchDocs({ query: "RDK X3 是否支持 PoE", manual: "rdk-x", limit: 5 }, http);
    const first = search.hits[0];
    if (first?.url.toLowerCase().includes("/poe")) {
      return { pass: false, reason: "X3 PoE question pinned X5 PoE page" };
    }
    return { pass: true };
  },
},
{
  id: "x3-hardware-get-page-not-blank",
  async run(http) {
    const page = await getPage(
      { url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3", maxChars: 4000 },
      http,
    );
    if (!page.markdown.trim()) {
      return { pass: false, reason: "X3 hardware intro still returns empty markdown" };
    }
    return { pass: true };
  },
},
```

现有 `x5 PoE official-start` 探测保持：query 用 `RDK X5 PoE` 或 `manual: x5` + `PoE`，避免被 Task 2 误伤。

- [ ] **Step 1: 改 Skill + 探测**
- [ ] **Step 2:** `cd mcp && npm test && npm run eval:live`
- [ ] **Step 3: 手工三条（见文首验证）**
- [ ] **Step 4: 提交**

```bash
git add skills/rdk-docs/SKILL.md mcp/src/eval-usability.ts
git commit -m "Teach the skill to skip empty shells and stay on the named board."
```

---

### Task 8: 版本号（不发布）

**Files:**
- Modify: `mcp/package.json`、`mcp/src/server.ts`、`plugin.json` 的 `0.1.7` → `0.1.8`

- [ ] 与仓库里现有版本字段对齐后提交：`Bump rdk-docs-mcp to 0.1.8 for retrieval fixes.`
- [ ] **不要** `npm publish`，除非用户明确说发布。

---

## 任务对照

| 现场问题 | 任务 |
|---|---|
| 空壳 `get_page` 当正常页 | Task 4 + 5 |
| 搜索看不到空标题页 / 旧 `/rdk_doc/` 正文 | Task 4；旧前缀只做 get_page 改写（Task 5），不加回 catalog |
| official-start 抢错型号 | Task 1 + 2 |
| 规格题不进硬件简介 | Task 3 |
| 合订手册不按问句型号收 | Task 6 |
| hit 标题是章节、snippet 为空 | Task 4 + 6 |
| S 系列两套路径 | Task 5 只归一旧 X 前缀；S 以索引里有正文的 URL 为准，不硬猜 404 的 unnumbered kit |
| Agent 把空壳说成「手册没写」 | Task 7 |

S 系列 `01_Quick_start` vs `Quick_start`：有正文的页本来就在索引里，不另做易碎别名表。空壳 S100 kit 的规格入口是手册首页（Task 3）。
