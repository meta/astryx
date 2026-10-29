// Copyright (c) Meta Platforms, Inc. and affiliates.

import {EventEmitter} from 'node:events';
import {describe, expect, it} from 'vitest';
import {
  isCleanRender,
  renderPage,
  renderUntilClean,
  uncleanFindings,
} from './cdn-page-render.mjs';

const URL = 'http://127.0.0.1:1/';
const CORE = 'https://esm.sh/@astryxdesign/core@0.7.4?external=react,react-dom';
const CSS =
  'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.4/dist/astryx.css';

/** A request as Playwright's page events carry it. */
function request(url, errorText = null) {
  return {
    url: () => url,
    failure: () => (errorText == null ? null : {errorText}),
  };
}

/** The error Playwright's `page.goto` throws when its wait never completes. */
function navigationTimeout() {
  const error = new Error('page.goto: Timeout 90000ms exceeded.');
  error.name = 'TimeoutError';
  return error;
}

/**
 * A browser `launch` whose pages run `onGoto(page, launchIndex, options)`
 * while navigating, then settle the navigation with `gotoErrors[launchIndex]`
 * (none resolves it), and answer the button query with `button` after running
 * `onButton(options)`.
 */
function fakeLaunch({
  onGoto = () => {},
  onButton = () => {},
  gotoErrors = [],
  button = 'Start',
  buttonError = null,
}) {
  let launches = 0;
  let closed = 0;
  const launch = async () => {
    const index = launches;
    launches += 1;
    const page = new EventEmitter();
    page.goto = async (_url, options) => {
      onGoto(page, index, options);
      const error = gotoErrors[index];
      if (error != null) {
        throw error;
      }
    };
    page.getByRole = () => ({
      first: () => ({
        textContent: async options => {
          onButton(options);
          if (buttonError != null) {
            throw buttonError;
          }
          return button;
        },
      }),
    });
    return {
      newPage: async () => page,
      close: async () => {
        closed += 1;
      },
    };
  };
  return {launch, launches: () => launches, closed: () => closed};
}

/** A render whose navigation timed out with the core module still in flight. */
const TIMED_OUT = {
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  timedOut: true,
  pendingRequests: [CORE],
  button: null,
};

describe('renderPage', () => {
  it('reports a page that goes idle and renders a button as clean', async () => {
    const {launch, closed} = fakeLaunch({
      onGoto: page => {
        const css = request(CSS);
        page.emit('request', css);
        page.emit('requestfinished', css);
      },
    });
    const result = await renderPage(URL, {launch});
    expect(result.button).toBe('Start');
    expect(isCleanRender(result)).toBe(true);
    expect(closed()).toBe(1);
  });

  it('reports a navigation that times out as an unclean render, naming the requests still in flight', async () => {
    const {launch, closed} = fakeLaunch({
      onGoto: page => {
        const css = request(CSS);
        const core = request(CORE);
        page.emit('request', css);
        page.emit('requestfinished', css);
        page.emit('request', core);
      },
      gotoErrors: [navigationTimeout()],
    });
    const result = await renderPage(URL, {launch});
    expect(result.timedOut).toBe(true);
    expect(result.pendingRequests).toEqual([CORE]);
    expect(isCleanRender(result)).toBe(false);
    expect(closed()).toBe(1);
  });

  it('counts a failed request as failed, not as still in flight', async () => {
    const {launch} = fakeLaunch({
      onGoto: page => {
        const core = request(CORE, 'net::ERR_BLOCKED_BY_ORB');
        page.emit('request', core);
        page.emit('requestfailed', core);
      },
      gotoErrors: [navigationTimeout()],
    });
    const result = await renderPage(URL, {launch});
    expect(result.failedRequests).toEqual([
      `${CORE} :: net::ERR_BLOCKED_BY_ORB`,
    ]);
    expect(result.pendingRequests).toEqual([]);
  });

  it('still throws a navigation error that is not a timeout: the local server failing is not a CDN blip', async () => {
    const refused = new Error('page.goto: net::ERR_CONNECTION_REFUSED');
    const {launch, closed} = fakeLaunch({gotoErrors: [refused]});
    await expect(renderPage(URL, {launch})).rejects.toBe(refused);
    expect(closed()).toBe(1);
  });
});

describe('renderPage reading the button', () => {
  it('reports no button when none appears within the wait: the page rendered nothing to press', async () => {
    const timeout = navigationTimeout();
    const {launch} = fakeLaunch({buttonError: timeout});
    const result = await renderPage(URL, {launch});
    expect(result.button).toBeNull();
    expect(isCleanRender(result)).toBe(false);
  });

  it('throws any other error from reading the button, rather than reporting it as a missing button', async () => {
    const crashed = new Error('locator.textContent: Target crashed');
    const {launch, closed} = fakeLaunch({buttonError: crashed});
    await expect(renderPage(URL, {launch})).rejects.toBe(crashed);
    expect(closed()).toBe(1);
  });
});

describe('uncleanFindings', () => {
  it('names everything that made a render unclean', () => {
    expect(
      uncleanFindings({
        consoleErrors: ['Uncaught TypeError: x is not a function'],
        pageErrors: ['Error: boom'],
        failedRequests: [`${CSS} :: net::ERR_BLOCKED_BY_ORB`],
        timedOut: false,
        pendingRequests: [],
        button: null,
      }),
    ).toEqual([
      'console error: Uncaught TypeError: x is not a function',
      'page error: Error: boom',
      `failed request: ${CSS} :: net::ERR_BLOCKED_BY_ORB`,
      'rendered no button',
    ]);
  });

  it('names a timeout with each request still in flight, and no missing button for a page that never finished', () => {
    expect(uncleanFindings(TIMED_OUT)).toEqual([
      'navigation timed out',
      `still in flight: ${CORE}`,
    ]);
  });

  it('has nothing to say about a clean render', () => {
    expect(
      uncleanFindings({
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        timedOut: false,
        pendingRequests: [],
        button: 'Start',
      }),
    ).toEqual([]);
  });
});

describe('renderPage within a budget', () => {
  it('waits for the navigation no longer than its budget, and for the button no longer than what is left of it', async () => {
    let clock = 0;
    const timeouts = {};
    const {launch} = fakeLaunch({
      onGoto: (_page, _index, options) => {
        timeouts.navigation = options.timeout;
        clock += 30_000;
      },
      onButton: options => {
        timeouts.button = options.timeout;
      },
    });
    await renderPage(URL, {launch, budgetMs: 40_000, now: () => clock});
    expect(timeouts).toEqual({navigation: 40_000, button: 10_000});
  });

  it('never asks for a timeout of 0, which Playwright reads as no timeout at all', async () => {
    let clock = 0;
    const timeouts = {};
    const {launch} = fakeLaunch({
      onGoto: (_page, _index, options) => {
        timeouts.navigation = options.timeout;
        clock += 5_000;
      },
      onButton: options => {
        timeouts.button = options.timeout;
      },
    });
    await renderPage(URL, {launch, budgetMs: 5_000, now: () => clock});
    expect(timeouts.navigation).toBe(5_000);
    expect(timeouts.button).toBeGreaterThan(0);
  });
});

describe('renderUntilClean', () => {
  it('retries a navigation timeout once, then reports the requests still in flight', async () => {
    const {launch, launches} = fakeLaunch({
      onGoto: page => page.emit('request', request(CORE)),
      gotoErrors: [navigationTimeout(), navigationTimeout()],
    });
    const retries = [];
    const result = await renderUntilClean(() => renderPage(URL, {launch}), {
      attempts: 2,
      onRetry: attempt => retries.push(attempt),
    });
    expect(launches()).toBe(2);
    expect(retries).toEqual([1]);
    expect(result.timedOut).toBe(true);
    expect(result.pendingRequests).toEqual([CORE]);
  });

  it('hands each retry the attempt it discards, so what went wrong on it can be reported', async () => {
    const heard = [];
    let calls = 0;
    const clean = {
      ...TIMED_OUT,
      timedOut: false,
      pendingRequests: [],
      button: 'Start',
    };
    const result = await renderUntilClean(
      async () => {
        calls += 1;
        return calls === 1 ? TIMED_OUT : clean;
      },
      {
        attempts: 2,
        onRetry: (attempt, _leftMs, discarded) =>
          heard.push([attempt, discarded]),
      },
    );
    expect(heard).toEqual([[1, TIMED_OUT]]);
    expect(result).toBe(clean);
  });

  it('gives each attempt an equal share of the time left before the deadline', async () => {
    let clock = 0;
    const budgets = [];
    await renderUntilClean(
      async ({budgetMs}) => {
        budgets.push(budgetMs);
        clock += budgetMs;
        return TIMED_OUT;
      },
      {attempts: 2, deadline: 90_000, now: () => clock},
    );
    expect(budgets).toEqual([45_000, 45_000]);
  });

  it('gives the retry what the first attempt left unused', async () => {
    let clock = 0;
    const budgets = [];
    await renderUntilClean(
      async ({budgetMs}) => {
        budgets.push(budgetMs);
        clock += 10_000;
        return {...TIMED_OUT, timedOut: false, failedRequests: [CORE]};
      },
      {attempts: 2, deadline: 90_000, now: () => clock},
    );
    expect(budgets).toEqual([45_000, 80_000]);
  });

  it('does not retry once the deadline has passed, and reports the attempt it has', async () => {
    let clock = 0;
    let calls = 0;
    const retries = [];
    const result = await renderUntilClean(
      async () => {
        calls += 1;
        clock += 95_000;
        return TIMED_OUT;
      },
      {
        attempts: 2,
        deadline: 90_000,
        now: () => clock,
        onRetry: attempt => retries.push(attempt),
      },
    );
    expect(calls).toBe(1);
    expect(retries).toEqual([]);
    expect(result).toBe(TIMED_OUT);
  });

  it('stops at the first clean render after a timeout', async () => {
    const {launch, launches} = fakeLaunch({
      onGoto: (page, index) => {
        const core = request(CORE);
        page.emit('request', core);
        if (index > 0) {
          page.emit('requestfinished', core);
        }
      },
      gotoErrors: [navigationTimeout()],
    });
    const result = await renderUntilClean(() => renderPage(URL, {launch}), {
      attempts: 2,
    });
    expect(launches()).toBe(2);
    expect(isCleanRender(result)).toBe(true);
  });
});
