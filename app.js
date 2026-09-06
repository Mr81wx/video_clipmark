const video = document.querySelector('#video');
const videoInput = document.querySelector('#videoInput');
const emptyState = document.querySelector('#emptyState');
const controls = document.querySelector('#controls');
const timelineSection = document.querySelector('#timelineSection');
const scrubber = document.querySelector('#scrubber');
const playButton = document.querySelector('#playButton');
const muteButton = document.querySelector('#muteButton');
const tagForm = document.querySelector('#tagForm');
const tagText = document.querySelector('#tagText');
const tagHint = document.querySelector('#tagHint');
const tagList = document.querySelector('#tagList');
const tagTemplate = document.querySelector('#tagTemplate');
const markers = document.querySelector('#markers');
const timeline = document.querySelector('#timeline');
const timelineFill = document.querySelector('#timelineFill');
const timelineCursor = document.querySelector('#timelineCursor');
const tagCount = document.querySelector('#tagCount');
const storagePrefix = 'clipmark:tags:';
let tags = [];
let videoUrl = null;
let activeStorageKey = null;

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

function loadSavedTags(file) {
  activeStorageKey = createStorageKey(file);
  try {
    const savedTags = JSON.parse(localStorage.getItem(activeStorageKey) || '[]');
    if (!Array.isArray(savedTags)) return [];
    return savedTags
      .filter((tag) => Number.isFinite(tag.time) && typeof tag.text === 'string' && tag.text.trim())
      .map((tag) => ({ time: Math.max(0, tag.time), text: tag.text.trim() }))
      .sort((first, second) => first.time - second.time);
  } catch {
    return [];
  }
}

function saveTags() {
  if (!activeStorageKey) return;
  localStorage.setItem(activeStorageKey, JSON.stringify(tags));
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
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  tags = loadSavedTags(file);
  document.querySelector('#fileName').textContent = file.name;
  emptyState.hidden = true;
  tagHint.textContent = tags.length ? `已读取 ${tags.length} 个保存的标签。` : '标签将自动保存到浏览器本地。';
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
playButton.addEventListener('click', () => video.paused ? video.play() : video.pause());
muteButton.addEventListener('click', () => { video.muted = !video.muted; muteButton.textContent = video.muted ? '◌' : '◖'; });
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
