# 共享备份验证记录

验证日期：2026-09-29。

## 已通过

- `npm.cmd test`：33 项测试通过。覆盖原有地图行为、原子提交、并发合并与重试上限、上传 ID 幂等、20 项分页、非法 JSON/坐标/大小、CORS、限流、GitHub 凭据和服务失败、只读查看及本地数据保留、请求乱序、上传失败保留表单、Workers 全局 fetch 调用上下文。
- `next typegen` 与 `npm.cmd run typecheck`。
- `npm.cmd run build`（Vinext）、`next build`（Vercel）和 `npm.cmd run build:static`（EdgeOne 静态导出）。
- `npm.cmd run shared:dry-run`：生产 Worker 构建成功，没有 D1、R2 或 KV 绑定。
- 使用本地 Workers 运行时和模拟 GitHub 接口，两个独立 Edge 浏览器会话完成实际界面验证：A 创建并上传一个地点和一条路线；B 保留自己的地点，刷新共享列表并加载 A 的备份；地图显示地点和路线、分类筛选可用、禁止编辑和新建，返回个人地图后数据与 localStorage 原文保持不变。
- 手机 390×844 和桌面布局、中英文切换。手机长列表滚动后可以使用固定的切换栏返回个人地图。
- 静态产物未检出 GitHub/Cloudflare 凭据标识或测试令牌；本地凭据文件被 Git 和 Vercel 上传排除。
- 已创建公开仓库 `Zhengfu200/Tongji_Health_Map_Backups`，初始化 `main` 和空索引。模拟测试未写入真实仓库。
- 已启用真实本地 Worker（localhost:8787），读取 GitHub 的共享列表返回 HTTP 200，来源 localhost:5173 的跨域访问正常。前端 `.env.local` 已配置该地址并重启，在独立浏览器中验证共享列表空状态正常，有已保存标注时上传按钮启用。该轮验证没有上传测试标注到公共仓库。

## 真实上线验证

Workers Admin 权限已由网站所有者补齐，Worker 已部署至 `https://tongji-health-map-backups.lgy0822.workers.dev`，GitHub 令牌已设置为 Workers Secret。Pages Production 和本地前端均已连接这个接口。现有 Pages 来源已加入白名单；高德配置在重新构建后正常。

- 生产网站实际界面上传返回 HTTP 201；两个地点和一条路线通过原子提交进入真实 GitHub 仓库。
- 第二个独立浏览器读取列表并加载该备份，地图和分类筛选正常，编辑及新建被禁止；返回个人地图后个人标注和 localStorage 原文保持不变。
- 验证备份已通过一次非强制 Git 提交同步移除 JSON 文件和索引项，原有用户备份保留。验证使用已公开的备份数据；Git 历史仍保留验证提交。
- GraphQL 查询的上线验证请求均为 success，错误数为 0；已读取 CPU 分位和请求量。小型 JSON 样本约 1.3 KB，样本中 CPU P99 最高约 12 ms。免费套餐名义 CPU 限额为 10 ms，平台允许偶发超限的弹性；此轮没有触发 CPU 错误，也未增加付费订阅。不能据此保证接近 1 MB 的文件都能在免费 CPU 额度内成功，较大文件仍需性能验证及必要优化。参见 [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)。

Vercel 和 EdgeOne 的线上接口变量与重新部署未包含在本次 Pages 配置中；EdgeOne 实际域名还需加入来源白名单。
