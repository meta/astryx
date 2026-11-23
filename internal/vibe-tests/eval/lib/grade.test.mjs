// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {gradeWorkspace, isAllowedRequest} from './grade.mjs';

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
function countingBrowser({failGoto = false} = {}) {
  const counts = {open: 0, maxOpen: 0};
  const page = {
    on() {},
    async goto() {
      await wait(20);
      if (failGoto) throw new Error('page.goto: Timeout 5000ms exceeded.');
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

  it('grades the next run after a run whose browser step fails', async () => {
    const failing = countingBrowser({failGoto: true});
    const passing = countingBrowser();
    const [failed, passed] = await Promise.all([
      gradeWorkspace({...fakeRun(), browser: failing.browser}),
      gradeWorkspace({...fakeRun(), browser: passing.browser}),
    ]);
    expect(failed.failure).toBe('browser');
    expect(passed.passed).toBe(true);
  });
});
