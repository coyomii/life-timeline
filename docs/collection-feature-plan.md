# 收藏/本地化功能规划

## 1. 数据模型

在 SQLite 数据库 `life.db` 中新增 `collections` 表：

```sql
CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- bilibili | xiaohongshu | weixin | local
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  local_path TEXT,                 -- 如 collections/bilibili/xxx/
  files TEXT,                      -- JSON 字符串：["video.mp4", "cover.jpg"]
  thumbnail TEXT,                  -- 缩略图路径
  tags TEXT,                       -- JSON 字符串：["收藏", "B站"]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT                    -- JSON 字符串：{author, duration, platformId}
);
```

示例数据：

```json
{
  "id": 1,
  "type": "bilibili",
  "title": "视频标题",
  "description": "简介/描述",
  "source_url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "local_path": "collections/bilibili/xxx/",
  "files": ["video.mp4", "cover.jpg"],
  "thumbnail": "collections/bilibili/xxx/cover.jpg",
  "tags": ["收藏", "B站"],
  "created_at": "2026-05-20T10:00:00Z",
  "updated_at": "2026-05-20T10:00:00Z",
  "metadata": {
    "author": "UP主名",
    "duration": "10:32",
    "platformId": "BV1xx411c7mD"
  }
}
```

## 2. 文件存储结构

```
life-timeline/
├── public/
│   ├── uploads/          # 日记图片（已有）
│   └── collections/      # 收藏内容
│       ├── bilibili/
│       │   └── {collectionId}/
│       │       ├── info.json
│       │       ├── video.mp4
│       │       ├── cover.jpg
│       │       └── danmaku.xml
│       ├── xiaohongshu/
│       │   └── {collectionId}/
│       │       ├── info.json
│       │       ├── images/
│       │       │   ├── 01.jpg
│       │       │   └── 02.jpg
│       │       └── text.md
│       ├── weixin/
│       │   └── {collectionId}/
│       │       ├── info.json
│       │       ├── article.html
│       │       └── images/
│       └── local/
│           └── {collectionId}/
│               ├── info.json
│               └── original-file.*
```

## 3. 后端 API 设计

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/collections/download | URL 下载（B站/小红书/公众号） |
| POST | /api/collections/upload | 本地文件上传 |
| GET  | /api/collections | 获取收藏列表（支持筛选） |
| GET  | /api/collections/:id | 获取单个收藏详情 |
| PUT  | /api/collections/:id | 更新收藏（标题、标签） |
| DELETE | /api/collections/:id | 删除收藏及本地文件 |
| GET  | /api/collections/tags | 获取所有收藏标签 |
| GET  | /api/collections/stats | 收藏统计 |

### 请求示例

**URL 下载：**
```json
POST /api/collections/download
{
  "url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "tags": ["收藏"]
}
```

**本地上传：**
```
POST /api/collections/upload (multipart/form-data)
- file: <二进制文件>
- title: "文件名"
- tags: "音乐,纯音乐"
```

## 4. 前端 UI 设计

### 导航扩展
侧边栏导航新增「收藏」按钮（放在「统计」和「回收站」之间）：

```
📅 时间线
🏷️ 标签
📊 统计
📦 收藏   ← 新增
🗑️ 回收站
```

### 新增视图

#### 4.1 收藏列表视图 (`#collectionsView`)
- 顶部工具栏：
  - URL 输入框 + 下载按钮（粘贴 B站/小红书/公众号链接）
  - 本地上传按钮（打开文件选择器）
  - 类型筛选标签（全部 / B站 / 小红书 / 公众号 / 本地文件）
- 内容区：卡片网格布局
  - 视频卡片：缩略图 + 标题 + 来源平台图标 + 标签
  - 图片卡片：首图预览 + 标题
  - 文档卡片：文件类型图标 + 标题
  - 音频卡片：封面图 + 标题 + 时长

#### 4.2 收藏详情弹窗
- 左侧：内容预览区（视频播放器 / 图片画廊 / 文本阅读器 / 音频播放器）
- 右侧：元信息（标题、来源URL、下载时间、标签编辑）
- 底部：删除按钮

#### 4.3 标签云（复用现有组件，数据源改为 collectionTags）

### 卡片设计（Ech0 风格）
```css
.collection-card {
  background: var(--surface);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgb(45 40 37 / 6%);
  transition: transform 0.2s, box-shadow 0.2s;
}
.collection-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgb(45 40 37 / 10%);
}
.collection-card .thumbnail {
  aspect-ratio: 16/10;
  object-fit: cover;
  background: var(--canvas);
}
```

## 5. 技术选型

### 5.1 B站视频下载
**方案：yt-dlp**（推荐）
- 成熟稳定，支持 B站、YouTube 等 1000+ 站点
- Windows 提供独立 exe，无需 Python 环境
- 支持下载视频、封面、弹幕、元数据
- 命令示例：
  ```bash
  yt-dlp.exe -o "collections/bilibili/%(id)s/%(title)s.%(ext)s" \
    --write-thumbnail --embed-metadata \
    "https://www.bilibili.com/video/BV1xx411c7mD"
  ```

**备选：you-get**
- 国产工具，对国内站点支持好
- 但 yt-dlp 功能更全、更新更勤

### 5.2 小红书下载
**方案：Puppeteer / Playwright**
- 小红书无公开 API，需模拟浏览器抓取
- Playwright 更现代，支持自动等待、截图
- 流程：
  1. 用 Playwright 打开笔记 URL
  2. 等待图片加载完成
  3. 提取图片 URL、标题、正文
  4. 下载所有图片到本地

**风险**：小红书有反爬机制，可能需要处理滑块验证码

### 5.3 微信公众号文章下载
**方案：Playwright + 内容提取**
- 公众号文章有防盗链，直接 curl 不行
- 用 Playwright 渲染页面，提取正文和配图
- 保存为离线 HTML（内嵌 base64 图片）或 markdown

### 5.4 本地文件处理
**现有 multer 可直接复用**，扩展允许的文件类型：
```js
const allowedTypes = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac'],
  document: ['text/plain', 'application/pdf', 'application/epub+zip']
};
```

## 6. 实现阶段

### 第一阶段：基础框架（1-2 天）
- [ ] 在 `life.db` 中创建 `collections` 表
- [ ] 在 `database.js` 中新增 collections CRUD 方法，或新建 `routes/collections.js`
- [ ] 前端新增「收藏」导航和列表视图
- [ ] 本地文件上传功能（复用 multer，扩展文件类型）
- [ ] 提交 git

### 第二阶段：B站下载（2-3 天）
- [ ] 集成 yt-dlp，检测是否已安装
- [ ] 实现 URL 解析和下载流程
- [ ] 下载进度反馈（SSE 或轮询）
- [ ] 视频卡片预览（HTML5 video 标签）
- [ ] 提交 git

### 第三阶段：小红书 + 公众号（3-4 天）
- [ ] 安装 Playwright
- [ ] 实现小红书笔记抓取
- [ ] 实现公众号文章抓取
- [ ] 处理反爬（UA 伪装、延迟、错误重试）
- [ ] 提交 git

### 第四阶段：体验优化（2 天）
- [ ] 收藏内容播放器/阅读器
- [ ] 搜索和筛选功能
- [ ] 标签与日记标签互通
- [ ] 统计页增加收藏数据
- [ ] 提交 git

## 7. 风险提示

| 风险 | 等级 | 说明 | 应对 |
|------|------|------|------|
| 版权风险 | 高 | 下载受版权保护的内容 | 仅用于个人收藏，不传播；下载前提示用户 |
| 平台反爬 | 中 | 小红书/公众号可能封 IP 或要求验证码 | 降低频率、模拟真实浏览器、失败时提示手动保存 |
| yt-dlp 兼容性 | 低 | B站接口变更导致下载失败 | yt-dlp 社区更新快，及时升级即可 |
| 存储空间 | 中 | 视频文件占用大 | 提供质量选项（720p/1080p）、定期清理提醒 |
| Windows 路径 | 低 | 长路径、特殊字符导致保存失败 | 文件名做 slug 化处理 |

## 8. 立即开始第一阶段？

第一阶段改动相对独立，不影响现有日记功能。可以立即开始：
1. 改 `database.js` 支持 collections 读写
2. 新建 `routes/collections.js`
3. 改 `index.html` 加导航和视图
4. 改 `app.js` 加收藏逻辑
5. 改 `style.css` 加卡片样式

确认后我立即开始实现。
