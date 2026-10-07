# 同济大学健康生活地图 · Tongji Health Map

面向同济大学四平路校区的校园健康资源地图。你可以标注常用地点、记录步行路线，并通过共享备份向其他人分享自己的校园生活地图。

## 在线演示

**[打开同济大学健康生活地图](https://tongji-health-map.pages.dev/)**

首次打开可查看内置使用说明。地图、地点搜索和步行规划依赖高德地图服务；共享备份与图片功能依赖后端服务。

## 项目功能

| 功能 | 说明 |
| --- | --- |
| 校园地图 | 以四平路校区为初始视野，支持标准地图与卫星地图切换。 |
| 地点标注 | 点击地图或搜索地点后添加标注，可编辑中英文名称、地址、开放时间、联系方式和说明，支持拖动调整位置与删除。 |
| 健康资源分类 | 提供校医院、心理咨询、运动健身、健康餐饮、安静休息区、国际学生服务六类地点，支持分类筛选。 |
| 校园及周边搜索 | 搜索校区中心约 3 公里内的地点，结合高德周边搜索与输入提示，支持中英文常用称呼匹配、结果去重和分页加载。 |
| 地点图片 | 每个地点最多上传 6 张 JPG、PNG 或 WebP 图片，每张不超过 5 MB，支持查看和移除图片引用。 |
| 手绘路线 | 逐点绘制路线，支持撤销、追加、拖动及删除节点，保存路线名称、说明和长度。 |
| 步行规划与导航 | 选择地图位置或已标注地点作为起终点，预览高德步行路线、距离和预计时间；地点详情可跳转至高德导航。 |
| 个人备份 | 个人地点和路线保存在当前浏览器，可导出或导入 JSON 备份。 |
| 共享备份 | 上传已保存标注的快照，填写备份名称与创建者；可只读查看、同时勾选多份备份在地图上显示，并下载 JSON。 |
| 双语与移动端 | 支持中文、英文切换，适配桌面和手机，并提供内置使用说明。 |

### 数据保存说明

- 个人标注存储在浏览器 `localStorage` 中，换设备、换浏览器或清除网站数据后不会自动同步，请定期导出备份。
- 导入 JSON 会替换当前浏览器中的全部个人标注，操作前请先导出现有数据。备份使用 `v1` 格式和 `GCJ-02` 坐标系。
- 共享备份是上传时的快照，后续个人修改不会自动更新已上传内容；只读查看共享备份不会覆盖个人标注。
- 共享备份的名称、创建者及标注对访客公开；图片存储在又拍云，持有图片链接的人可以查看。请勿上传私人资料。
- 搜索结果和自动路线取决于高德收录的数据，未收录的地点或校园小路可自行标注、手绘记录。

## 技术栈

- **界面**：React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Lucide 图标。
- **开发与构建**：Next.js App Router 目录结构，默认使用 Vinext / Vite 运行开发服务；静态导出使用 Next.js。
- **地图**：高德地图 JS API 2.0，提供底图、POI 搜索、输入提示与步行规划。
- **共享服务**：Cloudflare Pages Functions 转发同域 API，Cloudflare Worker 处理业务，D1 保存共享备份元数据，又拍云保存备份 JSON 与地点图片。
- **测试**：Node.js Test Runner、Testing Library、JSDOM 与模拟高德 SDK。

## 文件结构

以下列出主要源码与配置文件，省略依赖目录、构建产物及本地凭据文件。

```text
Tongji_Health_Map/
├── README.md                       # 项目介绍、功能与文件结构
├── .gitignore
└── health-map/                     # 网站项目
    ├── app/
    │   ├── page.tsx                # 首页入口
    │   ├── layout.tsx              # 页面布局与元信息
    │   └── globals.css             # 全局样式
    ├── components/
    │   ├── health-map.tsx          # 地图主界面与标注交互
    │   ├── shared-backup-panel.tsx # 共享备份列表与选择
    │   ├── place-photos.tsx        # 地点图片上传与展示
    │   ├── user-guide.tsx          # 使用说明弹窗
    │   ├── category-icon.tsx       # 分类图标
    │   └── ui/                    # 通用 UI 组件
    ├── lib/
    │   ├── amap.ts                # 高德地图 SDK 封装
    │   ├── model.ts               # 地点、路线与备份模型及校验
    │   ├── place-search.ts        # 地点搜索、匹配和分页
    │   ├── navigation.ts          # 高德导航链接
    │   ├── shared-backups.ts      # 共享备份客户端
    │   ├── pages-shared-backup-proxy.ts # Pages API 代理逻辑
    │   ├── place-photos.ts        # 图片请求与上传逻辑
    │   ├── photo-model.ts         # 图片数据模型与校验
    │   ├── i18n.ts                # 中英文界面文案
    │   ├── user-guide.ts          # 中英文使用说明
    │   ├── category-icons.ts      # 分类图标映射
    │   └── utils.ts               # 通用工具
    ├── functions/api/             # Cloudflare Pages Functions
    │   ├── backups/               # 备份列表、上传及读取
    │   ├── photos/                # 图片上传及读取
    │   └── admin/backups/         # 管理员删除备份
    ├── shared-backups-worker/
    │   ├── index.ts               # 共享服务 Worker 入口
    │   ├── upyun-store.ts         # 又拍云对象存储封装
    │   ├── migrations/            # D1 数据库迁移
    │   ├── wrangler.jsonc         # Worker 配置
    │   ├── .dev.vars.example      # 服务端本地变量示例
    │   ├── README.md              # 共享服务配置与接口说明
    │   ├── PHOTOS.md              # 图片功能说明
    │   └── VERIFICATION.md        # 后端验证记录
    ├── tests/                     # 模型、服务和界面测试及隔离预览
    ├── scripts/                   # 安装、启动、构建及后端管理脚本
    ├── hooks/                     # 移动端等 React Hooks
    ├── public/                    # 站点图标与 Pages 路由配置
    ├── build/                     # Vite 插件
    ├── vendor/                    # 本地样式依赖及许可
    ├── .env.example               # 前端环境变量示例
    ├── package.json               # 依赖与 npm 命令
    ├── vite.config.ts             # Vite / Vinext 配置
    ├── next.config.ts             # Next.js 与静态导出配置
    ├── tsconfig.json              # TypeScript 配置
    ├── eslint.config.mjs          # ESLint 配置
    ├── postcss.config.mjs         # PostCSS 配置
    ├── components.json            # UI 组件配置
    ├── vercel.json                # Vercel 构建配置
    └── CHECKS.md                   # 本地与历史上线检查记录
```
