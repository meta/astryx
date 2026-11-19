// Evidence capture for the VideoPlayer compact bar pull request.
// Serves two static Storybook builds (base and head) and photographs the
// 240px and 640px players, paused partway with a held buffered range, in the
// light and dark color modes.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';

const OUT = process.env.OUT ?? '/tmp/evidence';
const VIDEO = '/tmp/media/nature.webm';
const BUILDS = {before: '/tmp/sb-base', after: '/tmp/sb-head'};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.join(root, decodeURIComponent(url.pathname));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, 'index.html');
      }
      if (!fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({server, origin: `http://127.0.0.1:${server.address().port}`});
    });
  });
}

const video = fs.readFileSync(VIDEO);

/** Answers the sample video request with the local clip, honoring ranges. */
async function fulfillVideo(route) {
  const range = route.request().headers()['range'];
  const match = range != null ? /bytes=(\d+)-(\d*)/.exec(range) : null;
  if (match == null) {
    await route.fulfill({
      status: 200,
      headers: {'accept-ranges': 'bytes', 'content-type': 'video/webm'},
      body: video,
    });
    return;
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? video.length - 1 : Number(match[2]);
  await route.fulfill({
    status: 206,
    headers: {
      'accept-ranges': 'bytes',
      'content-type': 'video/webm',
      'content-range': `bytes ${start}-${end}/${video.length}`,
    },
    body: video.subarray(start, end + 1),
  });
}

const SHOTS = [
  {name: '240', story: 'small-player', width: null},
  {name: '640', story: 'video', width: 640},
];
const MODES = ['light', 'dark'];
const SEEK = Number(process.env.SEEK ?? 5.2);
const BUFFERED = Number(process.env.BUFFERED ?? 9.6);

fs.mkdirSync(OUT, {recursive: true});
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const report = [];
for (const [label, root] of Object.entries(BUILDS)) {
  const {server, origin} = await serve(root);
  for (const shot of SHOTS) {
    for (const mode of MODES) {
      const context = await browser.newContext({
        viewport: {width: 900, height: 640},
        deviceScaleFactor: 2,
        colorScheme: mode,
      });
      const page = await context.newPage();
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
        if (route.request().url().endsWith('/flower.webm')) {
          return fulfillVideo(route);
        }
        return route.abort();
      });
      // Holds the buffered range at a fixed end once the script sets one,
      // because the short local clip loads whole at once.
      await page.addInitScript(() => {
        const native = Object.getOwnPropertyDescriptor(
          HTMLMediaElement.prototype,
          'buffered',
        );
        Object.defineProperty(HTMLMediaElement.prototype, 'buffered', {
          configurable: true,
          get() {
            const end = window.__heldBufferedEnd;
            if (end == null) {
              return native.get.call(this);
            }
            return {length: 1, start: () => 0, end: () => end};
          },
        });
      });
      await page.goto(
        `${origin}/iframe.html?id=lab-mediaplayer--${shot.story}&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral`,
        {waitUntil: 'domcontentloaded'},
      );
      const player = page.locator('#storybook-root [role="group"]');
      await player.waitFor();
      if (shot.width != null) {
        await page.evaluate(width => {
          const frame = Array.from(
            document.querySelectorAll('#storybook-root div'),
          ).find(element => element.style.width === '720px');
          frame.style.width = `${width}px`;
        }, shot.width);
      }
      await page.evaluate(
        async ({seek, buffered}) => {
          const media = document.querySelector('#storybook-root video');
          if (media.readyState < 1) {
            await new Promise(resolve =>
              media.addEventListener('loadedmetadata', resolve, {once: true}),
            );
          }
          await Promise.race([
            media.play(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 8000)),
          ]);
          media.pause();
          media.currentTime = seek;
          await Promise.race([
            new Promise(resolve => media.addEventListener('seeked', resolve, {once: true})),
            new Promise((_, reject) => setTimeout(() => reject(new Error('seek timeout')), 8000)),
          ]);
          window.__heldBufferedEnd = buffered;
          media.dispatchEvent(new Event('progress'));
          await new Promise(resolve => setTimeout(resolve, 400));
        },
        {seek: SEEK, buffered: BUFFERED},
      );
      await page.mouse.move(890, 630);
      await page.waitForTimeout(600);
      // A clipped capture can lay the page out again at another size, so
      // the whole viewport is captured and cropped afterwards.
      const box = await player.boundingBox();
      const file = path.join(OUT, `${label}-${shot.name}-${mode}.png`);
      await page.screenshot({path: file});
      const margin = 16;
      const crop = {
        x: Math.max(box.x - margin, 0),
        y: Math.max(box.y - margin, 0),
        width: box.width + margin * 2,
        height: box.height + margin * 2,
      };
      const facts = await page.evaluate(() => {
        const bar = document.querySelector('#storybook-root [data-visible]');
        const root = bar.closest('[role="group"]');
        const media = document.querySelector('#storybook-root video');
        return {
          player: root.clientWidth,
          barHeight: bar.offsetHeight,
          inset: bar.offsetLeft,
          visible: bar.getAttribute('data-visible'),
          time: media.currentTime,
          duration: media.duration,
          spinner: document.querySelectorAll('.astryx-spinner').length,
        };
      });
      report.push({file: path.basename(file), crop, ...facts});
      await context.close();
    }
  }
  server.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
