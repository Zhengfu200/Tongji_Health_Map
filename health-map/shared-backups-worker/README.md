# GitHub 共享备份接口

前端通过 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL` 调用独立 Worker。本接口不使用 D1、R2、KV 或付费套餐。仓库为 [Zhengfu200/Tongji_Health_Map_Backups](https://github.com/Zhengfu200/Tongji_Health_Map_Backups)，初始化 `main` 分支和 `index.json`，内容为 `{"version":1,"items":[]}`。

生产前端：[tongji-health-map.pages.dev](https://tongji-health-map.pages.dev/)。共享接口为 `https://tongji-health-map-backups.lgy0822.workers.dev`，已配置 GitHub Secret，Pages Production 连接此地址。本地隔离验收连接模拟接口 `http://localhost:8788`；线上构建使用 Pages Production 中配置的 HTTPS 接口。

## 本地真实仓库测试

从 `health-map` 目录执行：

1. 将 `.dev.vars.example` 复制为 `.dev.vars`（已有文件不要覆盖），设置 `GITHUB_TOKEN`。在 GitHub 的 Fine-grained tokens 页面只选备份仓库，Repository permissions → Contents → Read and write。不要使用 GitHub CLI 的账号级 OAuth 令牌。
2. 在 `.env.local` 添加 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL=http://localhost:8787`。
3. `npm.cmd run shared:dev` 启动真实接口（本地日期兼容当前安装的运行时，生产仍使用配置中的日期）；重新启动 `npm.cmd run dev`。
4. 上传后检查公开仓库及另一个浏览器中的共享列表。本地上传也会写入公共仓库。

未配置前端地址时显示服务未启用；配置了地址但后端缺少有效令牌时显示配置或凭据错误。失败保留个人数据、表单和重试 ID。

## 发布 Worker

```powershell
npm.cmd run shared:login
# 编辑 wrangler.jsonc 的 ALLOWED_ORIGINS，加入实际 EdgeOne 域名（仅来源，不带路径）
npm.cmd run shared:types
npm.cmd run shared:deploy
npm.cmd run shared:secret
```

`shared:secret` 从忽略的 `.dev.vars` 读取 fine-grained token，经标准输入设置 Workers Secret，不打印令牌。Cloudflare 登录需要网站所有者完成；多账号时先在配置中设置 `account_id`。保留 Workers Free 套餐，不自动升级。也可在忽略的 `.env.shared-deploy` 中设置 `CLOUDFLARE_API_TOKEN`；部署脚本优先使用该值。令牌必须拥有创建及部署 Worker 的权限，仅能认证账号的令牌不足以发布。

首次创建需 Workers 产品级 `Admin`；已有 Worker 的部署及 Secret 管理可缩小为该 Worker 的 `Editor`。参见 [Cloudflare Workers 权限说明](https://developers.cloudflare.com/workers/authorization/workers/)。

将发布返回的 HTTPS 地址配置为本地、Vercel Production 和静态导出构建时的 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL`，再重新构建前端。不要把 localhost 地址放进线上构建。EdgeOne 需要重新生成上传包；Vercel 需要重新部署。跨域白名单同时适用于列表和上传。

先用两个浏览器完成上传和读取，再在 Cloudflare 的 Worker 指标中检查实际 CPU 时间、请求量及异常；免费套餐有每次 CPU 限制，1 MB 上限不是对所有大小都能在免费 CPU 额度内完成的承诺。GitHub 的 API 也有限流，界面会提示稍后重试。HTTP 上传按 IP 每分钟 3 次进行限流；该限制按 Cloudflare 节点执行，并非全站精确配额。

## 数据与接口

- `POST /backups`：`{id,name,creator,backup}`，成功返回 `{summary}`，ID 为 UUID v4。仅发布已保存的非空 v1 GCJ-02 标注，规范化 JSON 不超过 1 MB，请求体最多额外 4 KB。
- `GET /backups?cursor=<last-id>&selectedId=<id>`：`{items,nextCursor?,selectedExists?}`，参数均可选，每页 20 项，按服务器上传时间和 ID 倒序。传入 `selectedId` 时返回该备份是否仍在索引中且对应普通 JSON 文件存在；无效 ID 返回 400。
- `GET /backups/<id>`：`{summary,backup}`；JSON 仍可用原来的导入功能读取。
- `summary` 包含 `id,name,creator,createdAt,places,routes,byteSize`。
- GitHub 一次提交写入 `backups/<id>.json` 和 `index.json`；基于最新树创建，非强制推进 `main`，避免覆盖其他文件。并发冲突最多重试三次。
- 相同 ID、名称、创建者和备份重复上传返回原结果；更改内容使用新 ID，已有 ID 的不同内容返回冲突。读取用同一提交版本取得索引和文件。
- 索引上限为 4 MB，超出时停止接收新备份并提示维护者处理；读取不会悄悄截断列表。
- 列表用三次 GitHub 请求读取分支提交、该提交的索引和递归文件树。仅显示存在的普通 `backups/<id>.json` 文件；在完整索引中定位游标后过滤，因此游标文件被删除也能继续分页。文件树最多读取 8 MB；截断、格式错误、限流或故障返回错误，不能用不完整文件树推断删除。
- 错误统一为 `{error:{code}}`，覆盖非法输入、大小、来源、找不到、冲突、限流、凭据和服务故障；不会向浏览器返回令牌或上游请求详情。

本版本没有登录、上传者身份验证或网站删除入口。名称及 JSON 公开，包括 Git 提交历史。管理员仅删除 JSON 文件即可在刷新后隐藏该条目，索引保持不变；恢复同名文件后条目重新显示。确认当前查看的备份已删除时，前端清空共享地图和详情、重置筛选、禁用下载；个人标注不变。读取失败保留当前地图，旧请求不会覆盖新选择。

## 隔离验证

```powershell
npm.cmd test
npm.cmd run shared:dry-run
# 以下仅启动模拟 GitHub 的测试 API，不写公共仓库
npm.cmd run test:shared:preview
# 将 .env.local 的 NEXT_PUBLIC_SHARED_BACKUPS_API_URL 设置为 http://localhost:8788
# 在另一个终端启动前端
npm.cmd run dev
```

模拟接口仅用于验证，不得发布 `tests/shared-preview.wrangler.jsonc`；生产部署脚本只引用 `shared-backups-worker/wrangler.jsonc`。测试入口固定使用内存 GitHub 模拟器和虚拟令牌，不读取真实 GitHub 凭据，不写公共仓库；重启后模拟备份消失。仅测试入口提供 `POST /__test/backups/<id>/delete-file`，生成仅删除 JSON、保留索引的模拟提交；生产入口没有此接口。

在 PowerShell 中模拟删除，然后在网页刷新列表：

```powershell
$testBackups = Invoke-RestMethod http://localhost:8788/backups
$testBackupId = $testBackups.items[0].id
Invoke-RestMethod -Method Post "http://localhost:8788/__test/backups/$testBackupId/delete-file"
```
