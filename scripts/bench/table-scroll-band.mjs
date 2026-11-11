// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file table-scroll-band.mjs
 * @input Two built Storybook directories (baseline and candidate) and Chromium
 * @output JSON: React commits, CDP script/layout/style time, frame gaps, DOM
 *   churn, mounted rows and cells, and blank frames for scripted scroll
 *   patterns on the Table windowing stories
 * @position Measurement harness for the Table windowing scroll band prototype
 *
 * Usage:
 *   node scripts/bench/table-scroll-band.mjs --variant baseline=<dist> \
 *     --variant band=<dist>[:abcde] [--runs 5] [--only rows] [--out results.json]
 *
 * A variant's optional `:letters` limits it to those patterns.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from '@playwright/test';

const args = process.argv.slice(2);
const variants = [];
let runs = 5;
let out = 'table-scroll-band.json';
let only = null;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--variant') {
    const [name, spec] = args[++index].split('=');
    const [dir, letters] = spec.split(':');
    variants.push({
      name,
      dir: path.resolve(dir),
      patterns: letters == null ? null : new Set(letters.split('')),
    });
  } else if (arg === '--runs') {
    runs = Number(args[++index]);
  } else if (arg === '--out') {
    out = args[++index];
  } else if (arg === '--only') {
    only = args[++index];
  }
}

const STORIES = {
  rows: {
    id: 'core-table-virtualization--fixed-height-windowing',
    patterns: ['a', 'b', 'e'],
  },
  columns: {
    id: 'core-table-virtualization--column-windowing',
    patterns: ['c', 'e'],
  },
  both: {
    id: 'core-table-virtualization--rows-and-columns-windowing',
    patterns: ['a', 'b', 'c', 'd', 'e'],
  },
};
const PATTERNS = {
  a: {name: 'vertical 20px x300', dy: 20, dx: 0, frames: 300},
  b: {name: 'fast vertical 120px x150', dy: 120, dx: 0, frames: 150},
  c: {name: 'horizontal 20px x300', dy: 0, dx: 20, frames: 300},
  d: {name: 'diagonal 20/20 x300', dy: 20, dx: 20, frames: 300},
  e: {name: 'jump to middle and back x10', jump: true, frames: 20},
};
const THROTTLES = [1, 4];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      let file = path.join(dir, decodeURIComponent(request.url.split('?')[0]));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, 'index.html');
      }
      fs.readFile(file, (error, data) => {
        if (error) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader(
          'content-type',
          MIME[path.extname(file)] ?? 'application/octet-stream',
        );
        response.end(data);
      });
    });
    server.listen(0, () =>
      resolve({server, origin: `http://localhost:${server.address().port}`}),
    );
  });
}

// Counts React commits through the DevTools global hook, which React's
// production build also calls. In a counting pass it also counts body cells
// that rendered: a re-rendered cell gets a new props object, and a skipped
// one keeps the object it had.
const HOOK = `
window.__commits = 0;
window.__cellRenders = 0;
window.__countCells = false;
const seenProps = new WeakSet();
const fiberRoots = new Set();
// Walks the committed tree; returns the body cells whose props are new.
window.__markCells = () => {
  let rendered = 0;
  const stack = [...fiberRoots].map(root => root.current);
  while (stack.length > 0) {
    const fiber = stack.pop();
    const props = fiber.memoizedProps;
    if (fiber.tag === 5 && fiber.type === 'td' && props != null &&
        props['aria-hidden'] !== 'true' && !seenProps.has(props)) {
      seenProps.add(props);
      rendered++;
    }
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  return rendered;
};
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true,
  renderers: new Map(),
  inject() { return 1; },
  onCommitFiberRoot(id, root) {
    window.__commits++;
    fiberRoots.add(root);
    if (window.__countCells) {
      window.__cellRenders += window.__markCells();
    }
  },
  onCommitFiberUnmount() {},
  onPostCommitFiberRoot() {},
  checkDCE() {},
};
`;

/** Runs one scripted pattern in the page and returns its in-page measurements. */
async function runPattern(page, pattern, checkBlank) {
  return page.evaluate(
    async ({pattern, checkBlank}) => {
      const table = document.querySelector('#storybook-root table');
      const region = table.closest('[role="group"]');
      const counts = {
        rowsAdded: 0,
        rowsRemoved: 0,
        cellsAdded: 0,
        cellsRemoved: 0,
      };
      const isRow = node => node.nodeName === 'TR';
      const isCell = node => node.nodeName === 'TD' || node.nodeName === 'TH';
      const tally = (nodes, rowKey, cellKey) => {
        for (const node of nodes) {
          if (isRow(node)) {
            counts[rowKey]++;
            counts[cellKey] += node.cells.length;
          } else if (isCell(node)) {
            counts[cellKey]++;
          }
        }
      };
      const observer = new MutationObserver(records => {
        for (const record of records) {
          tally(record.addedNodes, 'rowsAdded', 'cellsAdded');
          tally(record.removedNodes, 'rowsRemoved', 'cellsRemoved');
        }
      });
      observer.observe(table, {childList: true, subtree: true});
      const loaf = [];
      let loafObserver = null;
      if (
        PerformanceObserver.supportedEntryTypes?.includes(
          'long-animation-frame',
        )
      ) {
        loafObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            loaf.push(entry.duration);
          }
        });
        loafObserver.observe({type: 'long-animation-frame'});
      }
      const mountedRows = () =>
        table.querySelectorAll('tbody > tr:not([aria-hidden="true"])').length;
      const mountedCells = () =>
        table.querySelectorAll('tbody > tr > td:not([aria-hidden="true"])')
          .length;
      // Whether the mounted rows and columns cover the visible content.
      const isCovered = () => {
        const view = region.getBoundingClientRect();
        const head = table.tHead?.getBoundingClientRect();
        const top = Math.max(view.top + region.clientTop, head?.bottom ?? 0);
        const bottom = view.top + region.clientTop + region.clientHeight;
        let left = view.left + region.clientLeft;
        let right = left + region.clientWidth;
        const headCells = Array.from(table.tHead?.rows[0]?.cells ?? []);
        for (const cell of headCells) {
          if (cell.hasAttribute('data-astryx-table-pinned')) {
            const rect = cell.getBoundingClientRect();
            if (rect.left <= left + 1) {
              left = Math.max(left, rect.right);
            } else {
              right = Math.min(right, rect.left);
            }
          }
        }
        const covers = (spans, from, to) => {
          spans.sort((x, y) => x[0] - y[0]);
          let reach = from;
          for (const [start, end] of spans) {
            if (start > reach + 1) {
              return false;
            }
            reach = Math.max(reach, end);
            if (reach >= to - 1) {
              return true;
            }
          }
          return reach >= to - 1;
        };
        const rows = Array.from(table.tBodies[0].rows)
          .filter(row => row.getAttribute('aria-hidden') !== 'true')
          .map(row => {
            const rect = row.getBoundingClientRect();
            return [rect.top, rect.bottom];
          });
        const columns = headCells
          .filter(cell => cell.getAttribute('aria-hidden') !== 'true')
          .map(cell => {
            const rect = cell.getBoundingClientRect();
            return [rect.left, rect.right];
          });
        return (
          (bottom <= top || covers(rows, top, bottom)) &&
          (right <= left || covers(columns, left, right))
        );
      };
      const frame = () =>
        new Promise(resolve => requestAnimationFrame(resolve));
      const middleTop = (region.scrollHeight - region.clientHeight) / 2;
      const middleLeft = (region.scrollWidth - region.clientWidth) / 2;
      const canBlock = region.scrollHeight > region.clientHeight + 1;
      const canInline = region.scrollWidth > region.clientWidth + 1;
      window.__countCells = checkBlank;
      const cellRendersBefore = window.__cellRenders;
      const commitsBefore = window.__commits;
      const stamps = [];
      const rowSamples = [];
      const cellSamples = [];
      let blank = 0;
      for (let step = 0; step < pattern.frames; step++) {
        stamps.push(await frame());
        if (pattern.jump) {
          const toMiddle = step % 2 === 0;
          if (canBlock) {
            region.scrollTop = toMiddle ? middleTop : 0;
          }
          if (canInline) {
            region.scrollLeft = toMiddle ? middleLeft : 0;
          }
        } else {
          region.scrollTop += pattern.dy;
          region.scrollLeft += pattern.dx;
        }
        if (checkBlank && !isCovered()) {
          blank++;
        }
        rowSamples.push(mountedRows());
        cellSamples.push(mountedCells());
      }
      stamps.push(await frame());
      await frame();
      await new Promise(resolve => setTimeout(resolve, 100));
      observer.disconnect();
      loafObserver?.disconnect();
      const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
      gaps.sort((x, y) => x - y);
      const at = q =>
        gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))];
      const mean = values =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      window.__countCells = false;
      return {
        commits: window.__commits - commitsBefore,
        cellRenders: checkBlank ? window.__cellRenders - cellRendersBefore : null,
        frameP50: at(0.5),
        frameP95: at(0.95),
        frameMax: gaps[gaps.length - 1],
        framesOver16: gaps.filter(gap => gap > 16.7 + 1).length,
        framesOver33: gaps.filter(gap => gap > 33.4 + 1).length,
        loafCount: loaf.length,
        loafTotal: loaf.reduce((sum, value) => sum + value, 0),
        ...counts,
        mutations:
          counts.rowsAdded +
          counts.rowsRemoved +
          counts.cellsAdded +
          counts.cellsRemoved,
        rowsMean: mean(rowSamples),
        rowsMax: Math.max(...rowSamples),
        cellsMean: mean(cellSamples),
        cellsMax: Math.max(...cellSamples),
        blankFrames: checkBlank ? blank : null,
      };
    },
    {pattern, checkBlank},
  );
}

const METRICS = [
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'TaskDuration',
];
async function readMetrics(cdp) {
  const {metrics} = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(
    metrics
      .filter(metric => METRICS.includes(metric.name))
      .map(metric => [metric.name, metric.value]),
  );
}

async function measure(
  browser,
  origin,
  storyId,
  pattern,
  throttle,
  checkBlank,
) {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.addInitScript(HOOK);
  await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`);
  await page.locator('#storybook-root table').first().waitFor();
  await page.waitForTimeout(500);
  if (checkBlank) {
    // The cells mounted so far count as already rendered.
    await page.evaluate(() => window.__markCells());
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
  const commitsAtLoad = await page.evaluate(() => window.__commits);
  const before = await readMetrics(cdp);
  const result = await runPattern(page, pattern, checkBlank);
  const after = await readMetrics(cdp);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  await page.close();
  return {
    commitsAtLoad,
    ...result,
    scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
  };
}

function median(values) {
  const sorted = values.filter(value => value != null).sort((x, y) => x - y);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const servers = await Promise.all(variants.map(variant => serve(variant.dir)));
const browser = await chromium.launch();
const raw = [];
const summary = [];
try {
  for (const [storyKey, story] of Object.entries(STORIES)) {
    if (only != null && storyKey !== only) {
      continue;
    }
    for (const patternKey of story.patterns) {
      const pattern = PATTERNS[patternKey];
      const active = variants.filter(
        variant => variant.patterns == null || variant.patterns.has(patternKey),
      );
      if (active.length === 0) {
        continue;
      }
      for (const throttle of THROTTLES) {
        const byVariant = Object.fromEntries(active.map(v => [v.name, []]));
        for (let run = 0; run < runs; run++) {
          // Rotate the order so no build always runs first.
          const order = active.map(
            (_, index) => active[(index + run) % active.length],
          );
          for (const variant of order) {
            const index = variants.indexOf(variant);
            const result = await measure(
              browser,
              servers[index].origin,
              story.id,
              pattern,
              throttle,
              false,
            );
            byVariant[variant.name].push(result);
            raw.push({
              story: storyKey,
              pattern: patternKey,
              throttle,
              run,
              variant: variant.name,
              ...result,
            });
          }
        }
        // A separate pass checks coverage and counts cell renders, whose reads
        // would skew timing.
        for (const variant of active) {
          const index = variants.indexOf(variant);
          const result = await measure(
            browser,
            servers[index].origin,
            story.id,
            pattern,
            throttle,
            true,
          );
          raw.push({
            story: storyKey,
            pattern: patternKey,
            throttle,
            run: 'blank',
            variant: variant.name,
            ...result,
          });
          byVariant[variant.name].blankFrames = result.blankFrames;
          byVariant[variant.name].cellRenders = result.cellRenders;
        }
        for (const variant of active) {
          const results = byVariant[variant.name];
          const keys = Object.keys(results[0]).filter(
            key => typeof results[0][key] === 'number',
          );
          const row = {
            story: storyKey,
            pattern: patternKey,
            patternName: pattern.name,
            throttle,
            variant: variant.name,
            blankFrames: results.blankFrames,
            cellRenders: results.cellRenders,
          };
          for (const key of keys) {
            row[key] = median(results.map(result => result[key]));
          }
          summary.push(row);
          process.stdout.write(`${JSON.stringify(row)}\n`);
        }
        fs.writeFileSync(out, JSON.stringify({summary, raw}, null, 2));
      }
    }
  }
} finally {
  await browser.close();
  for (const {server} of servers) {
    server.close();
  }
}
fs.writeFileSync(out, JSON.stringify({summary, raw}, null, 2));
