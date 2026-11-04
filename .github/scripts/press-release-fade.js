#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Proves the touch press's release FADES in a real engine: the
 *   pressed overlay on a Button, sampled frame by frame through the
 *   `data-pressed="fading"` arm, interpolates from the pressed strength to
 *   nothing over the release clock rather than stepping
 * @input [--storybook-dir <path>] [--story <id>] [--port <n>] [--webkit]
 * @output The sampled overlay alpha at ~0, 100 and 200 ms into the release (and
 *   the whole trace), per engine; exit 1 when the samples are not three
 *   distinct, monotonically falling values, when the paint is still there
 *   past the clock, or when the onset was not instant
 *
 * WHY A BROWSER: jsdom runs no animation and computes no `color-mix()`, so the
 * unit tests can only hold the DECLARATION (the fading arm carries the release
 * animation on the machine's clock; the paint reads the registered strength).
 * Whether a gradient layer written as
 * `linear-gradient(color-mix(in srgb, pressed calc(var(--astryx-press-alpha)
 * * 100%), transparent), ...)` actually re-resolves on every frame of an
 * animation of that registered custom property is an engine fact, and it is
 * the whole mechanism (see utils/interactionOverlay.stylex.ts). The Button is
 * the sharpest case: it transitions `background-image` itself, and a
 * composer's own transition must not take the release over.
 *
 * The page is the checked-in `Core/Press feedback (touch)` › Buttons story out
 * of a built Storybook, under Chromium's touch emulation (`pointer: coarse`,
 * no hover), the same artifact the accessibility contracts drive:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright install chromium   # and `webkit` for --webkit
 *   pnpm guard:press-release-fade
 *
 * The controller is not driven here — its clocks are unit-tested in
 * utils/pressFeedback.test.ts — the attribute is written the way it writes it,
 * and the paint is read off the pixels' source of truth, the computed style.
 */

const {chromium, webkit} = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const args = process.argv.slice(2);
const getArg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const hasFlag = name => args.includes(`--${name}`);

const storybookDir = path.resolve(
  process.cwd(),
  getArg('storybook-dir') || 'apps/storybook/dist',
);
const storyId = getArg('story') || 'core-press-feedback-touch--buttons';
const port = Number(getArg('port') || 0);

/**
 * The release clock, read from the machine so this probe cannot drift from
 * it: `PRESS_FADE_MS` in packages/core/src/utils/pressGesture.ts.
 */
function releaseClockMs() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'packages/core/src/utils/pressGesture.ts'),
    'utf8',
  );
  const match = source.match(/export const PRESS_FADE_MS = (\d+);/);
  if (!match) {
    throw new Error('PRESS_FADE_MS not found in pressGesture.ts');
  }
  return Number(match[1]);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const file = path.join(dir, decodeURIComponent(url.pathname));
      if (!file.startsWith(dir) || !fs.existsSync(file)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(response);
    });
    server.listen(port, '127.0.0.1', () =>
      resolve({server, port: server.address().port}),
    );
  });
}

/**
 * Runs in the page. Writes the attribute the way the controller does and
 * samples the overlay on every frame: the registered strength and the alpha
 * of the gradient layer's first colour, parsed off the computed
 * `background-image` (`rgba(r, g, b, a)` or `color(srgb r g b / a)`).
 */
async function sampleRelease(button, clockMs) {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const alphaOf = image => {
    // A colour channel may serialize in exponent form near zero (`9.8e-7`).
    const number = '[\\d.]+(?:e[+-]?\\d+)?';
    const legacy = image.match(
      new RegExp(`rgba?\\(\\s*${number},\\s*${number},\\s*${number}(?:,\\s*(${number}))?\\s*\\)`),
    );
    if (legacy) {
      return legacy[1] == null ? 1 : Number(legacy[1]);
    }
    const modern = image.match(new RegExp(`color\\(srgb[^)]*?/\\s*(${number})\\s*\\)`));
    if (modern) {
      return Number(modern[1]);
    }
    return image === 'none' ? 0 : Number.NaN;
  };
  const read = () => {
    const style = getComputedStyle(button);
    return {
      strength: Number(style.getPropertyValue('--astryx-press-alpha')),
      alpha: alphaOf(style.backgroundImage),
      image: style.backgroundImage,
    };
  };

  const rest = read();
  button.setAttribute('data-pressed', 'on');
  await frame();
  const onFirstFrame = read();
  await frame();
  await frame();
  const onHeld = read();

  const trace = [];
  const start = performance.now();
  button.setAttribute('data-pressed', 'fading');
  // The attribute is on; the first sample is this same frame, before the
  // engine has advanced the animation.
  while (performance.now() - start < clockMs + 80) {
    trace.push({t: performance.now() - start, ...read()});
    await frame();
  }
  button.removeAttribute('data-pressed');
  await frame();
  const after = read();
  return {rest, onFirstFrame, onHeld, trace, after};
}

function nearest(trace, t) {
  return trace.reduce((best, sample) =>
    Math.abs(sample.t - t) < Math.abs(best.t - t) ? sample : best,
  );
}

const fmt = n => (Number.isFinite(n) ? n.toFixed(4) : String(n));

async function probe(browserType, name, origin, clockMs, failures) {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    console.log(`- ${name}: not installed, skipped (${error.message.split('\n')[0]})`);
    return null;
  }
  try {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: {width: 390, height: 844},
    });
    const page = await context.newPage();
    await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: 'load',
    });
    const button = page.locator('#storybook-root button:not([disabled])').first();
    await button.waitFor({state: 'attached'});

    const media = await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
    }));
    if (!media.coarse || media.hover) {
      failures.push(
        `${name}: touch context reports pointer: coarse=${media.coarse}, hover: hover=${media.hover}`,
      );
    }
    const marked = await button.getAttribute('data-astryx-pressable');
    if (marked == null) {
      failures.push(`${name}: the button carries no data-astryx-pressable marker`);
    }

    const result = await button.evaluate(sampleRelease, clockMs);
    const {rest, onFirstFrame, onHeld, trace, after} = result;
    const at0 = trace[0];
    const at100 = nearest(trace, clockMs / 2);
    const at200 = nearest(trace, clockMs);
    const last = trace[trace.length - 1];

    console.log(`\n${name}:`);
    console.log(`  rest      alpha ${fmt(rest.alpha)}  strength ${fmt(rest.strength)}  (${rest.image})`);
    console.log(`  on, frame 1   alpha ${fmt(onFirstFrame.alpha)}  strength ${fmt(onFirstFrame.strength)}`);
    console.log(`  on, held      alpha ${fmt(onHeld.alpha)}  strength ${fmt(onHeld.strength)}`);
    console.log('  fading:');
    for (const sample of [at0, at100, at200]) {
      console.log(`    t=${sample.t.toFixed(1).padStart(6)} ms  alpha ${fmt(sample.alpha)}  strength ${fmt(sample.strength)}`);
    }
    console.log(`    last sampled t=${last.t.toFixed(1)} ms  alpha ${fmt(last.alpha)}  strength ${fmt(last.strength)}`);
    console.log(`  after removal   alpha ${fmt(after.alpha)}  (${after.image})`);
    console.log(
      `  trace (${trace.length} frames): ${trace.map(s => `${s.t.toFixed(0)}:${s.alpha.toFixed(3)}`).join(' ')}`,
    );

    // The onset is instant and complete: full pressed strength on the first
    // frame, and no stronger when held.
    if (!(onFirstFrame.strength === 1 && onFirstFrame.alpha > 0)) {
      failures.push(`${name}: the onset did not paint on the first frame (alpha ${fmt(onFirstFrame.alpha)}, strength ${fmt(onFirstFrame.strength)})`);
    }
    if (Math.abs(onHeld.alpha - onFirstFrame.alpha) > 1e-3) {
      failures.push(`${name}: the onset faded in (frame 1 alpha ${fmt(onFirstFrame.alpha)}, held ${fmt(onHeld.alpha)})`);
    }
    // The release interpolates: three distinct, falling values...
    const distinct = new Set([at0.alpha, at100.alpha, at200.alpha].map(a => a.toFixed(4)));
    if (distinct.size !== 3 || !(at0.alpha > at100.alpha && at100.alpha > at200.alpha)) {
      failures.push(`${name}: the release did not interpolate (alpha ${fmt(at0.alpha)} → ${fmt(at100.alpha)} → ${fmt(at200.alpha)})`);
    }
    // ...starting from the pressed strength, monotonic all the way...
    if (Math.abs(at0.alpha - onHeld.alpha) > 1e-3) {
      failures.push(`${name}: the release did not start from the pressed strength (${fmt(at0.alpha)} vs ${fmt(onHeld.alpha)})`);
    }
    const bumps = trace.filter((s, i) => i > 0 && s.alpha > trace[i - 1].alpha + 1e-4);
    if (bumps.length > 0) {
      failures.push(`${name}: the release is not monotonic (${bumps.length} frame(s) rose: ${bumps.map(s => `${s.t.toFixed(0)}ms ${fmt(s.alpha)}`).join(', ')})`);
    }
    // ...and gone by the clock the controller removes the attribute on.
    if (!(at200.alpha <= onHeld.alpha * 0.02 && last.strength === 0)) {
      failures.push(`${name}: the paint outlived the release clock (alpha ${fmt(at200.alpha)} at ${at200.t.toFixed(0)} ms, strength ${fmt(last.strength)} at ${last.t.toFixed(0)} ms)`);
    }
    if (after.alpha !== 0) {
      failures.push(`${name}: paint left behind after the attribute was removed (${after.image})`);
    }
    await context.close();
    return {at0, at100, at200, onHeld, trace};
  } finally {
    await browser.close();
  }
}

async function run() {
  if (!fs.existsSync(path.join(storybookDir, 'iframe.html'))) {
    throw new Error(
      `${storybookDir} has no iframe.html — run \`pnpm storybook:build\` first.`,
    );
  }
  const clockMs = releaseClockMs();
  console.log(`Release clock: ${clockMs} ms (PRESS_FADE_MS). Story: ${storyId}`);
  const {server, port: servedPort} = await serve(storybookDir);
  const origin = `http://127.0.0.1:${servedPort}`;
  const failures = [];
  try {
    await probe(chromium, 'Chromium', origin, clockMs, failures);
    if (hasFlag('webkit')) {
      await probe(webkit, 'WebKit', origin, clockMs, failures);
    }
  } finally {
    server.close();
  }
  if (failures.length > 0) {
    console.error('');
    for (const failure of failures) console.error(`✗ ${failure}`);
    return 1;
  }
  console.log('\nThe release fades: the pressed overlay interpolates to nothing over the release clock.');
  return 0;
}

if (require.main === module) {
  run()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error('Press release fade guard failed:', error);
      process.exit(1);
    });
}
