# 又拍云共享备份接口

Cloudflare Pages 网站通过同域 `/api/backups` 调用 Pages Function；Function 使用 `SHARED_BACKUPS` 服务绑定调用 tongji-health-map-backups Worker。Worker 用 D1 查询共享列表，用又拍云云存储保存 backups/<UUID>.json。浏览器不直接请求 Worker 的 workers.dev 域名或又拍云。旧 GitHub 仓库保留作历史归档；新服务从空列表开始，不迁移旧备份。

## 又拍云准备

1. 在[又拍云](https://www.upyun.com/)注册并完成实名认证。控制台选择「云产品 → 云存储 → 创建服务」，存储类型选「标准」。当前服务名为 tongji-health-map，已填写到 wrangler.jsonc 的 UPYUN_BUCKET。
2. 创建或授权一个仅用于此服务的操作员，允许读取、上传和删除文件。把操作员名填到 wrangler.jsonc 的 UPYUN_OPERATOR，保存操作员密码供下一步设置 Secret。
3. 将 .dev.vars.example 复制为被 Git 忽略的 shared-backups-worker/.dev.vars，填入 UPYUN_PASSWORD。另生成至少 32 字符的随机 ADMIN_TOKEN，用于管理删除；两项都不能提交到 Git。不要使用又拍云的测试域名作为正式入口，本服务也不需要用到它。

又拍云 REST API 使用 https://v0.api.upyun.com、HTTPS 和操作员签名。首次上传若 backups 目录不存在，Worker 会先创建目录再重试。密码只保存在 Worker Secret 与本地忽略文件中，网页永远不获取它。

## D1 与部署

Cloudflare 账号已创建亚太区域 D1 数据库 tongji-shared-backups，数据库 ID 已写入 wrangler.jsonc，初始迁移已在远端执行。若换 Cloudflare 账号，需要创建同名 D1、替换数据库 ID，再运行远端迁移。

在 health-map 目录执行：

    npm.cmd run shared:db:local
    npm.cmd run shared:types
    npm.cmd test
    npm.cmd run shared:dry-run
    npm.cmd run shared:secret
    npm.cmd run shared:deploy

shared:secret 从忽略的 .dev.vars 读取 UPYUN_PASSWORD 和 ADMIN_TOKEN，通过标准输入设置 Worker Secret，不打印值。shared:deploy 发布现有 Worker。不要在又拍云服务和 Secret 未准备好时发布新 Worker。

Pages 项目 tongji-health-map 的 Production 和 Preview 都要将 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL` 设为 `/api`，并将服务绑定 `SHARED_BACKUPS` 指向 Worker `tongji-health-map-backups`。提交 `health-map/functions` 的代理路由后重新构建 Pages；浏览器请求 `/api/backups` 和 `/api/backups/<UUID>`。`public/_routes.json` 限制 Functions 只处理备份 API，地图静态文件仍由 Pages 提供。其他站点的 API 环境变量暂不修改。旧 workers.dev 地址短期保留作回退入口。

旧 Worker 的 GITHUB_TOKEN Secret 已在切换后移除。若旧 GitHub 令牌只供备份仓库使用，请在 GitHub 账户设置中撤销；仓库本身继续保留。

本地真实又拍云联调：执行 npm.cmd run shared:db:local，配置 .dev.vars，再启动 npm.cmd run shared:dev；把前端本地环境变量 NEXT_PUBLIC_SHARED_BACKUPS_API_URL 设为 http://localhost:8787 并重启前端。本地真实上传会写入又拍云服务。

## 接口与一致性

- POST /backups：上传已保存、非空的 v1 GCJ-02 备份；规范化 JSON 不超过 1 MB。D1 先插入不可见的 pending 行；又拍云 PUT 成功后改为 ready。失败时前端保留同一 UUID，可用相同内容重试；同一 UUID 的不同内容返回冲突。
- GET /backups?cursor=<last-id>&selectedId=<id>：D1 查询已完成的备份，按创建时间及 ID 倒序，每页 20 项；游标即使已删除仍可继续翻页。传入 selectedId 时额外向又拍云确认文件存在；确认缺失后标记删除。D1 或又拍云故障返回错误，不把故障解释为删除。
- GET /backups/<id>：查询 D1 元数据，然后从又拍云读取并校验 JSON。文件确实不存在时标记删除并返回 404。
- DELETE /admin/backups/<id>：仅携带 Authorization: Bearer <ADMIN_TOKEN> 的管理员可调用。先删除又拍云对象，再将 D1 行标记为 deleted；重复请求可用于恢复中途失败的删除。请使用此接口管理删除，直接在又拍云控制台删文件会留下元数据，直到有人选择或打开该备份才会被发现。

所有公开响应保持 Cache-Control: no-store。上传按 IP 每分钟最多 3 次，沿用原来的跨域白名单。又拍云或 D1 达到用量上限时，接口应返回明确错误，不返回截断列表。没有上传者登录或网站删除入口；共享 JSON 及其名称、创建者对网站访客可见。

管理员删除示例（先在当前 PowerShell 会话中设置自己的令牌）：

    $env:TONGJI_ADMIN_TOKEN = '<ADMIN_TOKEN>'
    $backupId = '<要删除的 UUID>'
    Invoke-RestMethod -Method Delete -Uri "https://tongji-health-map.pages.dev/api/admin/backups/$backupId" -Headers @{ Authorization = "Bearer $env:TONGJI_ADMIN_TOKEN" }

## 隔离验证与上线检查

    npm.cmd test
    npm.cmd run test:shared:db
    npm.cmd run test:shared:preview

预览 Worker 使用本地 D1 与内存模拟又拍云，不会读取真实凭据或写入真实服务。它仅供测试，提供 POST /__test/backups/<id>/delete-file 以模拟文件丢失；生产 Worker 没有此路径。

在国内同一网络比较旧 workers.dev 接口与 Pages 同域 `/api/backups` 的浏览器 Network 成功率和耗时，并用两个独立浏览器验证上传、列表、只读加载、删除以及个人标注保持不变。确认浏览器的共享备份请求均指向 pages.dev，不再直连 workers.dev。检查 Worker 错误和 D1 读写用量；D1 免费额度耗尽时查询会失败。Pages Function 与 Worker 仍运行在 Cloudflare 网络，具体提速幅度以实际测量为准。
