import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {stdio: 'ignore'});
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch('http://127.0.0.1:5173/')).ok) { ready = true; break; } } catch {}
  await delay(100);
}
if (!ready) { server.kill(); throw new Error('Production preview did not start.'); }
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'}),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/music/**', route => route.fulfill({status: 404, json: {detail: 'Offline test'}}));
await page.route('https://lrclib.net/**', route => route.fulfill({json: []}));
try {
  await page.goto('http://127.0.0.1:5173/', {waitUntil: 'domcontentloaded'});
  await page.locator('canvas.cinematic-canvas').waitFor();
  assert.equal(await page.locator('.device-service-status').count(), 0);
  await page.locator('.stage-source-button').click();
  const sources = page.getByRole('dialog', {name: 'Choose audio source'});
  await sources.waitFor();
  assert.equal(await sources.locator('.source-option-card').count(), 3);
  await page.getByRole('button', {name: 'Close audio sources', exact: true}).click();

  // A generated tone exercises real browser decoding/playback, without external media.
  const rate = 16000, frames = rate * 4;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let n = 0; n < frames; n++) wav.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 220 / rate) * 8000), 44 + n * 2);
  await page.getByLabel('Select local audio file').setInputFiles({name: 'Example Artist - Example Song.wav', mimeType: 'audio/wav', buffer: wav});
  await page.getByRole('button', {name: 'Play track', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0.1);
  await page.getByRole('button', {name: 'Pause track', exact: true}).click();
  await page.getByRole('button', {name: 'Custom Edit / Change Lyrics', exact: true}).click();
  await page.getByLabel('Import LRC or TTML file').setInputFiles({
    name: 'example.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.00]Example first line\n[00:02.00]Example second line'),
  });
  await page.waitForFunction(() => document.querySelector('.lyrics-editor textarea')?.value.includes('Example first line'));
  await page.getByRole('spinbutton', {name: 'Lyrics delay seconds', exact: true}).fill('1.25');
  assert.equal(await page.getByRole('spinbutton', {name: 'Lyrics delay seconds', exact: true}).inputValue(), '1.25');
  for (const font of ['400 24px "Anton"', '800 24px "Syne"', '700 24px "Space Grotesk"']) {
    assert.ok(await page.evaluate(async font => (await document.fonts.load(font, 'LyricFlow')).length > 0, font));
  }
  await page.setViewportSize({width: 800, height: 1100});
  await page.getByRole('button', {name: 'Hide Lyrics Override Editor', exact: true}).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  assert.deepEqual(errors, []);
  console.log('PASS: production assets, source hub, local playback, imported timed lyrics, delay, bundled fonts, portrait layout, and no page errors.');
} finally {
  await browser.close();
  server.kill();
}
