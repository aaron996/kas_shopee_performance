import { createContext, useContext } from 'react';

export const RadioContext = createContext(null);
export const DISC_STYLES = [
  { id: 'vinyl', label: 'Vinyl' }, { id: 'cd', label: 'CD' },
  { id: 'flower', label: 'Hoa' }, { id: 'gear', label: 'Bánh răng' }
];

export function useRadio() {
  return useContext(RadioContext);
}

export function radioDescription({ status, playing, soundEnabled }) {
  if (status === 'error') return 'Không tải được nhạc · Bấm để thử lại';
  if (status === 'blocked') return 'Bấm để nghe radio';
  if (playing) return 'Đang phát trực tiếp';
  if (status === 'loading') return 'Đang tải nhạc…';
  return soundEnabled ? 'Đang chờ phát' : 'Âm thanh đang tắt';
}

export function radioToggleLabel({ status, soundOn }) {
  if (status === 'error') return 'Thử phát lại radio';
  return soundOn ? 'Tắt âm radio' : 'Bật radio';
}
