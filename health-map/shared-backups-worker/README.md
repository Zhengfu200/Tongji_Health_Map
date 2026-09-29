# GitHub 共享备份接口

前端通过 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL` 调用独立 Worker。本接口不使用 D1、R2、KV 或付费套餐。仓库为 [Zhengfu200/Tongji_Health_Map_Backups](https://github.com/Zhengfu200/Tongji_Health_Map_Backups)，初始化 `main` 分支和 `index.json`，内容为 `{"version":1,"items":[]}`。

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
- `GET /backups?cursor=<last-id>`：`{items,nextCursor?}`，每页 20 项，按服务器上传时间和 ID 倒序。
- `GET /backups/<id>`：`{summary,backup}`；JSON 仍可用原来的导入功能读取。
- `summary` 包含 `id,name,creator,createdAt,places,routes,byteSize`。
- GitHub 一次提交写入 `backups/<id>.json` 和 `index.json`；基于最新树创建，非强制推进 `main`，避免覆盖其他文件。并发冲突最多重试三次。
- 相同 ID、名称、创建者和备份重复上传返回原结果；更改内容使用新 ID，已有 ID 的不同内容返回冲突。读取用同一提交版本取得索引和文件。
- 索引上限为 4 MB，超出时停止接收新备份并提示维护者处理；读取不会悄悄截断列表。
- 错误统一为 `{error:{code}}`，覆盖非法输入、大小、来源、找不到、冲突、限流、凭据和服务故障；不会向浏览器返回令牌或上游请求详情。

本版本没有登录、上传者身份验证或网站删除入口。名称及 JSON 永久公开，包括 Git 提交历史。人工维护需同步修改索引和相应文件。

## 隔离验证

```powershell
npm.cmd test
npm.cmd run shared:dry-run
# 以下仅启动模拟 GitHub 的测试 API，不写公共仓库
npm.cmd run test:shared:preview
# 在另一个终端启动隔离前端；主测试网址仍为 localhost:5173
$env:NEXT_PUBLIC_SHARED_BACKUPS_API_URL='http://localhost:8788'
node node_modules/vite/bin/vite.js --port 5174
```

模拟接口仅用于验证，不得发布 `tests/shared-preview.wrangler.jsonc`；生产部署脚本只引用 `shared-backups-worker/wrangler.jsonc`。浏览器测试数据不会进入默认站点或真实仓库。
