# 社区发布

本开发版本增加案例、Skill 和论坛帖子发布。原有六个检索工具保持可用。

## 登录自己的账号

1. 调用 `community_account({action:"login"})`，由使用者在独立浏览器中自行登录。
2. 登录后调用 `community_account({action:"complete_login"})`。它进入论坛完成 SSO，将本人的会话保存在本机私有文件中。
3. `community_account({action:"status"})` 返回社区和论坛实际用户名。两处用户名可以不同，发布预览会显示本次使用的身份。

交互登录需要可执行的 `agent-browser` 及其浏览器运行时。默认凭据文件为 `~/.config/rdk-docs-mcp/community-auth.json`，权限为 600；浏览器使用独立 profile。`RDK_COMMUNITY_AUTH_FILE` 可指定私有会话文件。已有个人凭据也可由客户端环境变量 `RDK_COMMUNITY_TOKEN`、`RDK_FORUM_COOKIE` 提供。不要把密码、Token 或 Cookie 发到聊天或工具参数中。

`community_account({action:"logout"})` 清除本机凭据文件；环境变量和浏览器登录态仍由使用者自行管理。登录过期后重新执行登录流程，不切换到官方账号或机器人账号。

## 准备与确认

调用 `prepare_community_publish({content:{kind:..., ...}})`。预览只检查文件与账号，不上传附件或发布内容；案例会通过社区的只读源预览接口获取仓库 README 和提交版本。向用户展示作者、发布去向、正文／仓库 README、素材和协议声明，得到用户确认后再调用对应的发布工具。

### 案例

```json
{
  "content": {
    "kind": "case",
    "project_name": "X5 摄像头识物助手",
    "summary": "摄像头采集与识物流程、运行步骤和实机验证记录。",
    "category_codes": [3],
    "platform_codes": [2],
    "repository_url": "https://github.com/your-name/your-project",
    "cover_path": "/absolute/path/cover.png"
  }
}
```

案例正文按现有社区规则来自公开 GitHub 仓库的 README。封面支持 JPG、PNG、WebP，上限以社区上传策略为准（当前 10 MiB）。分类编号：1大模型、2综合应用、3环境感知、4人机交互、5外设适配、6比赛、7强化学习；平台编号：1 X3、2 X5、3 S100、4 S600、5其他。可选 `video_embed` 使用 B 站“分享→嵌入代码”的内容；当前社区不支持直接上传案例视频文件。

用户确认预览中的开源分发与原创／授权声明后，调用 `publish_case({confirmation_id:"预览返回的 UUID",confirmed:true,accepted_open_source_license:true})`。创建草稿只保存元数据，不保存 README 快照；MCP 会在调用发布接口前重新预览仓库，版本若与确认时不同，会保留草稿并停止发布。社区发布接口不接受锁定提交版本的参数，这项检查核对的是提交发布前的版本。

### Skill

```json
{
  "content": {
    "kind": "skill",
    "display_name": "X5 摄像头助手",
    "description": "安装依赖并验证摄像头采集。",
    "category": "CODING",
    "developer_signature": "Your Name",
    "contact_email": "you@example.com",
    "version": "1.0.0",
    "package_path": "/absolute/path/camera-helper.zip"
  }
}
```

ZIP 包须包含 `SKILL.md`，不超过 50 MiB；稳定三段式版本号与社区规则一致。可指定 `icon_path`（JPG/PNG/WebP，2 MiB）或 `icon_asset_key`；省略时使用第一个社区预置图标，其 key 会在预览中显示。分类支持 CODING、TESTING、DOCUMENTATION、DESIGN、DATA_ANALYSIS、PRODUCTIVITY、DEVOPS、SECURITY、OTHER。

用户接受开源分发声明后调用 `publish_skill({confirmation_id:"UUID",confirmed:true,accepted_open_source_license:true})`。这是向社区技能中心提交审核，不是向 GitHub 官方 Skill 目录提 PR，也不代表立即公开可安装。

### 论坛帖子

```json
{
  "content": {
    "kind": "forum_post",
    "title": "X5 摄像头识物助手开发记录",
    "markdown": "## 实机效果\n\n{{attachment:0}}\n\n代码和复现步骤……",
    "category_id": 40,
    "tags": ["RDK X5"],
    "attachments": ["/absolute/path/demo.png"]
  }
}
```

分类以论坛当前设置为准，40为“项目与案例”、39为“开发与问题”。`{{attachment:0}}` 对应附件数组下标；未引用的附件会追加到文末。视频使用 Discourse 的 video 标记。用户确认后调用 `publish_forum_post({confirmation_id:"UUID",confirmed:true})`。

## 结果与重试

发布结果返回 id、真实状态和链接。`pending_review`／`reviewing` 是审核中；`submitted` 表示提交已有回执但状态读取失败；只有 `published` 才能说已经发布。用 `get_publication_status({kind:"skill",id:123})` 等查询后续状态。

确认编号仅在当前 MCP 进程内有效。文件、内容或登录账号变化时重新预览。成功的同一编号重复调用返回原结果，不重复创建；网络中断或部分提交失败后，先检查本人工作台及返回的草稿 id，再决定下一步，工具不会自动重发。

## 本地开发验证

`npm test && npm run build` 覆盖本机 HTTP 接口工作流、确认边界和真实 MCP 协议。开发验证允许使用本人会话读取身份、预览和状态；向生产社区发布测试内容仍需用户确认具体内容。
