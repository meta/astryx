// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Serializes live template thumbnail activation during browser idle time.
 * @input Receives cancellable async render jobs from visible gallery tiles.
 * @output Runs one job at a time and waits for it to settle before scheduling the next.
 * @position Client-side scheduling boundary between visibility and heavy preview work.
 */

type ThumbnailRenderJob = {
  cancelled: boolean;
  run: () => Promise<unknown> | unknown;
};

const IDLE_STARVATION_MS = 1000;
const TIMER_FALLBACK_MS = 100;
const jobs: ThumbnailRenderJob[] = [];
let isBusy = false;

function scheduleNext(): void {
  if (isBusy || jobs.length === 0) {
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

    let job = jobs.shift();
    while (job?.cancelled === true) {
      job = jobs.shift();
    }

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
