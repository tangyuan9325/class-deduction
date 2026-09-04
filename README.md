# 班级量化考核管理系统

基于 Go + Gin + GORM 后端与 Vue3 前端构成的班级扣分管理平台，支持**学习 / 寝室 / 日常 / 两操**四大类扣分录入、班主任账户、**扣分权限分配**、记录查询、个人统计、班级看板、Excel 导出与**数据实时同步（SSE）**。

## 功能特性

- **认证授权**：JWT 登录，支持 `admin`（管理员）/ `teacher`（班主任）/ `student`（学生）三种角色
- **班主任账户**：默认账号 `banzhuren`（初始密码 `123456`），姓名默认“崔孝禹”，可在用户管理中修改
- **四大扣分类别**：学习（各科作业上交情况）/ 寝室 / 日常 / 两操，内置常见扣分项目（作业未交选科目与分数；寝室类：地未拖 / 灯未关 / 垃圾未倒 / 地不干净 / 熄灯后聊天 / 床铺不整 / 物品摆放乱 等）
- **扣分权限分配**：班主任可给学生分配“可录入的扣分类别”；未分配该类权限的学生录入该类别扣分时返回 403 提示“请联系班主任分配”
- **扣分录入**：按四大类批量录入，科目/项目来自数据字典，可自定义
- **记录管理**：多条件筛选、分页、导出 Excel、管理员/班主任撤销
- **统计分析**：班级看板（占比饼图、每日趋势、扣分排名 TOP10）、个人统计（科目分布、最近明细）
- **用户管理**：管理员可创建 / 编辑 / 重置密码 / 删除用户、修改班主任姓名；班主任可查看学生并分配扣分权限
- **数据实时同步（SSE）**：后端事件总线 + `/api/v1/events`；任一客户端录入/撤销扣分或变更用户后，所有在线页面的看板、记录、统计自动实时刷新
- **前端**：Vue3 + Element Plus + ECharts（源码在 `web/src`，构建产物在 `web/dist`，由后端直接托管）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.26+, Gin, GORM, JWT, SQLite(默认)/MySQL |
| 前端 | Vue3 + Vite + Element Plus + ECharts（`web/src` 源码，`web/dist` 构建产物） |
| 实时同步 | Server-Sent Events（`internal/realtime/hub.go` + 前端 `MainLayout.vue`） |
| 数据库 | SQLite（开箱即用）/ MySQL（可选） |

## 快速开始（本地）

```bash
# 1. 运行后端（自动初始化数据库、默认管理员 admin/admin123、班主任 banzhuren/123456）
go build -o class-deduction ./cmd
./class-deduction            # 监听 :8080（可用 APP_SERVER_PORT 换端口）
# 2. （可选）重新构建 Vue 前端
cd web
npm install
npm run build
cd ..
```

访问 http://localhost:8080 即可使用。
默认账号：`admin / admin123`（管理员）、`banzhuren / 123456`（班主任，姓名崔孝禹）；学生账号为 `stu+学号`，初始密码 `123456`。

## 导入班级名单

将学生名单（姓名/学号/性别）整理为 Excel 后，可运行项目内置 `prepare_data.py` 从 `2706名单.xls` 一键导入学生并初始化班级数据：

```bash
python3 prepare_data.py
```

脚本会：登录 admin → 清理测试残留记录与用户 → 读取名单（跳过标题行）→ 批量创建 `stu+学号` 学生账号（密码 123456）→ 输出导入统计。

## 扣分权限说明

- `admin` 与 `teacher`（班主任）拥有全部四类扣分权限
- `student`（学生）需由班主任/管理员在“用户管理 → 分配权限”中勾选可录入的类别；未授权类别录入时返回 403
- 权限数据存放在 `user_permissions` 表（user_id / category / granted_by）

## 数据实时同步说明

- 后端：`internal/realtime/hub.go` 维护全局事件总线；记录新增/删除、用户变更时调用 `realtime.Publish(...)` 广播
- 接口：`GET /api/v1/events`（SSE，需 JWT，token 可经 `?token=` 传递）
- 前端：`web/src/layouts/MainLayout.vue` 用 EventSource 订阅，收到 `data_changed` 事件后通过 `window.dispatchEvent('app:data-changed')` 广播，各页面监听后自动刷新

## 配置

配置文件：`config/config.yaml`，支持环境变量覆盖（前缀 `APP_`，如 `APP_SERVER_PORT`）。

- `server.port`：HTTP 端口（默认 8080）
- `database.driver`：`sqlite` / `mysql`
- `database.dsn`：SQLite 文件名或 MySQL DSN
- `jwt.secret`：JWT 签名密钥
- `jwt.expire_hours`：Token 有效期（小时）

## API 概览

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | /api/v1/auth/login | 登录 | 公开 |
| GET | /api/v1/auth/me | 当前用户信息 | 登录 |
| GET | /api/v1/events | 实时事件流（SSE） | 登录 |
| POST | /api/v1/records | 批量录入扣分（按权限校验类别） | 登录 |
| GET | /api/v1/records | 分页查询记录 | 登录 |
| DELETE | /api/v1/records/:id | 撤销记录 | 管理员/班主任 |
| GET | /api/v1/dictionaries | 数据字典（四类） | 登录 |
| GET | /api/v1/stats/personal | 个人统计 | 登录 |
| GET | /api/v1/stats/overview | 班级看板 | 登录 |
| GET | /api/v1/export/records | 导出 Excel | 登录 |
| GET | /api/v1/users | 用户列表 | 管理员/班主任 |
| GET | /api/v1/users/students | 学生列表 | 登录 |
| POST | /api/v1/users | 创建用户 | 管理员 |
| PUT | /api/v1/users/:id | 更新用户（含班主任改名） | 管理员 |
| PUT | /api/v1/users/:id/password | 重置密码 | 管理员 |
| DELETE | /api/v1/users/:id | 删除用户 | 管理员 |
| GET | /api/v1/permissions/user/:id | 查询用户扣分权限 | 管理员/班主任 |
| PUT | /api/v1/permissions/user/:id | 设置用户扣分权限 | 管理员/班主任 |

## 目录结构

```
cmd/              程序入口
config/           配置加载与配置文件
internal/
  handler/        HTTP 处理层
  middleware/     CORS / 日志 / JWT / 角色校验
  model/          数据模型与自动迁移、种子数据
  realtime/       实时事件总线（SSE 广播）
  repo/           数据访问层
  router/         路由注册与静态资源服务
  service/        业务逻辑层
pkg/              通用包（错误码 / JWT / 日志 / 响应）
web/              Vue3 前端源码（src）与构建产物（dist）
.github/workflows/deploy.yml   GitHub Action 构建 / 测试 / 部署
```

## 线上部署（GitHub Actions）

`main` 分支推送会自动执行 CI（构建 + 冒烟测试 + 产出 Linux 二进制）。

如需通过 Actions 自动部署到你的服务器，请先在仓库 `Settings → Secrets and variables → Actions` 配置：

**Variables（变量）**
- `DEPLOY_ENABLED` = `true`（开启部署 Job）

**Secrets（密钥）**
- `DEPLOY_HOST`：服务器 IP/域名
- `DEPLOY_USER`：SSH 用户名
- `DEPLOY_SSH_KEY`：SSH 私钥（PEM）
- `DEPLOY_PORT`：SSH 端口（默认 22）
- `DEPLOY_PATH`（可选）：部署目录，默认 `/opt/class-deduction`
- `DEPLOY_APP_PORT`（可选）：服务端口，默认 8080
- `APP_GITHUB_TOKEN`（可选）：GitHub PAT，用于「意见反馈 → Issues 同步」
- `ROSTER_CSV`（可选）：学生名单（CSV 文本：`姓名,学号,性别`），**存入 Secret 而非仓库**，首次部署时自动创建学生账号
- `ADMIN_PASSWORD`（可选）：导入名单用的管理员密码，默认 admin123

**部署策略（安全性 & 持久化）**
- 部署仅同步 `二进制 + web/dist + config + scripts`，**绝不覆盖服务器 `data/` 目录** → SQLite 数据库持久化，升级不丢数据
- 学生名单含个人信息，**只存于 Secret**，不进入公开仓库；部署时写入服务器 `data/roster.csv`（权限 600）并通过导入脚本幂等创建账号
- GitHub 令牌通过环境变量 `APP_GITHUB_TOKEN` 注入，不写入仓库
- 服务以 systemd 托管（无 systemd 则 nohup 回退），重启自愈
- 实时更新（SSE）：Go 服务直跑自身端口，事件流不被代理缓冲，`/api/v1/events` 正常推送

**手动导入名单（不使用 Actions 时）**
```bash
python3 scripts/import_students.py --base-url http://localhost:8080 --csv roster.csv
```
