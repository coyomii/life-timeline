# 人生时间线 — 开发文档

> 本文档供下次继续开发时快速上手，记录项目结构、技术栈、数据模型和常见操作。

---

## 1. 项目概述

一个纯本地的「人生时间线」记录系统，用于记录生活中的大小事情。支持日记、标签、心情、图片、外部链接、回收站、统计等功能。

- **设计风格**：参考 [Ech0](https://github.com/lin-snow/Ech0) 的温暖纸质风格
- **技术栈**：Node.js + Express + SQLite（`node:sqlite`）+ 纯前端（vanilla HTML/CSS/JS）
- **数据存储**：SQLite 数据库（`life.db`），单文件零配置
- **运行环境**：Windows / macOS / Linux（需 Node.js 22+）

---

## 2. 快速启动

```bash
# 进入项目目录
cd C:\Users\hp\Downloads\cc_talk\workspace\projects\life-timeline

# 安装依赖（如未安装）
npm install

# 启动服务器
node server.js

# 访问
# 本机：http://localhost:3000
# 局域网：http://<本机IP>:3000
```

---

## 3. 项目结构

```
life-timeline/
├── server.js              # Express 后端（API 路由）
├── database.js            # SQLite 数据层（读写 life.db）
├── life.db                # SQLite 数据库（entries, tags, entry_tags）
├── package.json           # 依赖：express, multer
├── public/                # 静态资源（前端）
│   ├── index.html         # 页面结构
│   ├── style.css          # Ech0 风格样式
│   ├── app.js             # 前端逻辑
│   └── uploads/           # 上传的图片
├── docs/                  # 规划文档
│   └── collection-feature-plan.md  # 收藏功能规划（已取消）
└── DEVELOPMENT.md         # 本文件
```

---

## 4. 数据模型

### SQLite 表结构

数据库 `life.db` 包含 3 张表：

```sql
-- 日记记录表
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  mood TEXT,
  location TEXT,
  images TEXT,          -- JSON 字符串：["/uploads/xxx.jpg"]
  links TEXT,           -- JSON 字符串：["https://..."]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT       -- 软删除时间戳，NULL 表示未删除
);

-- 标签表
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- 日记-标签关联表
CREATE TABLE entry_tags (
  entry_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 自增主键 |
| `date` | TEXT | 日期，格式 `YYYY-MM-DD` |
| `title` | TEXT | 标题（必填） |
| `content` | TEXT | 正文内容 |
| `mood` | TEXT | 心情 emoji |
| `location` | TEXT | 地点 |
| `images` | TEXT | JSON 字符串，图片 URL 列表 |
| `links` | TEXT | JSON 字符串，外部链接列表 |
| `created_at` | TEXT | ISO 创建时间 |
| `updated_at` | TEXT | ISO 更新时间 |
| `deleted_at` | TEXT | 软删除时间戳 |

---

## 5. API 路由

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/entries?limit=&offset=&tag=&search=&year=` | 获取记录列表（支持筛选分页） |
| POST | `/api/entries` | 创建记录 |
| GET | `/api/entries/:id` | 获取单条记录 |
| PUT | `/api/entries/:id` | 更新记录 |
| DELETE | `/api/entries/:id` | 软删除（移到回收站） |
| GET | `/api/trash` | 获取回收站记录 |
| POST | `/api/trash/:id/restore` | 恢复记录 |
| DELETE | `/api/trash/:id` | 彻底删除 |
| GET | `/api/tags` | 获取所有标签及计数 |
| GET | `/api/stats` | 获取统计数据 |
| POST | `/api/upload` | 图片上传（multipart，最多10张） |
| GET | `/api/export` | 导出所有记录 |
| POST | `/api/shutdown` | 关闭服务器 |

---

## 6. Git 工作流

项目使用 feature 分支开发，新功能在独立分支上实现，满意后合并到 main：

```bash
# 查看当前分支
git branch

# 当前在 main 分支，所有历史功能已合并
# 如需开发新功能，从 main 切出新分支：
git checkout main
git checkout -b feature/xxx

# 开发完成后合并回 main：
git checkout main
git merge feature/xxx
git branch -d feature/xxx
```

### 提交历史（feature/sqlite-storage 分支）

```
cf03d04 docs: 添加 AI 开发声明
b59bf37 chore: 忽略 SQLite 数据库和备份文件
51c98ee feat: 使用 SQLite 替换 JSON 文件存储
```

### 历史合并记录

```
e1d69c9 Merge branch 'feature/entry-links'
7a70c1d docs: 添加开发文档 DEVELOPMENT.md
b63d518 feat: 日记支持附加相关链接
ce47e43 chore: 更新数据文件和规划文档
b12e719 fix: 放宽布局宽度，减少宽屏边缘空旷感
0a01d78 refactor: 参考 Ech0 项目全面重设计 UI
802958b fix: 清理乱码标签数据
4d78851 feat: UI视觉升级与交互动画
07aba20 feat: 人生时间线系统初始版本
```

---

## 7. 设计系统（Ech0 风格）

CSS 变量定义在 `style.css` `:root` 中：

| 变量 | 值 | 用途 |
|------|-----|------|
| `--canvas` | `#f4f1ec` | 页面背景（温暖米色） |
| `--surface` | `#ffffff` | 卡片背景 |
| `--text-primary` | `#33251d` | 主文字（深棕） |
| `--text-secondary` | `#5b4f46` | 次文字 |
| `--text-muted` | `#8e847d` | 辅助文字 |
| `--accent` | `#b84200` | 强调色（ burnt orange ） |
| `--accent-soft` | `#f4e3cd` | 强调色浅色背景 |
| `--font-serif` | `"Noto Serif SC", ...` | 标题字体 |
| `--font-sans` | `system-ui, "PingFang SC", ...` | 正文字体 |

---

## 8. 开发注意事项

### 修改后必须重启服务器
Node.js 不会自动热重载，修改 `server.js` 或 `database.js` 后需要：
```bash
# 关闭旧进程（Windows）
taskkill //F //IM node.exe

# 重新启动
node server.js
```

### 前端文件无需重启
修改 `public/` 下的 HTML/CSS/JS 后，浏览器刷新即可生效。

### 数据备份
`life.db` 是 SQLite 单文件数据库，备份方式：
- 直接复制 `life.db` 文件
- 通过 `/api/export` 导出 JSON 备份
- 首次启动时若存在 `life-data.json`，会自动迁移到 SQLite 并备份为 `.bak`

### Windows 终端编码问题
在 Git Bash 中使用 curl 发送中文时可能出现乱码，建议通过浏览器 UI 操作或使用 API 工具（如 Postman）。

---

## 9. 已知问题 / 待优化

- [ ] 图片存储在本地，无云同步
- [ ] 搜索仅支持标题和内容，不支持链接搜索
- [ ] 移动端适配可进一步优化
- [ ] 收藏/下载功能已规划（`docs/collection-feature-plan.md`），用户已取消，如需实现可参考该文档
- [ ] 数据库迁移逻辑为一次性，后续如需再次迁移需手动处理

---

## 10. 联系方式

如有问题或建议，随时继续开发。
