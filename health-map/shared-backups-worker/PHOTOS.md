# 地点图片

图片复用现有又拍云空间及服务端 `UPYUN_BUCKET`、`UPYUN_OPERATOR`、`UPYUN_PASSWORD` 配置，存储在 `photos/<服务端生成的 UUID>.<扩展名>`。不需要额外公开存储凭据或数据库迁移。

- `POST /photos?name=<文件名>`：二进制请求体，`Content-Type` 为 `image/jpeg`、`image/png` 或 `image/webp`；单文件最多 5 MB，检查文件头。要求允许的 Origin，独立限制每 IP 每分钟 12 次上传。
- `GET /photos/<id>`：通过 Worker 获取图片，固定类型并设置 nosniff 和不可变缓存；错误不缓存。
- Cloudflare Pages 的 `/api/photos` 和 `/api/photos/<id>` 通过已有 `SHARED_BACKUPS` 服务绑定转发。
- 前端复用 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL`；每个地点最多 6 张图片。备份保存图片 ID、名称、类型及大小，旧备份兼容。
- 上传完成后才允许保存地点；编辑或取消只修改地点引用，不物理删除云端图片，避免破坏已有共享或导出备份。未保存、取消或移除的图片可能留在空间中；清理对象前必须核实备份引用。
- 图片链接可公开访问；不应上传私人资料。文件头检查只验证允许的格式标识，不进行内容审核或完整图片解码。

## 本地验收

在 `health-map/` 执行 `npm run test:shared:db`、`npm run test:shared:preview`，并让本地 `.env.local` 的 `NEXT_PUBLIC_SHARED_BACKUPS_API_URL=http://localhost:8788`。执行 `npm run dev` 后访问 `http://localhost:5173/`。

该预览 Worker 使用内存对象存储和本地 D1，不会写入真实又拍云，重启后测试图片失效。可验证上传、展示、编辑移除、刷新及备份引用。真实又拍云验证可使用本地 `npm run shared:dev` 和现有私有 `.dev.vars`，不得输出密钥或将其加入版本控制。

本地测试成功并获得用户对本次版本的明确批准后，发布现有 Worker 的更新（含新增 `PHOTO_UPLOAD_LIMITER`），再发布 Pages 的前端、图片函数与 `_routes.json`，并验证线上图片上传和读取。未经批准不得执行任何远程部署或 GitHub 写入。
