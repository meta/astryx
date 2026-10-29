// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Render the CDN starter page in a browser, and report what went wrong.
 *
 * One render loads the page until its network goes idle, then reads the first
 * button: a page that throws while rendering still goes idle with an empty
 * root, so the render itself is asserted, not only the error streams. A page
 * with a request that never finishes never goes idle, so its navigation times
 * out: that is an unclean render like any other, reported with the requests
 * still in flight when the wait gave up, so the output names the asset that
 * hung instead of ending the run on a stack trace. renderUntilClean retries
 * an unclean render once, so a blip at a CDN is not a red build, and fits
 * every attempt inside one deadline, so a page that hangs on each attempt
 * still gets its report printed before the job running it is stopped. It
 * hands every retry the attempt it discards, and uncleanFindings names what
 * made that attempt unclean, so a blip that clears on the retry still shows
 * in the log. Only an expected absence (a wait that ran out) becomes a value;
 * every other error throws.
 */

/** Playwright's error for a navigation whose wait condition never came. */
function isTimeout(error) {
  return error?.name === 'TimeoutError';
}

/**
 * Load `url` once in a browser from `launch`, and collect its console errors,
 * page errors and failed requests, and the first button's text (null when no
 * button rendered). A navigation that times out comes back with `timedOut`
 * and the URLs still in flight (`pendingRequests`, in request order); any
 * other navigation error throws. With `budgetMs`, the whole attempt fits in
 * it: the navigation waits no longer than the budget, and the button no
 * longer than what is left of it.
 *
 * @param {string} url
 * @param {{
 *   launch: () => Promise<import('playwright').Browser>,
 *   navigationTimeoutMs?: number,
 *   buttonTimeoutMs?: number,
 *   budgetMs?: number,
 *   now?: () => number,
 * }} options
 */
export async function renderPage(
  url,
  {
    launch,
    navigationTimeoutMs = 90_000,
    buttonTimeoutMs = 15_000,
    budgetMs,
    now = Date.now,
  },
) {
  const startedAt = now();
  /**
   * `limitMs`, cut to what is left of the budget. Never 0: Playwright reads a
   * timeout of 0 as no timeout at all.
   */
  const withinBudget = limitMs =>
    budgetMs == null
      ? limitMs
      : Math.max(1, Math.min(limitMs, budgetMs - (now() - startedAt)));
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  /** Requests the page made that have neither finished nor failed. */
  const inFlight = new Set();

  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
    page.on('request', r => inFlight.add(r));
    page.on('requestfinished', r => inFlight.delete(r));
    page.on('requestfailed', r => {
      inFlight.delete(r);
      failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`);
    });
    page.on('response', r => {
      if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
    });

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: withinBudget(navigationTimeoutMs),
      });
    } catch (error) {
      if (!isTimeout(error)) {
        throw error;
      }
      return {
        consoleErrors,
        pageErrors,
        failedRequests,
        timedOut: true,
        pendingRequests: [...inFlight].map(r => r.url()),
        button: null,
      };
    }
    let button;
    try {
      button = await page
        .getByRole('button')
        .first()
        .textContent({timeout: withinBudget(buttonTimeoutMs)});
    } catch (error) {
      if (!isTimeout(error)) {
        throw error;
      }
      // No button within the wait: the page rendered nothing to press.
      button = null;
    }

    return {
      consoleErrors,
      pageErrors,
      failedRequests,
      timedOut: false,
      pendingRequests: [],
      button,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Everything that made `result` unclean, one line each: the timeout and the
 * requests still in flight, each console error, page error and failed
 * request, and a missing button on a page that finished loading. Empty for a
 * clean render.
 */
export function uncleanFindings(result) {
  return [
    ...(result.timedOut ? ['navigation timed out'] : []),
    ...result.pendingRequests.map(url => `still in flight: ${url}`),
    ...result.consoleErrors.map(entry => `console error: ${entry}`),
    ...result.pageErrors.map(entry => `page error: ${entry}`),
    ...result.failedRequests.map(entry => `failed request: ${entry}`),
    ...(!result.timedOut && !result.button ? ['rendered no button'] : []),
  ];
}

/** Whether a render went idle with nothing wrong and a button on the page. */
export function isCleanRender(result) {
  return (
    !result.timedOut &&
    result.consoleErrors.length === 0 &&
    result.pageErrors.length === 0 &&
    result.failedRequests.length === 0 &&
    Boolean(result.button)
  );
}

/**
 * Run `render` until one comes back clean, at most `attempts` times, and
 * return the last result. With a `deadline` (in `now()`'s clock), each attempt
 * is handed `budgetMs`, an equal share of the time left (so the retry gets
 * whatever the first attempt left unused), and no attempt starts once the
 * deadline has passed. `onRetry(attempt, leftMs, discarded)` hears each
 * retry, with the unclean attempt it replaces.
 *
 * @template {{timedOut: boolean, consoleErrors: string[], pageErrors: string[], failedRequests: string[], button: string | null}} R
 * @param {(attempt: {budgetMs?: number}) => Promise<R>} render
 * @param {{
 *   attempts?: number,
 *   deadline?: number,
 *   now?: () => number,
 *   onRetry?: (attempt: number, leftMs: number | undefined, discarded: R) => void,
 * }} [options]
 * @returns {Promise<R>}
 */
export async function renderUntilClean(
  render,
  {attempts = 2, deadline, now = Date.now, onRetry} = {},
) {
  const leftMs = () => (deadline == null ? undefined : deadline - now());
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const left = leftMs();
    result = await render({
      budgetMs:
        left == null ? undefined : Math.floor(left / (attempts - attempt + 1)),
    });
    if (isCleanRender(result) || attempt === attempts) break;
    const remaining = leftMs();
    if (remaining != null && remaining <= 0) break;
    onRetry?.(attempt, remaining, result);
  }
  return result;
}
