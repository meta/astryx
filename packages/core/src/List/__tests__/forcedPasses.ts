// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file forcedPasses.ts
 * @input A Chromium page, its browser, and an action to trace
 * @output `forcedPassesDuring`: the measurement passes that script forced
 *   while the action ran, each with the functions and sources on its stack.
 *   Also the DOM events dispatched and every style and layout round, so a
 *   case can show the trace saw the action
 * @position A helper for the List reorder interaction specs, in Chromium,
 *   the engine with a rendering trace
 */

import type {Browser, Page} from '@astryxdesign/a11y-spec/playwright';

interface StackFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts?: number;
  args?: {
    name?: string;
    beginData?: {stackTrace?: StackFrame[]};
    data?: {stackTrace?: StackFrame[]; type?: string};
  };
}

/**
 * The style and layout work one read forced. One read can run several
 * rounds of both, for example when anchored elements are laid out again.
 */
export interface ForcedPass {
  /** Each round, in order: `UpdateLayoutTree` or `Layout`. */
  readonly rounds: ReadonlyArray<string>;
  /** The functions on the reading script's stack, innermost first. */
  readonly frames: ReadonlyArray<string>;
  /** The script source of each of those functions. */
  readonly sources: ReadonlyArray<string>;
}

const FORCED = new Set(['Layout', 'UpdateLayoutTree']);
const INVALIDATIONS = new Set([
  'ScheduleStyleRecalculation',
  'InvalidateLayout',
]);

const keyOf = (stack: ReadonlyArray<StackFrame>) =>
  stack
    .map(
      frame =>
        `${frame.functionName}@${frame.url}:${frame.lineNumber}:${frame.columnNumber}`,
    )
    .join(' < ');

/** What the trace of an action saw on the page's main thread. */
export interface ActionTrace {
  /** The measurement passes that script forced. */
  readonly passes: ForcedPass[];
  /** The type of each DOM event dispatched, such as `pointerup`. */
  readonly events: ReadonlySet<string>;
  /** Every style and layout round, forced or not. */
  readonly rounds: number;
}

/**
 * Traces `action`, then returns each measurement pass that script forced on
 * the page's main thread. A round with the reading script's stack is forced.
 * A round joins the pass before it when the same read caused it: same
 * stack, and no write from another stack in between.
 */
export async function forcedPassesDuring(
  browser: Browser,
  page: Page,
  action: () => Promise<void>,
): Promise<ActionTrace> {
  await browser.startTracing(page, {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.stack',
    ],
  });
  let buffer: Buffer | undefined;
  try {
    await action();
  } finally {
    buffer = await browser.stopTracing();
  }
  const {traceEvents} = JSON.parse(String(buffer)) as {
    traceEvents: TraceEvent[];
  };
  const mainThreads = new Set(
    traceEvents
      .filter(e => e.ph === 'M' && e.name === 'thread_name')
      .filter(e => e.args?.name === 'CrRendererMain')
      .map(e => `${e.pid}:${e.tid}`),
  );
  const events = traceEvents
    .filter(e => mainThreads.has(`${e.pid}:${e.tid}`) && e.ts != null)
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const passes: (ForcedPass & {key: string; rounds: string[]})[] = [];
  const dispatched = new Set<string>();
  let rounds = 0;
  let wroteSince = false;
  for (const e of events) {
    if (e.name === 'EventDispatch' && e.args?.data?.type != null) {
      dispatched.add(e.args.data.type);
    }
    if (FORCED.has(e.name)) {
      rounds += 1;
    }
    if (INVALIDATIONS.has(e.name)) {
      const stack = e.args?.data?.stackTrace ?? [];
      if (stack.length > 0 && keyOf(stack) !== passes[passes.length - 1]?.key) {
        wroteSince = true;
      }
      continue;
    }
    const stack = e.args?.beginData?.stackTrace ?? [];
    if (!FORCED.has(e.name) || stack.length === 0) {
      continue;
    }
    const key = keyOf(stack);
    const last = passes[passes.length - 1];
    if (last != null && last.key === key && !wroteSince) {
      last.rounds.push(e.name);
      continue;
    }
    passes.push({
      key,
      rounds: [e.name],
      frames: stack.map(frame => frame.functionName ?? ''),
      sources: stack.map(frame => frame.url ?? ''),
    });
    wroteSince = false;
  }
  return {
    passes: passes.map(pass => ({
      rounds: pass.rounds,
      frames: pass.frames,
      sources: pass.sources,
    })),
    events: dispatched,
    rounds,
  };
}

/** The passes forced under one of `functions`. */
export function passesUnder(
  passes: ReadonlyArray<ForcedPass>,
  functions: ReadonlyArray<string>,
): ForcedPass[] {
  return passes.filter(pass =>
    pass.frames.some(frame => functions.includes(frame)),
  );
}

/** One line per pass, for an assertion's message. */
export function describePasses(passes: ReadonlyArray<ForcedPass>): string {
  return passes
    .map(
      pass =>
        `${pass.rounds.join('+')} in ${pass.frames.slice(0, 4).join(' < ')}`,
    )
    .join('; ');
}
