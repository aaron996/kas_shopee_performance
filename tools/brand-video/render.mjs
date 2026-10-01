// Renders tools/brand-video/scene.html to public/brand-intro.{mp4,webm}.
//
//   npm i --no-save puppeteer-core
//   node tools/brand-video/render.mjs [--frames-only] [--t=4.2]   (--t: write one PNG and stop)
//
// Needs a local Chrome/Edge (CHROME_PATH to override) and ffmpeg (FFMPEG to override;
// `pip install imageio-ffmpeg` ships one). Output is the 10s intro whose 8s–10s
// tail is a seamless 2s loop — BrandSplash.jsx loops that tail until data lands.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const FPS = 30;
const DURATION = 10;
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(existsSync);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const framesDir = resolve(process.env.FRAMES_DIR || resolve(here, '.frames'));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}`));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve(here, 'scene.html')).href + '?t=0');
await page.evaluate(() => document.fonts.ready);

const single = arg('t=');
if (single) {
  const t = parseFloat(single.split('=')[1]);
  await page.evaluate((x) => window.render(x), t);
  const out = resolve(framesDir, `t_${t}.png`);
  mkdirSync(framesDir, { recursive: true });
  await page.screenshot({ path: out });
  console.log(out);
  await browser.close();
  process.exit(0);
}

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const total = FPS * DURATION;
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  await page.screenshot({ path: resolve(framesDir, `f_${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
if (arg('frames-only')) process.exit(0);

const common = ['-y', '-framerate', String(FPS), '-i', resolve(framesDir, 'f_%04d.png')];
const colour = ['-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const run = (args) => {
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
// Keyframe every second (and exactly at 8s) so seeking back into the loop is instant.
run([...common, ...colour, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '24', '-g', String(FPS), '-keyint_min', String(FPS), '-force_key_frames', '8', '-movflags', '+faststart', '-an', resolve(root, 'public/brand-intro.mp4')]);
run([...common, ...colour, '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-g', String(FPS), '-row-mt', '1', '-an', resolve(root, 'public/brand-intro.webm')]);
writeFileSync(resolve(root, 'public/brand-intro.meta.json'), JSON.stringify({ duration: DURATION, loopStart: 8, loopEnd: 10, fps: FPS }) + '\n');
console.log('done');
