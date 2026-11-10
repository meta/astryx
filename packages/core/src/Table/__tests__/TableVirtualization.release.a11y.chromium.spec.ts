// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only
// @a11y-isolated
/**
 * @file TableVirtualization.release.a11y.chromium.spec.ts
 * @input Production row fixture, isolated Chromium and synthetic 1k/10k/100k corpora
 * @output Raw samples, percentile/count/heap receipts and strict budget assertions
 * @position Release evidence on the actual public Table path, not unit timing
 */
import {
  expect,
  test,
  type CDPSession,
} from '@astryxdesign/a11y-spec/playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  startRowFixture,
  scrollRows,
} from './TableVirtualization.release.harness';
import {frames} from '@astryxdesign/interaction-harness';
import type {Combination} from './TableVirtualization.release.fixture';
/** The checked-out commit, or `unknown` outside a Git checkout. */
function readHeadCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}
/** The installed version of `name` that the fixture build resolves. */
function readPackageVersion(name: string): string {
  for (const root of ['packages/core', '.']) {
    const file = path.resolve(root, 'node_modules', name, 'package.json');
    if (fs.existsSync(file)) {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        version: string;
      };
      return manifest.version;
    }
  }
  return 'unresolved';
}
const SAMPLES = 100;
/**
 * Timing budgets for the release runner (4-core-ubuntu), with this proof alone
 * in its leg. They are the module record's PR5 targets: five isolated runs
 * there stay inside them, and worst-run-plus-25% is never looser.
 */
const TIMING_BUDGETS = {
  rangeCommitP95Ms: 4,
  noopP95Ms: 2,
  frameWorkP95Ms: 16.7,
  missedFraction: 0.01,
  supportedIncrementP95Ms: 2,
  coldMountMaxMs: 250,
};
// Timing gates only on the release runner. Elsewhere the receipt reports it.
const GATES_TIMING = process.env.ASTRYX_TABLE_TIMING_GATE === '1';
function expectTiming(value: number, budget: number, label: string) {
  if (GATES_TIMING) {
    expect.soft(value, label).toBeLessThanOrEqual(budget);
  }
}
// Measure 30 seconds at 60 Hz; a 1% rate is unstable over only 100 intervals.
const CADENCE_SAMPLES = 60 * 30;
const SIZES = [1000, 10000, 100000];
let fixture: Awaited<ReturnType<typeof startRowFixture>>;
test.beforeAll(async () => {
  fixture = await startRowFixture(test.info().parallelIndex);
});
test.afterAll(async () => {
  await fixture?.close();
});
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted[sorted.length - 1],
  };
}
async function taskMilliseconds(cdp: CDPSession) {
  const {metrics} = await cdp.send('Performance.getMetrics');
  const task = metrics.find(
    (metric: {name: string}) => metric.name === 'TaskDuration',
  );
  if (task == null) {
    throw new Error('Chromium reported no TaskDuration metric');
  }
  return task.value * 1000;
}
async function heap(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  const memory = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  return {bytes: memory.usedSize, ...dom};
}

test('records release timing, bounded work and controlled-GC lifetime without relaxing budgets', async ({
  browser,
}, info) => {
  test.setTimeout(360000);
  const results = [];
  for (const count of SIZES) {
    for (const combination of ['core', 'supported'] as Combination[]) {
      const context = await browser.newContext({
        viewport: {width: 1280, height: 800},
      });
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await page.goto(`${fixture.origin}/TableVirtualization.release.html`);
        await page.waitForFunction(() => !!window.__rowRelease);
        await page.evaluate(count => window.__rowRelease.prepare(count), count);
        const callerHeap = await heap(cdp);
        const cold: number[] = [];
        const remount: number[] = [];
        cold.push(
          await page.evaluate(
            combination => window.__rowRelease.mount(combination),
            combination,
          ),
        );
        await frames(page, 3);
        await expect(page.getByRole('table')).toHaveAttribute(
          'aria-rowcount',
          String(count + 1),
        );
        const mountedHeap = await heap(cdp);
        const initial = await page.evaluate(() => ({
          ...window.__rowRelease.counts,
        }));
        const changed: number[] = [],
          noop: number[] = [];
        await page.evaluate(() => window.__rowRelease.startRangeProbe());
        let noOpCells = 0,
          scrollIdentity = 0,
          maxMountedRows = 0,
          maxScrollCells = 0;
        for (let sample = 0; sample < SAMPLES; sample++) {
          const before = await page.evaluate(() => ({
            ...window.__rowRelease.counts,
          }));
          const taskStart = await taskMilliseconds(cdp);
          await scrollRows(page, (10 + sample * 2) * 56);
          changed.push((await taskMilliseconds(cdp)) - taskStart);
          const after = await page.evaluate(() => ({
            ...window.__rowRelease.counts,
          }));
          scrollIdentity += after.identity - before.identity;
          maxScrollCells = Math.max(maxScrollCells, after.cells - before.cells);
          maxMountedRows = Math.max(
            maxMountedRows,
            await page.locator('tbody > tr[aria-rowindex]').count(),
          );
          const preNoop = after.cells;
          noop.push(await page.evaluate(() => window.__rowRelease.noop()));
          await frames(page, 2);
          noOpCells +=
            (await page.evaluate(() => window.__rowRelease.counts.cells)) -
            preNoop;
        }
        const rangeCommit = await page.evaluate(() =>
          window.__rowRelease.stopRangeProbe(),
        );
        if (count > 1000) {
          // Row numbers past 999 have four digits and must stay windowed.
          await scrollRows(page, 1500 * 56);
          maxMountedRows = Math.max(
            maxMountedRows,
            await page.locator('tbody > tr[aria-rowindex]').count(),
          );
        }
        const cadence = await page.evaluate(
          async samples =>
            new Promise<{intervals: number[]; blankFrames: number}>(resolve => {
              const found = document.querySelector<HTMLElement>(
                '.astryx-table-scroll-wrapper',
              );
              if (found == null) {
                throw new Error('The Table viewport is missing');
              }
              const viewport: HTMLElement = found;
              const startTop = viewport.scrollTop;
              const endTop = startTop + 200 * 56;
              const intervals: number[] = [];
              let direction = 1;
              let last = 0,
                blankFrames = 0;
              function next(now: number) {
                if (last) {
                  intervals.push(now - last);
                }
                last = now;
                const viewportBox = viewport.getBoundingClientRect();
                const rows = Array.from(
                  viewport.querySelectorAll<HTMLElement>(
                    'tbody > tr[aria-rowindex]',
                  ),
                );
                if (
                  !rows.some(row => {
                    const box = row.getBoundingClientRect();
                    return (
                      box.bottom > viewportBox.top &&
                      box.top < viewportBox.bottom
                    );
                  })
                ) {
                  blankFrames++;
                }
                if (intervals.length === samples) {
                  resolve({intervals, blankFrames});
                  return;
                }
                // Reverse before the 1k corpus ends, so every interval includes a scroll.
                if (viewport.scrollTop >= endTop) {
                  direction = -1;
                } else if (viewport.scrollTop <= startTop) {
                  direction = 1;
                }
                viewport.scrollTop += direction * 56;
                requestAnimationFrame(next);
              }
              requestAnimationFrame(next);
            }),
          CADENCE_SAMPLES,
        );
        const missedFrames = cadence.intervals.reduce(
          (sum, interval) =>
            sum + Math.max(0, Math.round(interval / (1000 / 60)) - 1),
          0,
        );
        await page.evaluate(() => window.__rowRelease.unmount());
        await frames(page, 3);
        const baseline = await heap(cdp);
        const retained: number[] = [];
        for (let cycle = 0; cycle < 20; cycle++) {
          remount.push(
            await page.evaluate(
              combination => window.__rowRelease.mount(combination),
              combination,
            ),
          );
          await frames(page, 2);
          await scrollRows(page, 500 * 56);
          await page.evaluate(() => window.__rowRelease.unmount());
          await frames(page, 2);
          retained.push((await heap(cdp)).bytes);
        }
        // React DOM keeps the target of the last event it dispatched until it
        // dispatches the next one. One event on the empty root stands in for
        // the next user input, so only retention that the Table owns remains.
        await page.evaluate(() =>
          document
            .getElementById('root')
            ?.dispatchEvent(new MouseEvent('click', {bubbles: true})),
        );
        // A second GC runs after the WeakRef targets cease to be kept alive by their creation job.
        await frames(page, 2);
        const final = await heap(cdp);
        const survivingFrames = await page.evaluate(() =>
          window.__rowRelease.pendingFrames(),
        );
        const survivingViewports = await page.evaluate(
          () =>
            window.__rowRelease.oldViewports.filter(ref => ref.deref() != null)
              .length,
        );
        results.push({
          count,
          combination,
          columns: combination === 'core' ? 3 : 5,
          coldMs: distribution(cold),
          remountMs: distribution(remount),
          rangeCommitMs: distribution(rangeCommit),
          rangeCommitSamples: rangeCommit.length,
          mainThreadTaskMsUpperBound: distribution(changed),
          noopCommitMs: distribution(noop),
          frameIntervalsMs: distribution(cadence.intervals),
          missedFrames,
          observedFrames: cadence.intervals.length,
          missedFraction:
            missedFrames / (cadence.intervals.length + missedFrames),
          blankFrames: cadence.blankFrames,
          callerHeap,
          mountedHeap,
          mountedIncrementBytesUpperBound: mountedHeap.bytes - callerHeap.bytes,
          baseline,
          final,
          retained,
          retainedGrowthBytes: final.bytes - baseline.bytes,
          plateauSpreadBytes:
            Math.max(...retained.slice(-5)) - Math.min(...retained.slice(-5)),
          survivingViewports,
          survivingFrames,
          initialCounts: initial,
          scrollIdentity,
          noOpCells,
          maxScrollCells,
          maxMountedRows,
          raw: {
            cold,
            remount,
            rangeCommit,
            changed,
            noop,
            frameIntervals: cadence.intervals,
          },
        });
        await cdp.detach();
      } finally {
        await context.close();
      }
    }
  }
  const receipt = {
    environment: {
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model,
      node: process.version,
      browser: browser.version(),
      build: {
        description:
          'Vite production; canonical Astryx StyleX source compiler; no React StrictMode',
        commit: readHeadCommit(),
        react: readPackageVersion('react'),
        reactDom: readPackageVersion('react-dom'),
        vite: readPackageVersion('vite'),
        stylex: readPackageVersion('@stylexjs/stylex'),
      },
      viewport: {width: 1280, height: 800},
      tableViewportHeight: 320,
      rowPitch: 56,
      corpus: 'Synthetic stable function keys; name string and numeric value',
      combinations: {
        core: 'Default cells plus no-op counting transforms',
        supported:
          'Selection, row index, sticky columns plus no-op counting transforms',
      },
    },
    timingGate: {
      gates: GATES_TIMING,
      runner: GATES_TIMING ? '4-core-ubuntu' : 'reported only',
      budgets: TIMING_BUDGETS,
    },
    limitations: [
      'The timing proof owns its contract shard; other shards retain parallel workers.',
      'Cadence records 1800 intervals over 200 row pitches in both directions; every scheduling gap enters the unchanged 1% missed-frame bound.',
      'Range-plus-commit spans run from the viewport scroll event to the end of the React commit that it causes, including layout effects; they exclude style, layout and paint after the commit.',
      'TaskDuration is an inclusive main-thread work bound for each scroll step and its frames, not a compositor/GPU measurement.',
      'Before the final heap sample, one click on the empty root releases the last event target that React DOM keeps; without it one scrolled viewport stays reachable through React DOM until the next event.',
      'Frame intervals report Chromium requestAnimationFrame cadence at 60 Hz, not assistive-technology speech.',
      'Mounted heap increment includes all Table allocations; it upper-bounds identity bookkeeping but does not attribute individual allocations.',
      'Public remount replaces the viewport; no private viewport-ref mutation is used.',
      'Cold mount has one fresh-context sample per corpus; the 20 lifecycle remounts are separately labelled warm remounts.',
      'Scroll timing samples cover logical rows 10 through 208; whole-range, portal menus and other supported plugin combinations remain unmeasured.',
    ],
    results,
  };
  fs.writeFileSync(
    info.outputPath('table-row-release.json'),
    JSON.stringify(receipt, null, 2),
  );
  await info.attach('table-row-release.json', {
    body: JSON.stringify(receipt, null, 2),
    contentType: 'application/json',
  });
  for (const result of results) {
    const label = `${result.count}/${result.combination}`;
    expect
      .soft(result.rangeCommitSamples, `${label} range-plus-commit samples`)
      .toBeGreaterThanOrEqual(SAMPLES * 0.9);
    expectTiming(
      result.rangeCommitMs.p95,
      TIMING_BUDGETS.rangeCommitP95Ms,
      `${label} range-plus-commit`,
    );
    expectTiming(
      result.noopCommitMs.p95,
      TIMING_BUDGETS.noopP95Ms,
      `${label} no-op`,
    );
    expectTiming(
      result.mainThreadTaskMsUpperBound.p95,
      TIMING_BUDGETS.frameWorkP95Ms,
      `${label} main-thread frame work`,
    );
    expectTiming(
      result.missedFraction,
      TIMING_BUDGETS.missedFraction,
      `${label} missed frame fraction`,
    );
    expect.soft(result.blankFrames, `${label} blank frames`).toBe(0);
    expect
      .soft(result.initialCounts.cells, `${label} initial pre-cell work bound`)
      .toBeLessThanOrEqual(16 * result.columns);
    expect
      .soft(
        result.initialCounts.identity,
        `${label} one complete identity pass`,
      )
      .toBe(result.count);
    expect
      .soft(result.scrollIdentity, `${label} scroll key validation`)
      .toBe(0);
    expect.soft(result.noOpCells, `${label} no-op cell transforms`).toBe(0);
    expect
      .soft(result.maxMountedRows, `${label} mounted row bound`)
      .toBeLessThanOrEqual(15);
    expect
      .soft(result.maxScrollCells, `${label} per-scroll cell work bound`)
      .toBeLessThanOrEqual(16 * result.columns);
    if (result.count === 100000 && result.combination === 'core') {
      expectTiming(
        result.coldMs.max,
        TIMING_BUDGETS.coldMountMaxMs,
        `${label} cold mount`,
      );
      expect
        .soft(
          result.mountedIncrementBytesUpperBound,
          `${label} identity-inclusive allocation bound`,
        )
        .toBeLessThanOrEqual(32 * 1024 * 1024);
    }
    const small = results.find(
      other => other.count === 1000 && other.combination === result.combination,
    );
    if (small == null) {
      throw new Error(`No 1k ${result.combination} result to compare against`);
    }
    // Subtract caller data, which is explicitly outside the fixed-viewport mounted budget.
    expect
      .soft(
        result.mountedIncrementBytesUpperBound -
          small.mountedIncrementBytesUpperBound,
        `${label} 1k-relative mounted heap`,
      )
      .toBeLessThanOrEqual(8 * 1024 * 1024);
    expect
      .soft(result.retainedGrowthBytes, `${label} retained growth`)
      .toBeLessThanOrEqual(1024 * 1024);
    expect
      .soft(result.plateauSpreadBytes, `${label} retained plateau`)
      .toBeLessThanOrEqual(1024 * 1024);
    expect.soft(result.survivingFrames, `${label} orphan frames`).toBe(0);
    expect
      .soft(result.survivingViewports, `${label} orphan viewport nodes`)
      .toBe(0);
    expect
      .soft(result.final.jsEventListeners, `${label} retained listeners`)
      .toBeLessThanOrEqual(result.baseline.jsEventListeners);
    if (result.combination === 'supported') {
      const core = results.find(
        other => other.count === result.count && other.combination === 'core',
      );
      if (core == null) {
        throw new Error(`No core result at ${result.count} rows`);
      }
      expectTiming(
        result.rangeCommitMs.p95 - core.rangeCommitMs.p95,
        TIMING_BUDGETS.supportedIncrementP95Ms,
        `${label} incremental supported-plugin p95`,
      );
    }
  }
});
