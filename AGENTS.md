# 仓库代理指令

开始处理本仓库的任何新需求或后续修改之前，必须阅读并遵守根目录的 [agent.md](agent.md)。该文件是本仓库的本地测试与发布规则。

强制顺序：本地修改 → localhost 网站实际测试成功 → 用户验收并明确批准本次发布 → 更新 GitHub 和 Cloudflare Pages。

未经本次明确批准，不得进行任何 GitHub 远程写入或 Cloudflare Pages 部署，包括会自动触发部署的 Git 推送。
