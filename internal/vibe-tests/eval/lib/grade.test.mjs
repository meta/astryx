// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  gradeWorkspace,
  inBrowserTurn,
  isAllowedRequest,
  isAlreadyHandled,
} from './grade.mjs';

describe('isAllowedRequest', () => {
  const origin = 'http://127.0.0.1:4173/';

  it('allows the local server and the font hosts only', () => {
    expect(isAllowedRequest('http://127.0.0.1:4173/assets/a.js', origin)).toBe(true);
    expect(isAllowedRequest('https://fonts.googleapis.com/css2?family=Figtree', origin)).toBe(true);
    expect(isAllowedRequest('https://fonts.gstatic.com/s/figtree/v1/a.woff2', origin)).toBe(true);
    expect(isAllowedRequest('http://fonts.gstatic.com/s/a.woff2', origin)).toBe(false);
    expect(isAllowedRequest('https://example.com/api', origin)).toBe(false);
    expect(isAllowedRequest('http://127.0.0.1:9999/', origin)).toBe(false);
    expect(isAllowedRequest('not a url', origin)).toBe(false);
  });
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A browser double that counts the contexts open at one time. */
function countingBrowser() {
  const counts = {open: 0, maxOpen: 0};
  const page = {
    on() {},
    async goto() {
      await wait(20);
    },
    async evaluate() {},
    async waitForTimeout() {
      await wait(5);
    },
    async screenshot() {},
    async addScriptTag() {},
  };
  const browser = {
    async newContext() {
      counts.open += 1;
      counts.maxOpen = Math.max(counts.maxOpen, counts.open);
      return {
        setDefaultTimeout() {},
        async route() {},
        async routeWebSocket() {},
        async newPage() {
          return page;
        },
        async close() {
          counts.open -= 1;
        },
      };
    },
  };
  return {browser, counts};
}

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** A workspace whose type check passes and whose build writes dist/index.html. */
function fakeRun() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-grade-'));
  tempDirs.push(root);
  const probePath = path.join(root, 'wait.probe.mjs');
  fs.writeFileSync(
    probePath,
    "export default () => [['waits', () => new Promise(resolve => setTimeout(resolve, 20))]];\n",
  );
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const arm = {
    typecheck: [process.execPath, '-e', ''],
    build: [
      process.execPath,
      '-e',
      "require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.html','<p>ok</p>')",
    ],
  };
  return {
    workspace,
    arm,
    task: {id: 'waits', probePath},
    outDir: path.join(root, 'grade'),
  };
}

describe('gradeWorkspace in concurrent runs', () => {
  it('opens one browser context at a time across runs graded at once', async () => {
    const {browser, counts} = countingBrowser();
    const runs = [fakeRun(), fakeRun(), fakeRun()];
    const grades = await Promise.all(
      runs.map(run => gradeWorkspace({...run, browser})),
    );
    expect(grades.map(grade => grade.passed)).toEqual([true, true, true]);
    expect(counts.maxOpen).toBe(1);
  });

  it('runs the next probe after a probe that rejects', async () => {
    const failed = inBrowserTurn(() => Promise.reject(new Error('page.goto: Timeout 5000ms exceeded.')));
    const next = inBrowserTurn(async () => 'ran');
    await expect(failed).rejects.toThrow('Timeout');
    await expect(next).resolves.toBe('ran');
  });
});

describe('isAlreadyHandled', () => {
  it("names Playwright's refusal to abort an answered route, with or without its method name", () => {
    expect(
      isAlreadyHandled(new Error('route.abort: Route is already handled!')),
    ).toBe(true);
    expect(isAlreadyHandled(new Error('Route is already handled!'))).toBe(true);
  });

  it('names no other error', () => {
    expect(
      isAlreadyHandled(
        new Error(
          'route.abort: Protocol error (Fetch.failRequest): Invalid InterceptionId.',
        ),
      ),
    ).toBe(false);
    expect(
      isAlreadyHandled(new Error('route.fulfill: Route is already handled!')),
    ).toBe(false);
    expect(isAlreadyHandled('not an error')).toBe(false);
  });
});

const FONT_URL = 'https://fonts.gstatic.com/s/figtree/v1/a.woff2';

/**
 * A browser double whose every page requests one font. The font request fails,
 * and the nth abort that follows fails with `abortError(n)`. With `gotoError`,
 * each page's `goto` then throws that error.
 */
function failingFontBrowser(abortError, {gotoError} = {}) {
  let aborts = 0;
  return {
    async newContext() {
      let handler;
      const page = {
        on() {},
        async goto() {
          await handler({
            request: () => ({url: () => `${FONT_URL}?display=swap`}),
            async fetch() {
              throw new Error('route.fetch: connect ECONNREFUSED');
            },
            async fulfill() {},
            async continue() {},
            async abort() {
              aborts += 1;
              throw abortError(aborts);
            },
          });
          if (gotoError) throw gotoError;
        },
        async evaluate() {},
        async waitForTimeout() {},
        async screenshot() {},
        async addScriptTag() {},
      };
      return {
        setDefaultTimeout() {},
        async route(_pattern, routeHandler) {
          handler = routeHandler;
        },
        async routeWebSocket() {},
        async newPage() {
          return page;
        },
        async close() {},
      };
    },
  };
}

describe('gradeWorkspace when Playwright refuses to abort a failed font request', () => {
  it('records a refusal for an answered route in the grade, without its query, and still passes', async () => {
    const browser = failingFontBrowser(
      () => new Error('route.abort: Route is already handled!'),
    );
    const grade = await gradeWorkspace({...fakeRun(), browser});
    expect(grade.passed).toBe(true);
    // One page per viewport: desktop, then mobile.
    expect(grade.alreadyHandledAborts).toEqual([FONT_URL, FONT_URL]);
  });

  it('fails the grade with every other refusal', async () => {
    const browser = failingFontBrowser(
      n => new Error(`route.abort: Protocol error ${n}`),
    );
    const grade = await gradeWorkspace({...fakeRun(), browser});
    expect(grade.passed).toBe(false);
    expect(grade.failure).toBe('browser');
    expect(grade.abortError).toBe(
      `Error: Playwright could not abort 2 failed font requests: ${FONT_URL}: route.abort: Protocol error 1; ${FONT_URL}: route.abort: Protocol error 2`,
    );
    expect(grade.browserError).toBeUndefined();
  });

  it('keeps only the first line of each refusal, at most 300 characters', async () => {
    const browser = failingFontBrowser(
      () =>
        new Error(
          `route.abort: ${'x'.repeat(400)}\nCall log:\n  - cookie: FAKE-COOKIE=fake-value`,
        ),
    );
    const grade = await gradeWorkspace({...fakeRun(), browser});
    expect(grade.abortError).not.toContain('\n');
    expect(grade.abortError).not.toContain('Call log');
    expect(grade.abortError).not.toContain('FAKE-COOKIE');
    expect(grade.abortError).toContain(
      `${FONT_URL}: route.abort: ${'x'.repeat(300 - 'route.abort: '.length)};`,
    );
  });

  it('records a refusal for an answered route when the page then fails to load', async () => {
    const browser = failingFontBrowser(
      () => new Error('route.abort: Route is already handled!'),
      {
        gotoError: new Error('page.goto: net::ERR_FAILED'),
      },
    );
    const grade = await gradeWorkspace({...fakeRun(), browser});
    expect(grade.failure).toBe('browser');
    expect(grade.browserError).toBe('Error: page.goto: net::ERR_FAILED');
    // The desktop page's goto throws, so the mobile page never opens.
    expect(grade.alreadyHandledAborts).toEqual([FONT_URL]);
    expect(grade.abortError).toBeUndefined();
  });

  it('reports every other refusal when the page then fails to load', async () => {
    const browser = failingFontBrowser(
      n => new Error(`route.abort: Protocol error ${n}`),
      {
        gotoError: new Error('page.goto: net::ERR_FAILED'),
      },
    );
    const grade = await gradeWorkspace({...fakeRun(), browser});
    expect(grade.passed).toBe(false);
    expect(grade.failure).toBe('browser');
    expect(grade.browserError).toBe('Error: page.goto: net::ERR_FAILED');
    expect(grade.abortError).toBe(
      `Error: Playwright could not abort 1 failed font request: ${FONT_URL}: route.abort: Protocol error 1`,
    );
  });
});
