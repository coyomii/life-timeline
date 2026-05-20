const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'life.db');
const JSON_PATH = path.join(__dirname, 'life-data.json');
const JSON_BACKUP_PATH = path.join(__dirname, 'life-data.json.bak');

let db;

function initDatabase() {
  db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      mood TEXT,
      location TEXT,
      images TEXT,
      links TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (entry_id, tag_id),
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS idx_entries_deleted ON entries(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON entry_tags(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);
  `);

  migrateFromJson();
  console.log('SQLite 数据存储已就绪');
}

function migrateFromJson() {
  if (!fs.existsSync(JSON_PATH)) return;

  const count = db.prepare('SELECT COUNT(*) as count FROM entries').get().count;
  if (count > 0) return;

  try {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const data = JSON.parse(raw);

    const insertEntry = db.prepare(`
      INSERT INTO entries (id, date, title, content, mood, location, images, links, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)
    `);

    const insertEntryTag = db.prepare(`
      INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)
    `);

    for (const entry of data.entries || []) {
      insertEntry.run(
        entry.id,
        entry.date,
        entry.title,
        entry.content || null,
        entry.mood || null,
        entry.location || null,
        entry.images ? JSON.stringify(entry.images) : null,
        entry.links ? JSON.stringify(entry.links) : null,
        entry.created_at,
        entry.updated_at,
        entry.deleted_at || null
      );
    }

    for (const tag of data.tags || []) {
      insertTag.run(tag.id, tag.name);
    }

    for (const et of data.entryTags || []) {
      insertEntryTag.run(et.entry_id, et.tag_id);
    }

    // 迁移完成后备份并删除 JSON 文件
    fs.renameSync(JSON_PATH, JSON_BACKUP_PATH);
    console.log(`已迁移 ${data.entries?.length || 0} 条记录到 SQLite，原 JSON 文件已备份为 life-data.json.bak`);
  } catch (err) {
    console.error('迁移 JSON 数据失败:', err.message);
  }
}

// ============ entries ============

function createEntry({ date, title, content, mood, location, images, links }) {
  const result = db.prepare(`
    INSERT INTO entries (date, title, content, mood, location, images, links, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date,
    title,
    content || null,
    mood || null,
    location || null,
    images && images.length > 0 ? JSON.stringify(images) : null,
    links && links.length > 0 ? JSON.stringify(links) : null,
    new Date().toISOString(),
    new Date().toISOString()
  );
  return getEntryById(Number(result.lastInsertRowid));
}

function updateEntry(id, { date, title, content, mood, location, images, links }) {
  db.prepare(`
    UPDATE entries
    SET date = ?, title = ?, content = ?, mood = ?, location = ?, images = ?, links = ?, updated_at = ?
    WHERE id = ?
  `).run(
    date,
    title,
    content || null,
    mood || null,
    location || null,
    images && images.length > 0 ? JSON.stringify(images) : null,
    links && links.length > 0 ? JSON.stringify(links) : null,
    new Date().toISOString(),
    id
  );
  return getEntryById(id);
}

function softDeleteEntry(id) {
  db.prepare(`UPDATE entries SET deleted_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  return getEntryById(id);
}

function restoreEntry(id) {
  db.prepare(`UPDATE entries SET deleted_at = NULL WHERE id = ?`).run(id);
  return getEntryById(id);
}

function permanentlyDeleteEntry(id) {
  db.prepare(`DELETE FROM entry_tags WHERE entry_id = ?`).run(id);
  const result = db.prepare(`DELETE FROM entries WHERE id = ?`).run(id);
  return result.changes > 0;
}

function getEntryById(id) {
  const row = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id);
  if (!row) return null;
  return rowToEntry(row);
}

function listEntries({ tag, search, year, month, limit = 50, offset = 0, includeDeleted = false } = {}) {
  const conditions = [];
  const params = [];

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  } else {
    conditions.push('deleted_at IS NOT NULL');
  }

  if (tag) {
    conditions.push(`id IN (SELECT et.entry_id FROM entry_tags et JOIN tags t ON et.tag_id = t.id WHERE t.name = ?)`);
    params.push(tag);
  }

  if (search) {
    conditions.push(`(LOWER(title) LIKE ? OR LOWER(content) LIKE ?)`);
    const pattern = `%${search.toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  if (year) {
    conditions.push(`date LIKE ?`);
    params.push(`${year}%`);
  }

  if (month) {
    const m = month.padStart(2, '0');
    conditions.push(`SUBSTR(date, 6, 2) = ?`);
    params.push(m);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM entries ${whereClause}`).get(...params);
  const total = countRow.total;

  const rows = db.prepare(`
    SELECT * FROM entries ${whereClause}
    ORDER BY date DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    entries: rows.map(rowToEntry),
    total
  };
}

// ============ tags ============

function getOrCreateTag(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  let row = db.prepare(`SELECT * FROM tags WHERE name = ?`).get(trimmed);
  if (!row) {
    const result = db.prepare(`INSERT INTO tags (name) VALUES (?)`).run(trimmed);
    row = { id: Number(result.lastInsertRowid), name: trimmed };
  }
  return row;
}

function setEntryTags(entryId, tagNames) {
  db.prepare(`DELETE FROM entry_tags WHERE entry_id = ?`).run(entryId);

  for (const name of tagNames) {
    const tag = getOrCreateTag(name);
    if (tag) {
      db.prepare(`INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)`).run(entryId, tag.id);
    }
  }
}

function getEntryTags(entryId) {
  const rows = db.prepare(`
    SELECT t.name FROM tags t
    JOIN entry_tags et ON t.id = et.tag_id
    WHERE et.entry_id = ?
    ORDER BY t.name
  `).all(entryId);
  return rows.map(r => r.name);
}

function getAllTags() {
  const rows = db.prepare(`
    SELECT t.name, COUNT(et.entry_id) as count
    FROM tags t
    LEFT JOIN entry_tags et ON t.id = et.tag_id
    LEFT JOIN entries e ON et.entry_id = e.id AND e.deleted_at IS NULL
    GROUP BY t.id, t.name
    ORDER BY count DESC, t.name
  `).all();
  return rows.map(r => ({ name: r.name, count: r.count }));
}

// ============ stats ============

function getStats() {
  const totalEntries = db.prepare(`SELECT COUNT(*) as count FROM entries WHERE deleted_at IS NULL`).get().count;
  const totalTags = db.prepare(`SELECT COUNT(*) as count FROM tags`).get().count;

  const yearRows = db.prepare(`
    SELECT SUBSTR(date, 1, 4) as year, COUNT(*) as count
    FROM entries WHERE deleted_at IS NULL AND date IS NOT NULL
    GROUP BY year ORDER BY year DESC
  `).all();

  const moodRows = db.prepare(`
    SELECT mood, COUNT(*) as count
    FROM entries WHERE deleted_at IS NULL AND mood IS NOT NULL
    GROUP BY mood ORDER BY count DESC
  `).all();

  return {
    totalEntries,
    totalTags,
    yearStats: yearRows.map(r => ({ year: r.year, count: r.count })),
    moodStats: moodRows.map(r => ({ mood: r.mood, count: r.count }))
  };
}

function exportAllEntries() {
  const rows = db.prepare(`
    SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY date DESC
  `).all();
  return rows.map(rowToEntry);
}

// ============ helpers ============

function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    content: row.content,
    mood: row.mood,
    location: row.location,
    images: row.images ? JSON.parse(row.images) : null,
    links: row.links ? JSON.parse(row.links) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at
  };
}

function enrichEntry(entry) {
  if (!entry) return null;
  return { ...entry, tags: getEntryTags(entry.id) };
}

module.exports = {
  initDatabase,
  createEntry,
  updateEntry,
  getEntryById,
  listEntries,
  softDeleteEntry,
  restoreEntry,
  permanentlyDeleteEntry,
  setEntryTags,
  getEntryTags,
  getAllTags,
  getStats,
  exportAllEntries,
  enrichEntry
};
