const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'life-data.json');

let data = { entries: [], tags: [], entryTags: [] };
let nextId = 1;
let nextTagId = 1;

function loadData() {
  if (fs.existsSync(DATA_PATH)) {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      data = JSON.parse(raw);
      // 恢复自增ID
      nextId = data.entries.length > 0 ? Math.max(...data.entries.map(e => e.id)) + 1 : 1;
      nextTagId = data.tags.length > 0 ? Math.max(...data.tags.map(t => t.id)) + 1 : 1;
      console.log(`已加载 ${data.entries.length} 条记录, ${data.tags.length} 个标签`);
    } catch (err) {
      console.error('加载数据失败，使用空数据:', err.message);
    }
  }
}

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function initDatabase() {
  loadData();
  console.log('数据存储已就绪');
}

function getDb() {
  return {
    prepare: (sql) => {
      // 模拟 better-sqlite3 的 prepare API
      const lower = sql.toLowerCase().trim();

      if (lower.startsWith('insert into entries')) {
        return {
          run: (date, title, content, mood, location) => {
            const entry = {
              id: nextId++,
              date,
              title,
              content: content || null,
              mood: mood || null,
              location: location || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            data.entries.push(entry);
            saveData();
            return { lastInsertRowid: entry.id, changes: 1 };
          }
        };
      }

      if (lower.startsWith('update entries')) {
        return {
          run: (date, title, content, mood, location, id) => {
            const entry = data.entries.find(e => e.id === id);
            if (entry) {
              entry.date = date;
              entry.title = title;
              entry.content = content || null;
              entry.mood = mood || null;
              entry.location = location || null;
              entry.updated_at = new Date().toISOString();
              saveData();
            }
            return { changes: entry ? 1 : 0 };
          }
        };
      }

      if (lower.startsWith('delete from entries')) {
        return {
          run: (id) => {
            const idx = data.entries.findIndex(e => e.id === id);
            if (idx >= 0) {
              data.entries.splice(idx, 1);
              // 清理关联的标签
              data.entryTags = data.entryTags.filter(et => et.entry_id !== id);
              saveData();
            }
            return { changes: idx >= 0 ? 1 : 0 };
          }
        };
      }

      if (lower.startsWith('delete from entry_tags where entry_id')) {
        return {
          run: (entryId) => {
            data.entryTags = data.entryTags.filter(et => et.entry_id !== entryId);
            saveData();
          }
        };
      }

      if (lower.startsWith('insert or ignore into tags')) {
        return {
          run: (name) => {
            if (!data.tags.find(t => t.name === name)) {
              data.tags.push({ id: nextTagId++, name });
              saveData();
            }
          }
        };
      }

      if (lower.startsWith('insert into entry_tags')) {
        return {
          run: (entryId, tagId) => {
            if (!data.entryTags.find(et => et.entry_id === entryId && et.tag_id === tagId)) {
              data.entryTags.push({ entry_id: entryId, tag_id: tagId });
              saveData();
            }
          }
        };
      }

      if (lower.startsWith('select * from entries where id = ?')) {
        return {
          get: (id) => data.entries.find(e => e.id === id) || null
        };
      }

      if (lower.startsWith('select id from tags where name = ?')) {
        return {
          get: (name) => data.tags.find(t => t.name === name) || null
        };
      }

      if (lower.startsWith('select count(*) as count from entries')) {
        return {
          get: () => ({ count: data.entries.length })
        };
      }

      if (lower.startsWith('select count(*) as count from tags')) {
        return {
          get: () => ({ count: data.tags.length })
        };
      }

      // 复杂的 SELECT 查询由 server.js 直接处理
      throw new Error('未模拟的 SQL: ' + sql.substring(0, 50));
    }
  };
}

// 直接操作数据的辅助函数（供 server.js 使用）
function getData() {
  return data;
}

function save() {
  saveData();
}

function getNextId() {
  return nextId++;
}

function getNextTagId() {
  return nextTagId++;
}

module.exports = {
  initDatabase,
  getDb,
  getData,
  save,
  getNextId,
  getNextTagId
};
