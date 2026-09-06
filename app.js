const video = document.querySelector('#video');
const videoInput = document.querySelector('#videoInput');
const emptyState = document.querySelector('#emptyState');
const controls = document.querySelector('#controls');
const timelineSection = document.querySelector('#timelineSection');
const scrubber = document.querySelector('#scrubber');
const backwardButton = document.querySelector('#backwardButton');
const playButton = document.querySelector('#playButton');
const forwardButton = document.querySelector('#forwardButton');
const muteButton = document.querySelector('#muteButton');
const saveProjectButton = document.querySelector('#saveProjectButton');
const tagForm = document.querySelector('#tagForm');
const tagText = document.querySelector('#tagText');
const tagHint = document.querySelector('#tagHint');
const tagList = document.querySelector('#tagList');
const tagTemplate = document.querySelector('#tagTemplate');
const recentList = document.querySelector('#recentList');
const recentCount = document.querySelector('#recentCount');
const markers = document.querySelector('#markers');
const timeline = document.querySelector('#timeline');
const timelineFill = document.querySelector('#timelineFill');
const timelineCursor = document.querySelector('#timelineCursor');
const tagCount = document.querySelector('#tagCount');
const databaseName = 'clipmark-projects';
const databaseVersion = 1;
const projectStoreName = 'projects';
const lastProjectId = 'last-project';
const storagePrefix = 'clipmark:tags:';
const recentProjectsKey = 'clipmark:recent-projects';
const maxRecentProjects = 8;
let tags = [];
let videoUrl = null;
let activeStorageKey = null;
let currentVideoFile = null;
let projectSaved = false;

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
};

const createStorageKey = (file) => [
  storagePrefix,
  file.name,
  file.size,
  file.lastModified
].join(':');

function openProjectDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(projectStoreName, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSavedProject(projectId = lastProjectId) {
  const database = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(projectStoreName, 'readonly');
    const request = transaction.objectStore(projectStoreName).get(projectId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeSavedProject(project) {
  const database = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(projectStoreName, 'readwrite');
    transaction.objectStore(projectStoreName).put(project);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function loadSavedTags(file) {
  activeStorageKey = createStorageKey(file);
  try {
    return sanitizeTags(JSON.parse(localStorage.getItem(activeStorageKey) || '[]'));
  } catch {
    return [];
  }
}

function getRecentProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem(recentProjectsKey) || '[]');
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

function setRecentProjects(projects) {
  localStorage.setItem(recentProjectsKey, JSON.stringify(projects.slice(0, maxRecentProjects)));
}

function upsertRecentProject(file, { hasVideo = false } = {}) {
  const id = createStorageKey(file);
  const now = Date.now();
  const existingProjects = getRecentProjects();
  const existingProject = existingProjects.find((project) => project.id === id);
  const nextProject = {
    id,
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    tagCount: tags.length,
    hasVideo: hasVideo || Boolean(existingProject?.hasVideo),
    openedAt: now,
    savedAt: hasVideo ? now : existingProject?.savedAt || null
  };
  setRecentProjects([
    nextProject,
    ...existingProjects.filter((project) => project.id !== id)
  ]);
  renderRecentProjects();
}

function formatDate(timestamp) {
  if (!timestamp) return '未保存视频';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

async function restoreRecentProject(project) {
  if (!project.hasVideo) {
    tagHint.textContent = '这个项目只记录了文件名，请点击“导入视频”重新选择该文件。';
    return;
  }
  tagHint.textContent = '正在读取保存的视频…';
  try {
    const savedProject = await readSavedProject(project.id);
    if (!savedProject?.video) {
      tagHint.textContent = '没有找到这个项目的视频数据，请重新导入后保存。';
      return;
    }
    const file = new File(
      [savedProject.video],
      savedProject.fileName || project.fileName || 'saved-video',
      { type: savedProject.fileType || savedProject.video.type, lastModified: savedProject.fileLastModified || Date.now() }
    );
    projectSaved = true;
    const savedTags = sanitizeTags(savedProject.tags);
    loadVideoFile(file, savedTags, `已读取“${file.name}”和 ${savedTags.length} 个标签。`);
  } catch {
    tagHint.textContent = '读取失败，请检查浏览器本地存储权限。';
  }
}

function renderRecentProjects() {
  const projects = getRecentProjects();
  recentCount.textContent = `${projects.length} 个`;
  recentList.innerHTML = '';
  if (!projects.length) {
    recentList.innerHTML = '<div class="recent-placeholder">保存或导入视频后会出现在这里</div>';
    return;
  }
  projects.forEach((project) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `recent-item${project.id === activeStorageKey ? ' active' : ''}`;
    item.innerHTML = `
      <strong></strong>
      <span><span class="recent-status"></span> · ${project.tagCount || 0} 个标签 · ${formatDate(project.savedAt)}</span>
    `;
    item.querySelector('strong').textContent = project.fileName || '未命名视频';
    item.querySelector('.recent-status').textContent = project.hasVideo ? '可直接打开' : '需重新导入';
    item.addEventListener('click', () => restoreRecentProject(project));
    recentList.append(item);
  });
}

function sanitizeTags(nextTags) {
  if (!Array.isArray(nextTags)) return [];
  return nextTags
    .filter((tag) => Number.isFinite(tag.time) && typeof tag.text === 'string' && tag.text.trim())
    .map((tag) => ({ time: Math.max(0, tag.time), text: tag.text.trim() }))
    .sort((first, second) => first.time - second.time);
}

function saveTags() {
  if (!activeStorageKey) return;
  localStorage.setItem(activeStorageKey, JSON.stringify(tags));
  if (currentVideoFile) upsertRecentProject(currentVideoFile, { hasVideo: projectSaved });
  if (projectSaved) saveCurrentProject({ quiet: true });
}

async function saveCurrentProject({ quiet = false } = {}) {
  if (!currentVideoFile) {
    tagHint.textContent = '请先导入视频。';
    return;
  }
  saveProjectButton.disabled = true;
  saveProjectButton.textContent = '保存中';
  try {
    localStorage.setItem(activeStorageKey, JSON.stringify(tags));
    await writeSavedProject({
      id: activeStorageKey,
      fileName: currentVideoFile.name,
      fileType: currentVideoFile.type,
      fileSize: currentVideoFile.size,
      fileLastModified: currentVideoFile.lastModified,
      savedAt: Date.now(),
      video: currentVideoFile,
      tags
    });
    await writeSavedProject({
      id: lastProjectId,
      projectId: activeStorageKey,
      fileName: currentVideoFile.name,
      fileType: currentVideoFile.type,
      fileSize: currentVideoFile.size,
      fileLastModified: currentVideoFile.lastModified,
      savedAt: Date.now(),
      video: currentVideoFile,
      tags
    });
    projectSaved = true;
    upsertRecentProject(currentVideoFile, { hasVideo: true });
    if (!quiet) tagHint.textContent = `已保存视频和 ${tags.length} 个标签。`;
  } catch {
    tagHint.textContent = '保存失败，请检查浏览器存储权限或剩余空间。';
  } finally {
    saveProjectButton.disabled = false;
    saveProjectButton.textContent = '保存';
  }
}

function loadVideoFile(file, nextTags, hint) {
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  currentVideoFile = file;
  activeStorageKey = createStorageKey(file);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  tags = nextTags;
  document.querySelector('#fileName').textContent = file.name;
  emptyState.hidden = true;
  saveProjectButton.disabled = false;
  tagHint.textContent = hint;
  renderRecentProjects();
}

function updateProgress() {
  const duration = video.duration || 0;
  const percent = duration ? (video.currentTime / duration) * 100 : 0;
  document.querySelector('#currentTime').textContent = formatTime(video.currentTime);
  document.querySelector('#timelineNow').textContent = formatTime(video.currentTime);
  scrubber.value = video.currentTime;
  timelineFill.style.width = `${percent}%`;
  timelineCursor.style.left = `${percent}%`;
}

function seekTo(seconds) {
  video.currentTime = Math.min(Math.max(seconds, 0), video.duration || 0);
  updateProgress();
}

function skipBy(seconds) {
  if (!video.duration) return;
  seekTo(video.currentTime + seconds);
}

function renderTags() {
  tagCount.textContent = `${tags.length} 个`;
  tagList.innerHTML = '';
  markers.innerHTML = '';
  if (!tags.length) tagList.innerHTML = '<div class="tag-placeholder">你的标签会出现在这里</div>';
  tags.forEach((tag, index) => {
    const card = tagTemplate.content.cloneNode(true);
    const main = card.querySelector('.tag-main');
    card.querySelector('time').textContent = formatTime(tag.time);
    card.querySelector('.tag-title').textContent = tag.text;
    main.addEventListener('click', () => { seekTo(tag.time); video.play(); });
    card.querySelector('.delete-button').addEventListener('click', () => { tags.splice(index, 1); saveTags(); renderTags(); });
    tagList.append(card);
    const marker = document.createElement('button');
    marker.className = 'marker'; marker.type = 'button'; marker.style.left = `${(tag.time / video.duration) * 100}%`;
    marker.dataset.label = `${formatTime(tag.time)} · ${tag.text}`;
    marker.setAttribute('aria-label', `跳转到 ${tag.text}`);
    marker.addEventListener('click', (event) => { event.stopPropagation(); seekTo(tag.time); video.play(); });
    markers.append(marker);
  });
}

videoInput.addEventListener('change', () => {
  const [file] = videoInput.files;
  if (!file) return;
  const savedTags = loadSavedTags(file);
  projectSaved = false;
  loadVideoFile(
    file,
    savedTags,
    savedTags.length ? `已读取 ${savedTags.length} 个保存的标签。` : '点击“保存”可保存视频和标签。'
  );
  upsertRecentProject(file);
});

video.addEventListener('loadedmetadata', () => {
  controls.hidden = false; timelineSection.hidden = false;
  scrubber.max = video.duration;
  document.querySelector('#duration').textContent = formatTime(video.duration);
  updateProgress(); renderTags();
});
video.addEventListener('timeupdate', updateProgress);
video.addEventListener('play', () => { playButton.textContent = 'Ⅱ'; playButton.setAttribute('aria-label', '暂停'); });
video.addEventListener('pause', () => { playButton.textContent = '▶'; playButton.setAttribute('aria-label', '播放'); });
backwardButton.addEventListener('click', () => skipBy(-5));
playButton.addEventListener('click', () => video.paused ? video.play() : video.pause());
forwardButton.addEventListener('click', () => skipBy(5));
muteButton.addEventListener('click', () => { video.muted = !video.muted; muteButton.textContent = video.muted ? '◌' : '◖'; });
saveProjectButton.addEventListener('click', () => saveCurrentProject());
scrubber.addEventListener('input', () => seekTo(Number(scrubber.value)));
timeline.addEventListener('click', (event) => { const bounds = timeline.getBoundingClientRect(); seekTo(((event.clientX - bounds.left) / bounds.width) * video.duration); });
tagForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = tagText.value.trim();
  if (!video.duration) { tagHint.textContent = '请先导入视频。'; return; }
  if (!text) { tagHint.textContent = '请为这个时间点填写标签。'; tagText.focus(); return; }
  tags.push({ time: video.currentTime, text });
  tags.sort((first, second) => first.time - second.time);
  tagText.value = ''; tagHint.textContent = `已添加：${formatTime(video.currentTime)}`;
  saveTags();
  renderTags();
});

window.addEventListener('DOMContentLoaded', async () => {
  renderRecentProjects();
  try {
    const savedProject = await readSavedProject();
    if (!savedProject?.video) return;
    const file = new File(
      [savedProject.video],
      savedProject.fileName || 'saved-video',
      { type: savedProject.fileType || savedProject.video.type, lastModified: savedProject.fileLastModified || Date.now() }
    );
    const savedTags = sanitizeTags(savedProject.tags);
    loadVideoFile(file, savedTags, `已自动读取上次保存的视频和 ${savedTags.length} 个标签。`);
    projectSaved = true;
    upsertRecentProject(file, { hasVideo: true });
  } catch {
    tagHint.textContent = '未能读取上次保存的视频。';
  }
});
