import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MUSIC_BYTES, audioContentType, storagePathFor, titleFromFileName, validateAudioFile
} from './rankingMusicFiles.js';

test('storagePathFor produces an ascii, space-free, unique path', () => {
  assert.equal(storagePathFor('Nhạc Đỉnh Cao (v2).MP3', 'abc'), 'nhac-dinh-cao-v2-abc.mp3');
  assert.equal(storagePathFor('???.wav', 'x1'), 'track-x1.wav');
});

test('audioContentType maps supported extensions only', () => {
  assert.equal(audioContentType('a.MP3'), 'audio/mpeg');
  assert.equal(audioContentType('a.m4a'), 'audio/mp4');
  assert.equal(audioContentType('a.flac'), null);
  assert.equal(audioContentType('noext'), null);
});

test('validateAudioFile rejects wrong type, empty and oversized files', () => {
  assert.equal(validateAudioFile({ name: 'a.mp3', size: 1000 }), null);
  assert.match(validateAudioFile({ name: 'a.txt', size: 1000 }), /mp3/);
  assert.match(validateAudioFile({ name: 'a.mp3', size: MAX_MUSIC_BYTES + 1 }), /15 MB/);
  assert.match(validateAudioFile({ name: 'a.mp3', size: 0 }), /rỗng/);
  assert.match(validateAudioFile(null), /Chưa chọn/);
});

test('titleFromFileName makes a readable default title', () => {
  assert.equal(titleFromFileName('how_it-works.mp3'), 'how it works');
  assert.equal(titleFromFileName(''), 'Bài mới');
});
