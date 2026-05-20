const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const { initDatabase, getData, save } = require('./database');

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

function getEntryTags(entryId) {
  const data = getData();
  const tagIds = data.entryTags
    .filter(et => et.entry_id === entryId)
    .map(et => et.tag_id);
  return data.tags
    .filter(t => tagIds.includes(t.id))
    .map(t => t.name);
}

function setEntryTags(entryId, tagNames) {
  const data = getData();
  // 清除旧标签关联
  data.entryTags = data.entryTags.filter(et => et.entry_id !== entryId);

  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    let tag = data.tags.find(t => t.name === trimmed);
    if (!tag) {
      tag = { id: data.tags.length > 0 ? Math.max(...data.tags.map(t => t.id)) + 1 : 1, name: trimmed };
      data.tags.push(tag);
    }

    data.entryTags.push({ entry_id: entryId, tag_id: tag.id });
  }
  save();
}

function enrichEntry(entry) {
  if (!entry) return null;
  return { ...entry, tags: getEntryTags(entry.id) };
}

function filterEntries({ tag, search, year, month, includeDeleted = false }) {
  const data = getData();
  let entries = [...data.entries];

  // 默认排除已删除的记录
  if (!includeDeleted) {
    entries = entries.filter(e => !e.deleted_at);
  } else {
    entries = entries.filter(e => e.deleted_at);
  }

  if (tag) {
    const tagObj = data.tags.find(t => t.name === tag);
    if (tagObj) {
      const entryIds = data.entryTags
        .filter(et => et.tag_id === tagObj.id)
        .map(et => et.entry_id);
      entries = entries.filter(e => entryIds.includes(e.id));
    } else {
      entries = [];
    }
  }

  if (search) {
    const lower = search.toLowerCase();
    entries = entries.filter(e =>
      (e.title && e.title.toLowerCase().includes(lower)) ||
      (e.content && e.content.toLowerCase().includes(lower))
    );
  }

  if (year) {
    entries = entries.filter(e => e.date && e.date.startsWith(year));
  }

  if (month) {
    const m = month.padStart(2, '0');
    entries = entries.filter(e => e.date && e.date.substring(5, 7) === m);
  }

  // 按日期降序，日期相同按创建时间降序
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return entries;
}

// ============ API 路由 ============

// 创建记录
app.post('/api/entries', (req, res) => {
  try {
    const { date, title, content, mood, location, tags = [], images = [], links = [] } = req.body;
    const data = getData();

    const entry = {
      id: data.entries.length > 0 ? Math.max(...data.entries.map(e => e.id)) + 1 : 1,
      date,
      title,
      content: content || null,
      mood: mood || null,
      location: location || null,
      images: images || null,
      links: links || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    data.entries.push(entry);
    save();
    setEntryTags(entry.id, tags);

    res.json({ success: true, data: enrichEntry(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有记录（支持筛选和分页）
app.get('/api/entries', (req, res) => {
  try {
    const { tag, search, year, month, limit = 50, offset = 0 } = req.query;
    const entries = filterEntries({ tag, search, year, month });
    const total = entries.length;
    const paginated = entries.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: paginated.map(enrichEntry),
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单条记录
app.get('/api/entries/:id', (req, res) => {
  try {
    const data = getData();
    const entry = data.entries.find(e => e.id === parseInt(req.params.id));
    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, data: enrichEntry(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新记录
app.put('/api/entries/:id', (req, res) => {
  try {
    const { date, title, content, mood, location, tags = [], images = [], links = [] } = req.body;
    const data = getData();
    const entry = data.entries.find(e => e.id === parseInt(req.params.id));

    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }

    entry.date = date;
    entry.title = title;
    entry.content = content || null;
    entry.mood = mood || null;
    entry.location = location || null;
    entry.images = images || null;
    entry.links = links || [];
    entry.updated_at = new Date().toISOString();
    save();

    setEntryTags(entry.id, tags);
    res.json({ success: true, data: enrichEntry(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 软删除记录（移到回收站）
app.delete('/api/entries/:id', (req, res) => {
  try {
    const data = getData();
    const entry = data.entries.find(e => e.id === parseInt(req.params.id));
    if (entry) {
      entry.deleted_at = new Date().toISOString();
      save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取回收站记录
app.get('/api/trash', (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const entries = filterEntries({ includeDeleted: true });
    const total = entries.length;
    const paginated = entries.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: paginated.map(enrichEntry),
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 恢复记录
app.post('/api/trash/:id/restore', (req, res) => {
  try {
    const data = getData();
    const entry = data.entries.find(e => e.id === parseInt(req.params.id));
    if (!entry) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    delete entry.deleted_at;
    save();
    res.json({ success: true, data: enrichEntry(entry) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 彻底删除记录
app.delete('/api/trash/:id', (req, res) => {
  try {
    const data = getData();
    const idx = data.entries.findIndex(e => e.id === parseInt(req.params.id));
    if (idx >= 0) {
      data.entries.splice(idx, 1);
      data.entryTags = data.entryTags.filter(et => et.entry_id !== parseInt(req.params.id));
      save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有标签
app.get('/api/tags', (req, res) => {
  try {
    const data = getData();
    const tagCounts = data.tags.map(tag => {
      const count = data.entryTags.filter(et => et.tag_id === tag.id).length;
      return { name: tag.name, count };
    }).sort((a, b) => b.count - a.count);

    res.json({ success: true, data: tagCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取统计信息
app.get('/api/stats', (req, res) => {
  try {
    const data = getData();
    const activeEntries = data.entries.filter(e => !e.deleted_at);
    const totalEntries = activeEntries.length;
    const totalTags = data.tags.length;

    // 年份统计（排除已删除）
    const yearMap = {};
    for (const entry of activeEntries) {
      if (entry.date) {
        const year = entry.date.substring(0, 4);
        yearMap[year] = (yearMap[year] || 0) + 1;
      }
    }
    const yearStats = Object.entries(yearMap)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year.localeCompare(a.year));

    // 心情统计（排除已删除）
    const moodMap = {};
    for (const entry of activeEntries) {
      if (entry.mood) {
        moodMap[entry.mood] = (moodMap[entry.mood] || 0) + 1;
      }
    }
    const moodStats = Object.entries(moodMap)
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: { totalEntries, totalTags, yearStats, moodStats }
    });
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
    const data = getData();
    const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));
    res.json({
      success: true,
      data: entries.map(enrichEntry)
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
  console.log(`数据文件: ${path.join(__dirname, 'life-data.json')}`);
  console.log(`========================================\n`);
});
