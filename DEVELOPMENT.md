# 人生时间线 — 开发文档

> 本文档供下次继续开发时快速上手，记录项目结构、技术栈、数据模型和常见操作。

---

## 1. 项目概述

一个纯本地的「人生时间线」记录系统，用于记录生活中的大小事情。支持日记、标签、心情、图片、外部链接、回收站、统计等功能。

- **设计风格**：参考 [Ech0](https://github.com/lin-snow/Ech0) 的温暖纸质风格
- **技术栈**：Node.js + Express + 纯前端（vanilla HTML/CSS/JS）
- **数据存储**：JSON 文件（`life-data.json`），无数据库依赖
- **运行环境**：Windows / macOS / Linux

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
├── database.js            # JSON 数据层（读写 life-data.json）
├── life-data.json         # 数据文件（entries, tags, entryTags）
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

### `life-data.json` 结构

```json
{
  "entries": [
    {
      "id": 1,
      "date": "2026-05-20",
      "title": "标题",
      "content": "内容",
      "mood": "😊",
      "location": "地点",
      "images": ["/uploads/xxx.jpg"],
      "links": ["https://..."],
      "created_at": "2026-05-20T10:00:00Z",
      "updated_at": "2026-05-20T10:00:00Z",
      "deleted_at": null
    }
  ],
  "tags": [
    { "id": 1, "name": "生活" }
  ],
  "entryTags": [
    { "entry_id": 1, "tag_id": 1 }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 自增主键 |
| `date` | string | 日期，格式 `YYYY-MM-DD` |
| `title` | string | 标题（必填） |
| `content` | string/null | 正文内容 |
| `mood` | string/null | 心情 emoji |
| `location` | string/null | 地点 |
| `images` | array/null | 图片 URL 列表 |
| `links` | array | 外部链接列表（2026-05-20 新增） |
| `created_at` | string | ISO 创建时间 |
| `updated_at` | string | ISO 更新时间 |
| `deleted_at` | string/null | 软删除时间戳 |

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

### 提交历史

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
`life-data.json` 是唯一的持久化存储，重要数据请定期备份。

### Windows 终端编码问题
在 Git Bash 中使用 curl 发送中文时可能出现乱码，建议通过浏览器 UI 操作或使用 API 工具（如 Postman）。

---

## 9. 已知问题 / 待优化

- [ ] 没有数据备份机制
- [ ] 图片存储在本地，无云同步
- [ ] 搜索仅支持标题和内容，不支持链接搜索
- [ ] 移动端适配可进一步优化
- [ ] 收藏/下载功能已规划（`docs/collection-feature-plan.md`），用户已取消，如需实现可参考该文档

---

## 10. 联系方式

如有问题或建议，随时继续开发。
