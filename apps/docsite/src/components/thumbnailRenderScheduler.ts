// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Serializes live template thumbnail activation during browser idle time.
 * @input Receives cancellable async render jobs from visible gallery tiles, and cancellable download starts from tiles near the viewport.
 * @output Runs one job at a time and waits for it to settle before scheduling the next. A download start runs only when no render job waits.
 * @position Client-side scheduling boundary between visibility and heavy preview work.
 */

type ThumbnailRenderJob = {
  cancelled: boolean;
  run: () => Promise<unknown> | unknown;
};

const IDLE_STARVATION_MS = 1000;
const TIMER_FALLBACK_MS = 100;
const jobs: ThumbnailRenderJob[] = [];
// Downloads for tiles that are not visible yet. They start only when no
// render job waits.
const prefetchJobs: ThumbnailRenderJob[] = [];
let isBusy = false;

function takeJob(): ThumbnailRenderJob | undefined {
  for (const lane of [jobs, prefetchJobs]) {
    let job = lane.shift();
    while (job?.cancelled === true) {
      job = lane.shift();
    }
    if (job) {
      return job;
    }
  }
  return undefined;
}

function scheduleNext(): void {
  if (isBusy || (jobs.length === 0 && prefetchJobs.length === 0)) {
    return;
  }

  isBusy = true;
  let didStart = false;
  let idleId: number | undefined;
  let timerId: number | undefined;

  const runNext = () => {
    if (didStart) {
      return;
    }
    didStart = true;
    if (
      idleId !== undefined &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(idleId);
    }
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }

    const job = takeJob();

    if (job == null) {
      isBusy = false;
      return;
    }

    const execute = async () => {
      try {
        await job.run();
      } finally {
        isBusy = false;
        scheduleNext();
      }
    };
    void execute().catch(() => {});
  };

  if (typeof window.requestIdleCallback === 'function') {
    idleId = window.requestIdleCallback(runNext);
    timerId = window.setTimeout(runNext, IDLE_STARVATION_MS);
  } else {
    timerId = window.setTimeout(runNext, TIMER_FALLBACK_MS);
  }
}

/**
 * Queues the start of a download for a tile that is not visible yet. It runs
 * in idle time, after every render job that waits. Returns a cancel function.
 */
export function scheduleThumbnailPrefetch(run: () => void): () => void {
  const job = {cancelled: false, run};
  prefetchJobs.push(job);
  scheduleNext();

  return () => {
    job.cancelled = true;
  };
}

export function scheduleThumbnailRender(
  run: () => Promise<unknown> | unknown,
): () => void {
  const job = {cancelled: false, run};
  jobs.push(job);
  scheduleNext();

  return () => {
    job.cancelled = true;
  };
}
