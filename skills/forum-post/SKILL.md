---
name: forum-post
description: 把图文/视频内容发布到 Discourse 论坛（默认 forum.d-robotics.cc，地瓜机器人论坛）。当用户要"发帖/发到论坛/发到社区/编辑帖子/传图传视频到帖子"时使用。覆盖：SSO 登录、composer 发帖、图片/视频上传、帖子编辑、API 兜底。
---

# Forum Post — 把内容发到 Discourse 论坛

默认目标 `https://forum.d-robotics.cc/`（地瓜机器人论坛，Discourse + D-Robotics SSO）。

## 前置依赖（动手前先检查）

- **agent-browser CLI**（浏览器路线必需）：`npm i -g agent-browser && agent-browser install`。`which agent-browser` 有输出才算就绪；没装就先装，别硬走 API 路线徒手搬 cookie。
- **curl**（API 路线必需）：macOS / Linux 自带。
- **ffmpeg**（仅当视频超过 ~25MB 需要压缩时）：`brew install ffmpeg` 或 `apt install ffmpeg`。

## 第 0 步：先要凭据（没有就登不进去）

**发帖/编辑是写操作，必须先登录，而登录要用户的账号密码。动手前先确认凭据来源：**

1. **首选：问用户**。直接用一两句话问："论坛账号（用户名/邮箱/手机号）和密码发我一下"。拿到再用，用完不复述、不回显。
2. 若用户此前在本机存过（比如浏览器已登录、或给了环境变量），先用现成的；**登录态失效就再问**，别用猜的。
3. **绝不把凭据写进 skill / 代码 / 仓库 / 日志**。skill 里只有"怎么问"，没有"账号是什么"。
4. 拿到凭据后先验证一次登录成功（页面出现"新建话题"或用户头像），再继续发帖流程；失败就把错误告诉用户、请他确认账号密码。

> 一句话：先看有没有可用登录态，没有就向用户要，要到再登，登不进就报给用户。

## 两条路，按情况选

- **浏览器自动化**（agent-browser）：看得见、适合带图带视频、需要登录态。首选。
- **REST API**（curl）：快、稳、适合纯文字/改帖。读用 Bearer token，写/上传用 cookie+CSRF。

## 浏览器路线（agent-browser）

### 1. 登录（SSO 流程）

论坛 → 登录 → 跳 `developer.d-robotics.cc` SSO → 弹登录框（用户名+密码）→ 登完跳回论坛。

```
agent-browser open https://forum.d-robotics.cc/
# 点"登录" → 跳到开发者平台 → 点"请 [登录/注册]" → 出登录框
# fill 用户名框、密码框 → 点"登 录" → 自动跳回论坛
# 登录成功的标志：出现"新建话题"按钮
```

注意：登录框 ref 会变，每次 snapshot 重新取。SSO 跳转会经过 developer.d-robotics.cc。

### 2. 新建话题

- 点"新建话题" → 底部弹出 composer。
- 标题：`#reply-title` 输入框。
- 分类：`.category-chooser summary` 点开（是个 `<details>`），在展开列表里点目标分类（如"项目与案例"）。
- 正文：默认是 ProseMirror 富文本。**先点"切换到标准 Markdown 编辑器"按钮**换成纯 textarea，好操作。
- 正文写入：ProseMirror/textarea 都不能简单 `.value=`，要用原生 setter + input 事件：
  ```js
  const ta = document.querySelector('#reply-control textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(ta, markdown); ta.dispatchEvent(new Event('input',{bubbles:true}));
  ```
- 提交：点"创建话题"。成功后 URL 变成 `/t/topic/<id>`。

### 3. 传图/传视频

- 用编辑器里的 `input[type=file]`（在 `#reply-control` 里），`agent-browser upload "#reply-control input[type=file]" /abs/path/img.png`。
- 上传后正文自动插入 `![name|WxH](upload://<hash>.png)`。**逐个上传，逐个从 textarea 里抓 `upload://` 引用记录下来**，最后统一替换占位。
- **视频**：默认传成图片会渲染成 `<img>`（坏）。必须写成 `![name.mp4|video](upload://<hash>.mp4)`——`|video` 后缀才会渲染成可点击播放的视频占位。
- **体积限制**：论坛 nginx `client_max_body_size` 较小（实测 ~28MB 视频会 413）。视频先用 ffmpeg 压缩：
  ```bash
  ffmpeg -y -i in.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 96k -movflags +faststart out.mp4
  ```
  52s/29MB → 2.4MB 可传。

### 4. 编辑已发帖子

帖子页 → 找到该帖的"编辑此帖子"按钮（操作区，ref 每次 snapshot 重取）→ composer 加载原文 → 改 → 点保存。

**坑**：编辑用 composer 偶尔会加载不出编辑器（空 grippie）。这时改用 API 路线（下面）。

## API 路线（curl）

### 凭据会过期（实测踩过的坑）

Bearer token / `_forum_session` / CSRF token **都会过期**。上传或写帖突然返回
`{"error_type":"not_logged_in"}` / `您需要登录才能执行此操作` —— 不是代码错了，是会话失效了。

处理：回浏览器**重新走一遍 SSO 登录** → 重新 `agent-browser cookies get` 导出 cookie +
重取 `<meta name=csrf-token>` → 再重试。CSRF 是页面级的，每次发帖会话开始取一次即可，
过期就重取。

### 读（Bearer token 即可）

token 从已登录浏览器拿：`document.cookie` 里的 `token=Bearer%20xxx`（URL decode 后是 `Bearer <jwt>`）。

```bash
TOKEN="Bearer eyJ..."   # 或 Bearer <jwt>
curl -s "https://forum.d-robotics.cc/t/<topic_id>.json" -H "Authorization: $TOKEN"          # 话题（拿 post_stream.posts[].id）
curl -s "https://forum.d-robotics.cc/posts/<post_id>.json" -H "Authorization: $TOKEN"       # 单帖 raw（markdown 源）
```

### 写 / 上传 / 编辑（要 cookie + CSRF）

读帖用 Bearer token 就够；**写和上传必须要论坛会话 cookie + CSRF**。

- cookie：从已登录浏览器取 `_forum_session` 和 `_t`（HttpOnly，`document.cookie` 读不到，用 `agent-browser cookies get` 全量导出）。
- CSRF：页面 `<meta name=csrf-token>` 的 content。

```bash
COOKIE="_forum_session=...; _t=...; token=..."; CSRF="<csrf>"

# 上传图片/视频
curl -X POST "https://forum.d-robotics.cc/uploads.json" \
  -H "Cookie: $COOKIE" -H "X-CSRF-Token: $CSRF" -H "X-Requested-With: XMLHttpRequest" \
  -F "type=post" -F "synchronous=true" -F "file=@/path/img.png;type=image/png"
# 返回里有 short_url（upload://xxx）→ 写进正文

# 编辑帖子（raw 是 markdown 全文）
curl -X PUT "https://forum.d-robotics.cc/posts/<post_id>" \
  -H "Cookie: $COOKIE" -H "X-CSRF-Token: $CSRF" -H "X-Requested-With: XMLHttpRequest" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "post[raw]=<markdown 全文>"
```

## 验证

发完/改完必须回读确认：标题、分类、正文各章节、图片数、视频可播放。别发完就跑。

## 速查（本仓库实测可用值）

- 论坛：`https://forum.d-robotics.cc/`（Discourse）
- SSO：`developer.d-robotics.cc`（账号密码登录，跳回）
- 测试帖 id 示例：`/t/topic/35645`（post id 65898）
