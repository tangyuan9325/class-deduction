# 班级量化考核管理系统 · GitHub Pages 在线版（v1.1.0）

在线地址：`https://tangyuan9325.github.io/class-deduction/`

## 这是什么

本项目是一个「班级量化考核管理系统」的静态在线版，采用 **GitHub 仓库即数据库** 方案：
前端页面通过 GitHub API + Token 读写本仓库 `docs/data/db.json`，实现跨设备持久化与多端实时同步（每 5 秒轮询）。

## 功能清单（v1.1.0）

- 班级看板（累计扣分/加分/净分、类别分布、近 14 天趋势、TOP5）
- 周/学期小结（班级或个人）
- 同学扣分汇总（每日/每周/每月）
- 录入扣分（学习/寝室/日常/两操，按权限）
- 录入加分（1.1.0 新增独立权限）
- 扣分记录（筛选/导出/撤销）
- 个人统计
- 意见反馈（同步 GitHub Issues 入口）
- 用户管理（建号/权限分配/重置密码）
- 班级看板只读账号 `kandban`（1.1.0 新增）
- 保持登录 / 临时登录
- 更新日志（首次进入展示）
- 克隆仓库引导

## 默认账号

| 角色 | 账号 | 密码 | 说明 |
|---|---|---|---|
| 管理员 | admin | admin123 | 全部权限 |
| 班主任 | banzhuren | 123456 | 全部权限 |
| 班级看板 | kandban | 123456 | 只读看板 |
| 学生 | stu+学号 | 123456 | 首登需改密 |

## 数据存储与安全说明

⚠️ **重要**：本在线版为演示 / 校内使用设计。页面中的写令牌以混淆形式存在于前端源码，任何访问者均可通过开发者工具提取（与经典「换座位」项目同一模式）。**请勿**在真实敏感生产环境使用此方案；生产环境请使用仓库内的 Go 后端（Gin + SQLite + JWT）。

- 数据文件：`docs/data/db.json`
- 写令牌：`docs/gh-token.js`（运行时还原）
- 实时同步：多端每 5 秒轮询 Pages 静态文件 / GitHub API

## 本地部署

```bash
git clone https://github.com/tangyuan9325/class-deduction.git
# 在线版：直接打开 docs/index.html 或使用任意静态服务器托管 docs 目录
# 本地完整版（含 Go 后端）：
cd class-deduction
go build -o class-deduction ./cmd && ./class-deduction
# 浏览器访问 http://localhost:8080
```

## 提交反馈

- 页面内「意见反馈」可直接提交
- 或到 [GitHub Issues](https://github.com/tangyuan9325/class-deduction/issues) 反馈
