const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const {
  initDatabase, createEntry, updateEntry, getEntryById, listEntries,
  softDeleteEntry, restoreEntry, permanentlyDeleteEntry,
  setEntryTags, getEntryTags, getAllTags, getStats, exportAllEntries
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ============ 辅助函数 ============

function enrichWithTags(entry) {
  if (!entry) return null;
  return { ...entry, tags: getEntryTags(entry.id) };
}

// ============ API 路由 ============

// 创建记录
app.post('/api/entries', (req, res) => {
  try {
    const { date, title, content, mood, location, tags = [], images = [], links = [] } = req.body;
    let entry = createEntry({ date, title, content, mood, location, images, links });
    setEntryTags(entry.id, tags);
    res.json({ success: true, data: enrichWithTags(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有记录（支持筛选和分页）
app.get('/api/entries', (req, res) => {
  try {
    const { tag, search, year, month, limit = 50, offset = 0 } = req.query;
    const { entries, total } = listEntries({ tag, search, year, month, limit: parseInt(limit), offset: parseInt(offset) });

    res.json({
      success: true,
      data: entries.map(enrichWithTags),
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单条记录
app.get('/api/entries/:id', (req, res) => {
  try {
    const entry = getEntryById(parseInt(req.params.id));
    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, data: enrichWithTags(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新记录
app.put('/api/entries/:id', (req, res) => {
  try {
    const { date, title, content, mood, location, tags = [], images = [], links = [] } = req.body;
    const entry = updateEntry(parseInt(req.params.id), { date, title, content, mood, location, images, links });

    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }

    setEntryTags(entry.id, tags);
    res.json({ success: true, data: enrichWithTags(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 软删除记录（移到回收站）
app.delete('/api/entries/:id', (req, res) => {
  try {
    softDeleteEntry(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取回收站记录
app.get('/api/trash', (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { entries, total } = listEntries({ includeDeleted: true, limit: parseInt(limit), offset: parseInt(offset) });

    res.json({
      success: true,
      data: entries.map(enrichWithTags),
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 恢复记录
app.post('/api/trash/:id/restore', (req, res) => {
  try {
    const entry = restoreEntry(parseInt(req.params.id));
    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, data: enrichWithTags(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 彻底删除记录
app.delete('/api/trash/:id', (req, res) => {
  try {
    permanentlyDeleteEntry(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有标签
app.get('/api/tags', (req, res) => {
  try {
    res.json({ success: true, data: getAllTags() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取统计信息
app.get('/api/stats', (req, res) => {
  try {
    res.json({ success: true, data: getStats() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 图片上传
app.post('/api/upload', upload.array('images', 10), (req, res) => {
  try {
    const files = req.files || [];
    const urls = files.map(f => '/uploads/' + f.filename);
    res.json({ success: true, data: urls });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 导出数据库
app.get('/api/export', (req, res) => {
  try {
    const entries = exportAllEntries();
    res.json({
      success: true,
      data: entries.map(enrichWithTags)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 关闭服务器
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: '服务器正在关闭...' });
  setTimeout(() => process.exit(0), 500);
});

// 获取本机局域网IP
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

// 启动服务器
initDatabase();
app.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`\n========================================`);
  console.log(`人生时间记录系统已启动！`);
  console.log(`========================================`);
  console.log(`本机访问: http://localhost:${PORT}`);
  if (localIP) {
    console.log(`局域网访问: http://${localIP}:${PORT}`);
  }
  console.log(`数据库: ${path.join(__dirname, 'life.db')}`);
  console.log(`========================================\n`);
});
