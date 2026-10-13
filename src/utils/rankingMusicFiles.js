export const MAX_MUSIC_BYTES = 15 * 1024 * 1024;

// Must stay within the bucket's allowed_mime_types (see the ranking_music_tracks migration).
const MIME_BY_EXTENSION = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav'
};

function splitName(name) {
  const clean = String(name || '').trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return { base: clean, extension: '' };
  return { base: clean.slice(0, dot), extension: clean.slice(dot + 1).toLowerCase() };
}

export function audioContentType(fileName) {
  return MIME_BY_EXTENSION[splitName(fileName).extension] || null;
}

export function validateAudioFile(file) {
  if (!file) return 'Chưa chọn file.';
  if (!audioContentType(file.name)) return 'Chỉ nhận file mp3, m4a, ogg hoặc wav.';
  if (file.size > MAX_MUSIC_BYTES) return 'File vượt quá 15 MB.';
  if (file.size === 0) return 'File rỗng.';
  return null;
}

export function titleFromFileName(fileName) {
  return splitName(fileName).base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Bài mới';
}

// Storage-safe object path: ascii, lowercase, no spaces, unique suffix so re-uploads never collide.
export function storagePathFor(fileName, suffix = Date.now().toString(36)) {
  const { base, extension } = splitName(fileName);
  const slug = base
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
  return `${slug}-${suffix}.${extension}`;
}
