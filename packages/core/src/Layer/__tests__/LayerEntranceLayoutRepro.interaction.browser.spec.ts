// Copyright (c) Meta Platforms, Inc. and affiliates.

// NOT FOR LANDING: runs the submenu entrance proof of
// LayerEntranceLayout.interaction.browser.spec.ts on many fresh pages and
// names the source of any layout inside an entrance's window.

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});
test.setTimeout(300_000);

const PAGES = Number(process.env.REPRO_PAGES ?? 25);
const OPENS = 5;

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: {
    data?: Record<string, unknown>;
    beginData?: Record<string, unknown>;
    endData?: Record<string, unknown>;
    elementCount?: number;
  };
}

interface DomEvent {
  type: string;
  t: number;
  who: string;
  name: string;
}

const layerOf = (locator: Locator) =>
  locator.locator('xpath=ancestor-or-self::*[@popover][1]');

async function watch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __entrance: {start: number; end: number};
      __dom: DomEvent[];
    };
    w.__entrance = {start: 0, end: 0};
    w.__dom = [];
    const tick = () => requestAnimationFrame(tick);
    requestAnimationFrame(tick);
    const inLayer = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[data-layer-anchored]') != null;
    const who = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return target === window
          ? 'window'
          : target === document
            ? 'document'
            : 'other';
      }
      const layer = target.closest('[data-layer-anchored]');
      const tag = `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${target.getAttribute('role') ? `[${target.getAttribute('role')}]` : ''}`;
      if (layer == null) {
        return `page ${tag}`;
      }
      return `${layer.id || 'layer'} ${target === layer ? 'layer' : target === layer.firstElementChild ? 'surface' : tag}`;
    };
    addEventListener(
      'animationstart',
      e => {
        if (inLayer(e.target) && w.__entrance.start === 0) {
          w.__entrance.start = performance.timeOrigin + e.timeStamp;
        }
      },
      true,
    );
    addEventListener(
      'animationend',
      e => {
        if (inLayer(e.target)) {
          w.__entrance.end = performance.timeOrigin + e.timeStamp;
        }
      },
      true,
    );
    for (const type of [
      'animationstart',
      'animationend',
      'animationcancel',
      'transitionrun',
      'transitionend',
      'transitioncancel',
      'toggle',
      'beforetoggle',
      'focusin',
      'scroll',
      'resize',
      'pointerdown',
      'pointerup',
      'click',
      'mouseover',
    ]) {
      addEventListener(
        type,
        e => {
          w.__dom.push({
            type,
            t: performance.timeOrigin + e.timeStamp,
            who: who(e.target),
            name:
              (e as AnimationEvent).animationName ??
              (e as TransitionEvent).propertyName ??
              (e as ToggleEvent).newState ??
              '',
          });
          if (w.__dom.length > 400) {
            w.__dom.splice(0, w.__dom.length - 400);
          }
        },
        true,
      );
    }
  });
}

async function closeAll(page: Page): Promise<void> {
  const open = page.locator('[data-layer-anchored]:popover-open');
  for (let press = 0; press < 3 && (await open.count()) > 0; press++) {
    await page.keyboard.press('Escape');
  }
  await expect(open).toHaveCount(0);
}

// The harness's traceRendering, returning raw events. A full trace adds
// invalidation tracking and stacks; a lean one keeps the harness's categories.
async function traceWindow(
  page: Page,
  body: () => Promise<unknown>,
  full: boolean,
) {
  const cdp = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', ({value}) => {
    events.push(...(value as unknown as TraceEvent[]));
  });
  const complete = new Promise<void>(resolve =>
    cdp.once('Tracing.tracingComplete', () => resolve()),
  );
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        ...(full
          ? [
              'disabled-by-default-devtools.timeline.invalidationTracking',
              'disabled-by-default-devtools.timeline.stack',
            ]
          : []),
        'blink.user_timing',
        'toplevel',
      ],
      excludedCategories: ['*'],
    },
  });
  const tag = `repro-${Math.random().toString(36).slice(2, 8)}`;
  const mark = async (name: string) =>
    page.evaluate(
      n => performance.timeOrigin + performance.mark(n).startTime,
      name,
    );
  const standDown = async (on: boolean) =>
    page.evaluate(value => {
      const w = window as unknown as {
        __harnessRenderingTrace?: boolean;
        __harnessAnimations?: {resume?: () => void};
      };
      w.__harnessRenderingTrace = value;
      if (!value) {
        w.__harnessAnimations?.resume?.();
      }
    }, on);
  await standDown(true);
  await frames(page, 1);
  let fromEpoch = 0;
  try {
    fromEpoch = await mark(`${tag}:start`);
    await body();
    await mark(`${tag}:end`);
  } finally {
    await standDown(false).catch(() => {});
  }
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach().catch(() => {});
  const start = events.find(e => e.name === `${tag}:start`);
  const end = events.find(e => e.name === `${tag}:end`);
  if (start == null || end == null) {
    throw new Error('traceWindow: the marks were not traced');
  }
  const main = events
    .filter(
      e =>
        e.pid === start.pid &&
        e.tid === start.tid &&
        e.ts >= start.ts &&
        e.ts <= end.ts &&
        e.ph !== 'E',
    )
    .sort((a, b) => a.ts - b.ts);
  const toEpoch = (ts: number) => fromEpoch + (ts - start.ts) / 1000;
  return {main, toEpoch};
}

// A trace field as text, or null when it is not a string or a number.
function text(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function describe(e: TraceEvent): string {
  const d = e.args?.data ?? {};
  const stack = (
    d.stackTrace as
      | {
          functionName?: string;
          url?: string;
          lineNumber?: number;
          columnNumber?: number;
        }[]
      | undefined
  )
    ?.slice(0, 5)
    .map(
      f =>
        `${f.functionName || '?'}@${(f.url ?? '').split('/').pop()}:${f.lineNumber ?? '?'}:${f.columnNumber ?? '?'}`,
    )
    .join(' < ');
  const url = text(d.url);
  const begin = e.args?.beginData;
  const parts = [
    text(d.type),
    text(d.functionName),
    url == null
      ? null
      : `${url.split('/').pop()}:${text(d.lineNumber) ?? '?'}:${text(d.columnNumber) ?? '?'}`,
    text(d.reason),
    text(d.nodeName),
    e.args?.elementCount == null ? null : `els=${e.args.elementCount}`,
    begin == null
      ? null
      : `dirty=${text(begin.dirtyObjects) ?? '?'}/${text(begin.totalObjects) ?? '?'}`,
    stack == null ? null : `[${stack}]`,
  ].filter(part => part != null);
  return `${e.name}${e.dur ? `(${Math.round(e.dur / 100) / 10}ms)` : ''} ${parts.join(' ')}`;
}

// The task a main-thread event ran in, as the chain of what ran before it.
function taskOf(main: ReadonlyArray<TraceEvent>, e: TraceEvent): string {
  const task = main.find(
    t =>
      t.name === 'RunTask' &&
      t.ph === 'X' &&
      t.ts <= e.ts &&
      t.ts + (t.dur ?? 0) >= e.ts,
  );
  if (task == null) {
    return 'no task';
  }
  const inner = main.filter(
    x =>
      x.ts >= task.ts &&
      x.ts <= e.ts &&
      x !== task &&
      [
        'EventDispatch',
        'FireAnimationFrame',
        'TimerFire',
        'FunctionCall',
        'FireIdleCallback',
        'BeginMainThreadFrame',
        'UpdateLayoutTree',
        'Layout',
        'HitTest',
        'IntersectionObserverController::computeIntersections',
        'ParseHTML',
        'EvaluateScript',
      ].includes(x.name),
  );
  return inner
    .slice(-10)
    .map(x => describe(x).slice(0, 160))
    .join(' > ');
}

test('NOT FOR LANDING: the submenu entrance on many fresh pages', async ({
  browser,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const found: string[] = [];
  const counts: number[][] = [];
  for (let p = 0; p < PAGES; p++) {
    const context = await browser.newContext({
      viewport: {width: 1280, height: 800},
      isMobile: false,
      hasTouch: false,
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), 'core-dropdownmenu--submenu');
      await watch(page);
      const perPage: number[] = [];
      for (let open = 0; open < OPENS; open++) {
        await page.getByRole('button', {name: 'Actions'}).click();
        const row = page.getByRole('menuitem', {name: 'Rename'});
        await expect(row).toBeVisible();
        await waitForRest(layerOf(row));
        await page.evaluate(() => {
          const w = window as unknown as {
            __entrance: {start: number; end: number};
            __dom: DomEvent[];
          };
          w.__entrance = {start: 0, end: 0};
          w.__dom.length = 0;
        });
        const full = p % 2 === 0;
        const {main, toEpoch} = await traceWindow(
          page,
          async () => {
            await page.getByRole('menuitem', {name: 'Move to'}).click();
            await expect(
              page.getByRole('menuitem', {name: 'Folder A'}),
            ).toBeVisible();
            await page.waitForFunction(
              () =>
                (window as unknown as {__entrance: {end: number}}).__entrance
                  .end > 0,
            );
          },
          full,
        );
        const {entrance, dom} = await page.evaluate(() => {
          const w = window as unknown as {
            __entrance: {start: number; end: number};
            __dom: DomEvent[];
          };
          return {entrance: w.__entrance, dom: w.__dom.slice()};
        });
        const inWindow = main.filter(
          e =>
            e.name === 'Layout' &&
            toEpoch(e.ts) >= entrance.start &&
            toEpoch(e.ts) <= entrance.end,
        );
        perPage.push(inWindow.length);
        if (inWindow.length > 0) {
          const rel = (epoch: number) =>
            (Math.round((epoch - entrance.start) * 10) / 10).toFixed(1);
          const first = inWindow[0];
          const layouts = main.filter(e => e.name === 'Layout');
          const attribution = inWindow.map(l => {
            const prev = layouts.filter(x => x.ts < l.ts).at(-1);
            const reasons = main
              .filter(
                e =>
                  (e.name === 'LayoutInvalidationTracking' ||
                    e.name === 'StyleRecalcInvalidationTracking' ||
                    e.name === 'InvalidateLayout' ||
                    e.name === 'ScheduleStyleRecalculation') &&
                  e.ts > (prev?.ts ?? 0) &&
                  e.ts <= l.ts,
              )
              .map(e => describe(e).slice(0, 300));
            return [
              `  layout at ${rel(toEpoch(l.ts))} ms ${describe(l)}`,
              `    task: ${taskOf(main, l)}`,
              ...[...new Set(reasons)]
                .slice(0, 20)
                .map(r => `    reason: ${r}`),
            ].join('\n');
          });
          await writeEvidence(
            'layer-entrance-repro',
            {
              [`page-${p}-open-${open}-${full ? 'full' : 'lean'}.json`]:
                JSON.stringify({
                  entrance,
                  dom,
                  events: main.map(e => ({...e, epoch: toEpoch(e.ts)})),
                }),
            },
            testInfo,
          );
          const near = main
            .filter(
              e =>
                Math.abs(toEpoch(e.ts) - toEpoch(first.ts)) <= 40 ||
                (toEpoch(e.ts) >= entrance.start - 30 &&
                  toEpoch(e.ts) <= entrance.start + 20),
            )
            .filter(
              e =>
                ![
                  'ThreadControllerImpl::RunTask',
                  'Receive mojo message',
                ].includes(e.name),
            )
            .map(e =>
              `${rel(toEpoch(e.ts)).padStart(7)} ${describe(e)}`.slice(0, 400),
            );
          found.push(
            [
              `page ${p} open ${open} (${full ? 'full' : 'lean'} trace): ${inWindow.length} layout(s) in the window, at ${inWindow.map(e => rel(toEpoch(e.ts))).join(', ')} ms; window ${rel(entrance.end)} ms`,
              ...attribution,
              '  dom events (ms from animationstart):',
              ...dom.map(
                d => `    ${rel(d.t).padStart(7)} ${d.type} ${d.who} ${d.name}`,
              ),
              '  main thread near the layout and the window start:',
              ...near.map(line => `    ${line}`),
            ].join('\n'),
          );
        }
        await closeAll(page);
      }
      counts.push(perPage);
    } finally {
      await context.close();
    }
  }
  const probe = await browser.newContext();
  const cores = await (
    await probe.newPage()
  ).evaluate(() => navigator.hardwareConcurrency);
  await probe.close();
  const summary = JSON.stringify({
    pages: PAGES,
    opens: OPENS,
    chromium: browser.version(),
    cores,
    counts,
  });
  console.warn(`REPRO ${summary}`);
  await writeEvidence(
    'layer-entrance-repro',
    {'summary.json': summary},
    testInfo,
  );
  for (const f of found) {
    console.warn(`REPROFOUND\n${f}`);
  }
  expect(found, found.join('\n\n')).toEqual([]);
});
