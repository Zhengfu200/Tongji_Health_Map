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

## 尚需真实上线验证

Cloudflare 账号认证成功，但当前令牌在发布接口收到“无权访问资源”。发布需要补齐 Workers 创建/部署权限。GitHub fine-grained token 已保存于被忽略的本地 `.dev.vars`；使用该令牌读取备份仓库 `main` 分支返回 HTTP 200，写入权限及真实上传尚待上线验证。

完成凭据配置后按 README 发布 Worker、设置 Secret，再把真实 HTTPS API 地址加入本地、Vercel 与 EdgeOne 构建环境；EdgeOne 实际域名还需加入来源白名单。随后验证真实仓库上传、跨浏览器读取及 Cloudflare CPU/接口额度。当前构建验证不代表线上共享服务已启用。
