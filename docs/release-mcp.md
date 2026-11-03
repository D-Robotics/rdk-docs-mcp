# 发布 RDK Docs MCP

GitHub Release 与 npm 是两个独立渠道：推送 `mcp-v<版本号>` 标签会生成 GitHub Release 和经校验的 tarball，不会自动发布到 npm。对外安装命令使用 npm 的 `latest`，因此两个渠道都完成后，新用户才会安装到新版本。

## 准备和验证

在隔离副本中执行以下检查，确保副本包含准备发布的全部改动和预置索引。`npm ci` 会替换该副本的 `node_modules`；`verify:package` 的默认模式会在单独的临时副本中构建并打包，不覆盖当前工作区的 `mcp/dist/`、`mcp/skills/` 或 `mcp/SKILL.md`。指定 `--tarball` 时直接验证该归档，不重新构建。

```bash
(
  cd mcp
  npm ci --ignore-scripts
  npm audit --audit-level=moderate
  npm run verify
  npm run eval:offline
  npm run verify:package
  RDK_DOCS_CACHE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rdk-live-check.XXXXXX")" RDK_DOCS_FAIL_ON_STALE=1 npm run verify:live
)
```

`verify:live` 依赖资料中心、论坛和 Skill 目录上游网络；失败时保留错误和实际未完成的项目，不把网络中断当成测试通过。文档检索评测检查检索和页面事实，不评判 Agent 的最终回答。社区生产发布需另行由用户确认具体预览和协议。

版本号同时保存在 `mcp/package.json`、`mcp/package-lock.json` 和更新日志中。已有 GitHub 标签或 npm 版本不得用于另一份源码；先确认本次版本号尚未占用。准备发布的提交合并后，确认工作区干净、当前提交是已验证的提交，并在 GitHub Actions 检查通过后由维护者创建并推送对应标签。

## 核对 GitHub Release

Release 工作流会核对标签与 package 版本、审计依赖、运行测试、离线及在线评测、打包，再对**同一 tarball**运行安装、生产依赖审计与 MCP 协议验证，生成 SHA-256 和来源信息，最后上传 GitHub Release 附件。上游网络不可用时，在线验证会阻止本次 Release；恢复后检查失败原因并重新运行工作流。确认标签对应的工作流成功后，在仓库根目录下载三个附件到新目录：

```bash
version="$(node -p "require('./mcp/package.json').version")"
release_dir="$(mktemp -d "${TMPDIR:-/tmp}/rdk-mcp-release.XXXXXX")"
gh release download "mcp-v${version}" --repo D-Robotics/rdk-docs-mcp \
  --pattern "rdk-docs-mcp-${version}.*" --dir "$release_dir"
(cd "$release_dir" && shasum -a 256 -c "rdk-docs-mcp-${version}.tgz.sha256")
node -e '
  const fs = require("node:fs");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (p.sourceRepository !== "D-Robotics/rdk-docs-mcp" ||
      p.sourceRevision !== process.argv[2] || p.version !== process.argv[3]) {
    throw new Error("Release provenance does not match this repository, commit and version");
  }
  console.log("Source revision and version match");
' "$release_dir/rdk-docs-mcp-${version}.provenance.json" "$(git rev-parse HEAD)" "$version"
npm --prefix mcp run verify:package -- --tarball "$release_dir/rdk-docs-mcp-${version}.tgz"
```

来源 JSON 记录构建时的仓库和提交，不是独立签名证明；同时查看对应的 GitHub Actions 运行记录。不要改动校验后的 tarball。

## 发布到 npm

维护者使用具有该包发布权限的 npm 身份完成必要的登录和双因素验证，然后发布上一步核对过的同一个 tarball：

```bash
npm publish "$release_dir/rdk-docs-mcp-${version}.tgz" --access public
npm view "rdk-docs-mcp@${version}" version
npm view rdk-docs-mcp dist-tags.latest
```

只有 registry 返回目标版本且 `latest` 指向该版本后，`npx -y rdk-docs-mcp@latest` 才会获取它。已运行的 MCP 进程须重启，再用 `get_status` 核对实际连接版本。不要在聊天、脚本或日志中粘贴 npm 凭据。
