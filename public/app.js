// ============ 状态管理 ============
let currentView = 'timeline';
let currentFilter = { tag: null, year: null, search: '' };
let entriesOffset = 0;
let entriesLimit = 20;
let allTags = [];
let isLoading = false;
let pendingImages = [];
let uploadedImageUrls = [];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  document.getElementById('entryDate').value = formatDate(new Date());
  await Promise.all([
    loadEntries(),
    loadTags(),
    loadYears()
  ]);
}

// ============ API 请求 ============
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

// ============ 视图切换 ============
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active', el.id === view + 'View');
  });

  if (view === 'tags') loadTagsView();
  if (view === 'stats') loadStatsView();
  if (view === 'trash') loadTrashView();
}

// ============ 加载记录 ============
async function loadEntries(append = false) {
  if (isLoading) return;
  isLoading = true;

  try {
    const params = new URLSearchParams();
    params.set('limit', entriesLimit);
    params.set('offset', append ? entriesOffset : 0);
    if (currentFilter.tag) params.set('tag', currentFilter.tag);
    if (currentFilter.year) params.set('year', currentFilter.year);
    if (currentFilter.search) params.set('search', currentFilter.search);

    const data = await api(`/api/entries?${params}`);
    const entries = data.data;

    if (!append) {
      entriesOffset = 0;
      document.getElementById('timelineList').innerHTML = '';
    }

    renderTimeline(entries);
    entriesOffset += entries.length;

    const loadMoreBtn = document.getElementById('loadMore');
    loadMoreBtn.style.display = entriesOffset < data.pagination.total ? 'block' : 'none';

    let title = '全部记录';
    if (currentFilter.tag) title = `标签：${currentFilter.tag}`;
    if (currentFilter.year) title = `${currentFilter.year}年`;
    if (currentFilter.search) title = `搜索：${currentFilter.search}`;
    document.getElementById('timelineTitle').textContent = title;
    document.getElementById('timelineCount').textContent = data.pagination.total;
  } catch (err) {
    console.error('加载记录失败:', err);
    showError('加载记录失败，请刷新重试');
  } finally {
    isLoading = false;
  }
}

function loadMore() {
  loadEntries(true);
}

// ============ 渲染时间线 (Ech0 Style) ============
function renderTimeline(entries) {
  const container = document.getElementById('timelineList');

  if (entries.length === 0 && container.children.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <h3>还没有记录</h3>
        <p>点击右上角的「记录今天」，写下你的第一条回忆吧</p>
      </div>
    `;
    return;
  }

  entries.forEach((entry, index) => {
    const date = new Date(entry.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
    const dateText = `${year}年${month}月${day}日 ${weekday}`;

    const el = document.createElement('div');
    el.className = 'timeline-item fade-in-down';
    el.style.animationDelay = `${Math.min(index * 0.1, 0.6)}s`;

    el.innerHTML = `
      <div class="timeline-header-sticky">
        <div class="timeline-marker-row">
          <div class="timeline-marker">
            <div class="timeline-marker-dot"></div>
          </div>
          <div class="timeline-date-text">${dateText}</div>
        </div>
        <div class="timeline-actions-row">
          <button class="btn btn-small btn-secondary" onclick="editEntry(${entry.id})">编辑</button>
          <button class="btn btn-small btn-danger" onclick="deleteEntry(${entry.id})">删除</button>
        </div>
      </div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <div class="timeline-title">${escapeHtml(entry.title)}</div>
        </div>
        <div class="timeline-meta">
          ${entry.mood ? `<span class="timeline-mood">${entry.mood}</span>` : ''}
          ${entry.location ? `<span class="timeline-location">📍 ${escapeHtml(entry.location)}</span>` : ''}
        </div>
        ${entry.content ? `<div class="timeline-body">${escapeHtml(entry.content)}</div>` : ''}
        ${entry.images?.length ? `
          <div class="timeline-images">
            ${entry.images.map(url => `<img src="${escapeHtml(url)}" alt="" onclick="window.open('${escapeHtml(url)}')"></img>`).join('')}
          </div>
        ` : ''}
        ${entry.tags?.length ? `
          <div class="timeline-tags">
            ${entry.tags.map(tag => `<span class="timeline-tag" onclick="filterByTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    container.appendChild(el);
  });
}

// ============ 标签操作 ============
async function loadTags() {
  try {
    const data = await api('/api/tags');
    allTags = data.data;
    renderTagCloud();
  } catch (err) {
    console.error('加载标签失败:', err);
  }
}

function renderTagCloud() {
  const container = document.getElementById('tagCloud');
  container.innerHTML = allTags.slice(0, 15).map(tag => `
    <span class="tag-chip" onclick="filterByTag('${escapeHtml(tag.name)}')">
      ${escapeHtml(tag.name)}
      <span class="tag-count">${tag.count}</span>
    </span>
  `).join('');
}

function filterByTag(tag) {
  currentFilter = { ...currentFilter, tag };
  currentFilter.year = null;
  updateYearFilterUI();
  switchView('timeline');
  loadEntries();
}

async function loadTagsView() {
  try {
    const data = await api('/api/tags');
    const container = document.getElementById('tagsList');

    if (data.data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏷️</div>
          <h3>还没有标签</h3>
          <p>添加记录时打上标签，它们会在这里汇总</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.data.map(tag => `
      <div class="tag-card" onclick="filterByTag('${escapeHtml(tag.name)}')">
        <div class="tag-card-name">${escapeHtml(tag.name)}</div>
        <div class="tag-card-count">${tag.count} 条记录</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载标签视图失败:', err);
  }
}

// ============ 年份筛选 ============
async function loadYears() {
  try {
    const data = await api('/api/entries?limit=9999');
    const years = [...new Set(data.data.map(e => e.date?.substring(0, 4)).filter(Boolean))].sort().reverse();
    renderYearFilter(years);
  } catch (err) {
    console.error('加载年份失败:', err);
  }
}

function renderYearFilter(years) {
  const container = document.getElementById('yearFilter');
  container.innerHTML = years.map(year => `
    <span class="year-chip" data-year="${year}" onclick="filterByYear('${year}')">${year}</span>
  `).join('');
}

function filterByYear(year) {
  currentFilter = { ...currentFilter, year };
  currentFilter.tag = null;
  updateYearFilterUI();
  switchView('timeline');
  loadEntries();
}

function updateYearFilterUI() {
  document.querySelectorAll('.year-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.year === currentFilter.year);
  });
}

// ============ 搜索 ============
let searchTimeout;
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const search = document.getElementById('searchInput').value.trim();
    currentFilter = { ...currentFilter, search };
    if (search) {
      switchView('timeline');
    }
    loadEntries();
  }, 300);
}

// ============ 统计 ============
async function loadStatsView() {
  try {
    const data = await api('/api/stats');
    const stats = data.data;
    const container = document.getElementById('statsContent');

    const maxYearCount = Math.max(...stats.yearStats.map(y => y.count), 1);
    const maxMoodCount = Math.max(...stats.moodStats.map(m => m.count), 1);

    container.innerHTML = `
      <div class="stat-card">
        <h3>总记录数</h3>
        <div class="stat-number">${stats.totalEntries}</div>
        <div class="stat-label">条生活记录</div>
      </div>
      <div class="stat-card">
        <h3>标签数量</h3>
        <div class="stat-number">${stats.totalTags}</div>
        <div class="stat-label">个不同标签</div>
      </div>
      <div class="stat-card">
        <h3>年份分布</h3>
        <div class="stat-list">
          ${stats.yearStats.map(y => `
            <div class="stat-item">
              <span>${y.year}年</span>
              <div class="stat-bar">
                <div class="stat-bar-track">
                  <div class="stat-bar-fill" style="width: ${(y.count / maxYearCount * 100)}%"></div>
                </div>
                <span style="font-size: 12px; color: var(--text-muted); min-width: 30px; text-align: right;">${y.count}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="stat-card">
        <h3>心情分布</h3>
        <div class="stat-list">
          ${stats.moodStats.map(m => `
            <div class="stat-item">
              <span>${m.mood}</span>
              <div class="stat-bar">
                <div class="stat-bar-track">
                  <div class="stat-bar-fill" style="width: ${(m.count / maxMoodCount * 100)}%"></div>
                </div>
                <span style="font-size: 12px; color: var(--text-muted); min-width: 30px; text-align: right;">${m.count}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('加载统计失败:', err);
  }
}

// ============ 弹窗操作 ============
function openModal(entryId = null) {
  document.getElementById('entryModal').classList.add('active');
  document.getElementById('modalTitle').textContent = entryId ? '编辑记录' : '记录今天';
  document.getElementById('entryId').value = entryId || '';

  pendingImages = [];
  uploadedImageUrls = [];
  renderImagePreview();

  if (!entryId) {
    document.getElementById('entryForm').reset();
    document.getElementById('entryDate').value = formatDate(new Date());
  }

  renderTagSuggestions();
}

function closeModal() {
  document.getElementById('entryModal').classList.remove('active');
}

async function editEntry(id) {
  try {
    const data = await api(`/api/entries/${id}`);
    const entry = data.data;

    document.getElementById('entryId').value = entry.id;
    document.getElementById('entryDate').value = entry.date;
    document.getElementById('entryTitle').value = entry.title;
    document.getElementById('entryContent').value = entry.content || '';
    document.getElementById('entryMood').value = entry.mood || '';
    document.getElementById('entryLocation').value = entry.location || '';
    document.getElementById('entryTags').value = (entry.tags || []).join(', ');

    uploadedImageUrls = entry.images || [];
    pendingImages = [];
    renderImagePreview();

    openModal(entry.id);
  } catch (err) {
    console.error('加载记录失败:', err);
    showError('加载记录失败');
  }
}

async function saveEntry(e) {
  e.preventDefault();

  let imageUrls = [...uploadedImageUrls];
  if (pendingImages.length > 0) {
    try {
      const formData = new FormData();
      pendingImages.forEach(file => formData.append('images', file));
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        imageUrls = imageUrls.concat(data.data);
      }
    } catch (err) {
      console.error('图片上传失败:', err);
      showError('图片上传失败');
      return;
    }
  }

  const id = document.getElementById('entryId').value;
  const entry = {
    date: document.getElementById('entryDate').value,
    title: document.getElementById('entryTitle').value.trim(),
    content: document.getElementById('entryContent').value.trim(),
    mood: document.getElementById('entryMood').value,
    location: document.getElementById('entryLocation').value.trim(),
    tags: document.getElementById('entryTags').value.split(',').map(t => t.trim()).filter(Boolean),
    images: imageUrls
  };

  try {
    if (id) {
      await api(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(entry)
      });
    } else {
      await api('/api/entries', {
        method: 'POST',
        body: JSON.stringify(entry)
      });
    }

    closeModal();
    await Promise.all([loadEntries(), loadTags(), loadYears()]);
  } catch (err) {
    console.error('保存失败:', err);
    showError('保存失败：' + err.message);
  }
}

async function deleteEntry(id) {
  if (!confirm('确定要删除这条记录？\n删除后会进入回收站，可随时恢复。')) return;

  try {
    await api(`/api/entries/${id}`, { method: 'DELETE' });
    await Promise.all([loadEntries(), loadTags(), loadYears()]);
  } catch (err) {
    console.error('删除失败:', err);
    showError('删除失败');
  }
}

// ============ 回收站 ============
async function loadTrashView() {
  try {
    const data = await api('/api/trash');
    const entries = data.data;
    const container = document.getElementById('trashList');
    document.getElementById('trashCount').textContent = data.pagination.total;

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🗑️</div>
          <h3>回收站是空的</h3>
          <p>删除的记录会暂时放在这里</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    entries.forEach((entry, index) => {
      const date = new Date(entry.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
      const dateText = `${year}年${month}月${day}日 ${weekday}`;
      const deletedDate = entry.deleted_at ? new Date(entry.deleted_at).toLocaleString('zh-CN') : '';

      const el = document.createElement('div');
      el.className = 'timeline-item fade-in-down';
      el.style.animationDelay = `${Math.min(index * 0.1, 0.6)}s`;

      el.innerHTML = `
        <div class="timeline-header-sticky">
          <div class="timeline-marker-row">
            <div class="timeline-marker">
              <div class="timeline-marker-dot" style="background: var(--text-muted); opacity: 0.5;"></div>
            </div>
            <div class="timeline-date-text" style="color: var(--text-muted);">${dateText}</div>
          </div>
          <div class="timeline-actions-row">
            <button class="btn btn-small btn-primary" onclick="restoreEntry(${entry.id})">恢复</button>
            <button class="btn btn-small btn-danger" onclick="permanentDelete(${entry.id})">彻底删除</button>
          </div>
        </div>
        <div class="timeline-card trash-card">
          <div class="timeline-card-header">
            <div class="timeline-title">${escapeHtml(entry.title)}</div>
          </div>
          <div class="timeline-meta">
            ${entry.mood ? `<span class="timeline-mood">${entry.mood}</span>` : ''}
            ${entry.location ? `<span class="timeline-location">📍 ${escapeHtml(entry.location)}</span>` : ''}
            <span>删除于 ${deletedDate}</span>
          </div>
          ${entry.content ? `<div class="timeline-body">${escapeHtml(entry.content)}</div>` : ''}
          ${entry.images?.length ? `
            <div class="timeline-images">
              ${entry.images.map(url => `<img src="${escapeHtml(url)}" alt="" onclick="window.open('${escapeHtml(url)}')"></img>`).join('')}
            </div>
          ` : ''}
          ${entry.tags?.length ? `
            <div class="timeline-tags">
              ${entry.tags.map(tag => `<span class="timeline-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
      container.appendChild(el);
    });
  } catch (err) {
    console.error('加载回收站失败:', err);
    showError('加载回收站失败');
  }
}

async function restoreEntry(id) {
  try {
    await api(`/api/trash/${id}/restore`, { method: 'POST' });
    await Promise.all([loadTrashView(), loadEntries(), loadTags(), loadYears()]);
  } catch (err) {
    console.error('恢复失败:', err);
    showError('恢复失败');
  }
}

async function permanentDelete(id) {
  if (!confirm('⚠️ 彻底删除后无法恢复！\n确定要永久删除这条记录吗？')) return;

  try {
    await api(`/api/trash/${id}`, { method: 'DELETE' });
    await loadTrashView();
  } catch (err) {
    console.error('彻底删除失败:', err);
    showError('彻底删除失败');
  }
}

// ============ 图片上传 ============
function handleImageSelect(e) {
  const files = Array.from(e.target.files);
  pendingImages = pendingImages.concat(files);
  renderImagePreview();
  e.target.value = '';
}

function renderImagePreview() {
  const container = document.getElementById('imagePreview');
  const allItems = [
    ...uploadedImageUrls.map((url, idx) => ({ type: 'uploaded', url, idx })),
    ...pendingImages.map((file, idx) => ({ type: 'pending', file, idx }))
  ];

  if (allItems.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = allItems.map((item, i) => {
    if (item.type === 'uploaded') {
      return `
        <div class="image-thumb">
          <img src="${escapeHtml(item.url)}" alt="">
          <button type="button" class="image-remove" onclick="removeImage(${i})">&times;</button>
        </div>
      `;
    } else {
      const url = URL.createObjectURL(item.file);
      return `
        <div class="image-thumb">
          <img src="${url}" alt="">
          <button type="button" class="image-remove" onclick="removePendingImage(${item.idx})">&times;</button>
        </div>
      `;
    }
  }).join('');
}

function removeImage(index) {
  uploadedImageUrls.splice(index, 1);
  renderImagePreview();
}

function removePendingImage(index) {
  pendingImages.splice(index, 1);
  renderImagePreview();
}

// ============ 标签建议 ============
function renderTagSuggestions() {
  const container = document.getElementById('tagSuggestions');
  if (allTags.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = allTags.slice(0, 8).map(tag => `
    <span class="tag-suggestion" onclick="addTag('${escapeHtml(tag.name)}')">${escapeHtml(tag.name)}</span>
  `).join('');
}

function addTag(tag) {
  const input = document.getElementById('entryTags');
  const current = input.value.split(',').map(t => t.trim()).filter(Boolean);
  if (!current.includes(tag)) {
    current.push(tag);
    input.value = current.join(', ');
  }
}

// ============ 工具函数 ============
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  alert(message);
}

// ============ 关闭服务器 ============
async function shutdownServer() {
  if (!confirm('确定要关闭程序吗？\n关闭后需要重新运行 node server.js 才能再次使用。')) return;

  try {
    await api('/api/shutdown', { method: 'POST' });
  } catch (err) {
    // 服务器关闭后连接会断开，这是正常的
  }

  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--canvas);font-family:var(--font-sans);">
      <div style="text-align:center;color:var(--text-secondary);">
        <div style="font-size:48px;margin-bottom:16px;">👋</div>
        <h2 style="margin-bottom:8px;color:var(--text-primary);font-family:var(--font-serif);">程序已关闭</h2>
        <p>感谢使用人生时间线</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:24px;">
          下次启动请运行：<br>
          <code>node server.js</code>
        </p>
      </div>
    </div>
  `;
}

// 点击弹窗外部关闭
document.getElementById('entryModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
