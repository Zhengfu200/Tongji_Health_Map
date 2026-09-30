# 共享备份验证记录

## 又拍云 + D1 迁移（2026-09-30）

- 已在 Cloudflare 账号创建亚太区域 D1 数据库 tongji-shared-backups，并应用初始表迁移；生产库无备份记录，按既定选择从空列表开始。
- 本地 47 项测试通过，覆盖 D1 分页、又拍云签名、首次创建目录、上传重试、管理删除、缺失文件、限流与现有前端只读视图；Next typegen、类型检查、Vinext 构建及 Worker dry-run 构建通过。
- 本地 Wrangler 预览使用真实本地 D1 与内存模拟存储，空列表、上传、详情、模拟删除及 selectedExists 正常。又用本地 Worker、本地 D1 和真实又拍云服务 tongji-health-map 完成小型备份上传、读取、同 ID 重试和删除。第一次删除遇到又拍云临时 429，稍后重试成功；第二次完整联调全部成功。测试备份均已删除。
- 已设置生产 Worker 的 UPYUN_PASSWORD 和 ADMIN_TOKEN Secret，部署版本 e1df119d-f443-4273-92cc-bdfa71527c6e，并移除旧 GITHUB_TOKEN Secret。部署绑定为服务 tongji-health-map、操作员 zhengfu202 和 D1 tongji-shared-backups。
- 当前网络的 workers.dev 域名解析到了非 Cloudflare 地址，直连生产 URL 超时，远程预览请求也无法完成。因此尚未从浏览器完成生产上传、读取、删除和切换前后耗时对比；国内访问仍受 workers.dev 可达性影响。以下旧记录只描述此前 GitHub 版本。

验证日期：2026-09-29。

## 删除文件自动隐藏：本地验收记录

- `npm.cmd test`：42 项测试通过。新增删除一项/多项/全部、恢复同名文件、隐藏无索引文件、普通文件判断、20 项分页与删除游标、同提交读取、三次请求预算、无效 selectedId、文件树截断/超限/格式错误/限流/失败，以及刷新失效旧详情、晚到删除结果不能清空新选择等验证。
- 类型检查、Vinext 构建、Next/Vercel 构建、静态导出和生产 Worker dry-run 构建通过。Next 构建需与 Vinext 开发服务器顺序运行，避免两者同时改写 `.next/types/routes`。静态、Vinext 和生产 Worker 产物未检出 GitHub/Cloudflare 令牌标识、测试令牌或测试删除路径。
- 前端 localhost:5173 连接 localhost:8788 的模拟 GitHub Worker，不读取真实 GitHub 令牌，不写公开仓库。测试删除控制接口仅存在于测试入口，生产构建不含该路径。
- 两个独立 Edge 会话：预置隔离的个人测试标注；A 通过上传弹窗分享一个地点和一条路线，B 从列表加载并验证分类与只读详情。删除模拟 JSON 后刷新，条目、详情及地图标记消失，下载被禁用；B 的个人存储原文前后相同，返回个人地图后地点恢复。
- 中文删除提示、英文提示和 390×844 手机布局已验证，手机无横向溢出；两个浏览器未记录页面错误。
- 本地验收阶段未推送 GitHub、未发布生产 Worker、未更新 Pages。网站所有者之后已明确同意发布，使用生产 Worker 和 GitHub main → Pages 自动部署流程。下方为之前版本的历史验证记录。

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
