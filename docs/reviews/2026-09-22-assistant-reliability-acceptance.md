# RDK Assistant MCP 修复交付记录

日期：2026-09-22。基线：`origin/main` 的 `70dfdc8`。按 `docs/superpowers/plans/2026-09-22-assistant-reliability.md` 执行，准备版本 0.2.0。

## 实现与命名

1. 文档缓存使用完整 URL 的 SHA-256 键和单个原子 envelope；校验来源与时间戳，缓存落盘失败不影响成功的网络读取。
2. 客户端和 Skill 更新采用原子替换，保留已有 POSIX 权限；Cursor/ZCode 已有可用配置按原字节保留，错误嵌套结构和启动字段被拒绝，不伪报注册成功。
3. 板卡约束贯穿普通检索、manual 别名和官方入口插入；冲突别名明确报错，真正共享页面保留。正文返回 HTML/索引/论坛/不可用来源，支持哈希保护的续读。
4. Skill 接受同 revision 的 discovery v1 元数据；兼容审核 overlay，但显式返回 missing/stale/invalid/unknown。新增 model_compile、network、role，区分类别导航与词面命中。
5. get_skill 可读取目录 SHA 对应 SKILL.md；默认摘要保持兼容，正文读取有大小/超时限制，分页拒绝内容变化。安装输出不伪称 flat 安装已经锁定版本。
6. 新增 get_status 和只读 --doctor；新 Skill 工具拒绝未知参数。Node prepack 替代 shell 拷贝，提供实际 tarball 安装/协议验证脚本，并加入 Linux/Node 20、Windows/Node 22 的 CI。

对外名称改为 **RDK Assistant MCP**，保留 `rdk-docs-mcp` npm 包/命令、`rdk-docs` 服务配置和 Skill 标识、现有工具名。未迁移 GitHub 仓库、发布新包名或发布 npm。现有安装须在发版后更新并重启，以实际连接的 get_status 为准。

## 验证证据

| 验证 | 结果 |
|---|---|
| 初始基线 | 285 项通过 |
| 最终本机 `npm run verify` | 26 文件、354 项通过，TypeScript 构建通过 |
| 缓存/安装专项 | 43 项通过；碰撞、错误时间戳、写失败、替换失败、权限和配置保留均有 RED→GREEN 证据 |
| 真实文档 `npm run eval:live` | 57/57 检索检查通过；未评估最终答案 |
| 本轮特定场景 | X3/X5 摄像头、manual=x3、X3 案例、X3 GPIO，以及 40PIN 页面续读通过 |
| 实际发布包验证 | 0.2.0 tarball 安装到临时目录后，七个工具、字段、显示名、未知参数拒绝、配套 Skill、doctor 无配置副作用均通过 |
| 独立任务验证 | 12 个真实任务经 MCP 协议执行，12 个精确名称正文读取成功；3 项可直接作范围明确的推荐、9 项需澄清或限定范围，无已证明的实现失败 |
| 独立代码审查 | 首轮发现四项问题，修复后逐项独立回放，无未解决的实质性发现 |

原始问题均先用失败测试复现再修复。审查补充修复包括：官方入口绕过型号过滤、manual 别名丢失型号、JSON 重装丢失自定义项、Rspress 空壳错误标注正文。两个 POSIX mode-bit 测试只在 Windows 跳过；其它原子更新和配置保留测试仍在 Windows 执行。

生产依赖锁文件中 fast-uri、hono、qs 在原有允许范围内更新，`npm audit --omit=dev` 为 0。开发测试依赖仍有两项 moderate 提示（Vitest/mocker，需要大版本升级）；本轮没有变更测试框架主版本。

## 必须保留的证据边界

- 默认匿名 GitHub HEAD API 本轮返回 HTTP 403。标准 `eval:skills` 因而没有通过，不能合并记作整套 live 验证通过。独立验收显式使用 git 查询 HEAD，再从该 SHA 拉取两个真实 raw JSON，仍执行正常目录校验；这证明替代传输下的真实目录流程，不代表默认传输恢复，也没有给服务增加 git 运行依赖。
- 验证目录 revision 为 `08d0a466413f11bbc045ba5e51f626bdb0346373`：97 条、71 条分类、26 条缺失、20 条分类板卡范围未知。上游 discovery 字段的生产者合同已写好；没有声称上游已完成迁移或所有 Skill 都可严格检索。
- 九项 conditional 的原因包括实际模型产物格式未知、候选仅覆盖适配/首帧等阶段，以及硬件范围未确认。取到正文不等于实际部署成功；未执行安装、烧录、硬件操作或完整最终答案准确率评估。
- flat 安装器默认版本策略仍未锁定目录 SHA，输出明确要求实际来源核验。引用文件不会自动取全，图片仍需另行查看。

## 对前期评估的一处更正

早期根据 `/RDK_X5/.../cdev_demo` 的 URL 把它当成仅 X5 文档，证据不充分。实际读取 HTML 发现它同时包含 **RDK X3、X5、Ultra** 的独立章节。新过滤保留匹配 X3 章节的命中是正确行为；不能把 URL 含 X5 一律当作回归失败。机器证据记录了匹配标题、页面哈希和共享章节。真正不匹配的 X5-only、S 系列和 S600-only 入口另有隔离测试及实站验证。

## 执行中的设计决定

- 先改显示名称，保留安装标识；代价是旧技术标识仍带 docs，但避免已有客户端失效。
- 先交付 MCP 对上游 metadata 的读取和验证合同，使用显式健康状态支撑迁移；代价是上游未采用前仍需维护审核 overlay，覆盖不完整。
- 保留 fingerprint 拒绝漂移的机制，通过状态暴露失效，而非放松分类正确性。
- 排除项表示排除目标板卡，允许共享 Skill 服务剩余目标；多板卡内容不被当作单板兼容证明。
- 检测到真实生产依赖公告后，仅更新三个兼容范围内的传递依赖；不通过强制升级改变 Node >=20 的支持声明。

紧凑机器证据：`2026-09-22-assistant-reliability-evidence.json`。独立任务逐项分析：`2026-09-22-assistant-independent-tasks.md`。PR 的远端 CI 结果以 GitHub 实际运行记录为准；本记录不把未运行的平台标成已通过。
