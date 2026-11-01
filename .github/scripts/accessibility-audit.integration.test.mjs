// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CLI-level accessibility audit readiness fixtures.
 * Runs the real command, routing, server lifecycle, and report path with only
 * the browser transport replaced by a deterministic page implementation.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, '../..');
const SCRIPT = path.join(SCRIPTS_DIR, 'accessibility-audit.js');

const BROWSER_MOCK = String.raw`
const Module = require('node:module');
const originalLoad = Module._load;
let requestedUrl = '';
let reads = 0;
let selectorResolved = false;
// The layout-settle step waits two frames before sampling geometry.
global.requestAnimationFrame = callback => setTimeout(callback, 0);

// Storybook's own state as the audit reads it: whether the preview started,
// the selected story's render phase, and the document's load state.
function scenarioState() {
  const scenario = process.env.A11Y_TEST_SCENARIO;
  reads += 1;
  const started = {preview: true, phase: 'rendering', loaded: false};
  if (scenario === 'redirect') {
    return {url: 'chrome-error://chromewebdata/', classes: [], content: false, ...started};
  }
  if (scenario === 'error') {
    return {url: requestedUrl, classes: ['sb-show-errordisplay'], content: false, ...started};
  }
  if (scenario === 'empty') {
    return {url: requestedUrl, classes: ['sb-show-main'], content: false, ...started, phase: 'finished'};
  }
  if (scenario === 'no-preview') {
    return {url: requestedUrl, classes: [], content: false, preview: false, phase: null, loaded: true};
  }
  return {
    url: requestedUrl,
    classes: ['sb-show-main'],
    content: reads >= 3,
    ...started,
  };
}

function evaluateInFixture(fn, arg) {
  const state = scenarioState();
  const previousWindow = global.window;
  const previousDocument = global.document;
  const storyId = new URL(state.url).searchParams.get('id');
  global.window = {
    location: {href: state.url},
    __STORYBOOK_PREVIEW__: state.preview
      ? {
          selectionStore: {selection: {storyId}},
          currentRender: {phase: state.phase},
        }
      : undefined,
  };
  global.document = {
    readyState: state.loaded ? 'complete' : 'interactive',
    body: {classList: {contains: name => state.classes.includes(name)}},
    querySelector: selector =>
      selector === '#storybook-root'
        ? {childElementCount: state.content ? 1 : 0, textContent: ''}
        : null,
    querySelectorAll: () => [],
  };
  try {
    return fn(arg);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
}

const page = {
  // A real request, so a run only passes when the audit opens the port its
  // server actually holds.
  goto: async url => {
    requestedUrl = url;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('fixture server answered ' + response.status + ' for ' + url);
    }
  },
  addStyleTag: async () => {},
  waitForSelector: async (selector, options) => {
    if (process.env.A11Y_TEST_SCENARIO === 'selector-missing') {
      throw new Error('selector did not become visible: ' + selector);
    }
    if (options?.state !== 'visible') {
      throw new Error('readiness selector must wait for visible state');
    }
    selectorResolved = true;
    return {};
  },
  evaluate: async (fn, arg) => evaluateInFixture(fn, arg),
  waitForTimeout: async () => {},
  close: async () => {},
};
const context = {
  addInitScript: async () => {},
  newPage: async () => page,
  close: async () => {},
};
const browser = {newContext: async () => context, close: async () => {}};

class FakeAxeBuilder {
  disableRules() { return this; }
  async analyze() {
    if (process.argv.includes('--ready-selector') && !selectorResolved) {
      throw new Error('axe ran before the readiness selector resolved');
    }
    return {violations: []};
  }
}

Module._load = function(request, parent, isMain) {
  if (request === 'playwright') {
    return {chromium: {launch: async () => browser}};
  }
  if (request === '@axe-core/playwright') {
    return {AxeBuilder: FakeAxeBuilder};
  }
  return originalLoad.call(this, request, parent, isMain);
};
`;

function runFixture(
  scenario,
  indexContent,
  components = 'core/Button',
  readySelector = null,
  stories = null,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-cli-fixture-'));
  const storybook = path.join(dir, 'storybook');
  const output = path.join(dir, 'report.json');
  const mock = path.join(dir, 'browser-mock.cjs');
  fs.mkdirSync(storybook, {recursive: true});
  fs.writeFileSync(path.join(storybook, 'index.json'), indexContent);
  fs.writeFileSync(path.join(storybook, 'iframe.html'), '<!doctype html>');
  fs.writeFileSync(mock, BROWSER_MOCK);
  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--storybook-dir',
        storybook,
        '--output',
        output,
        '--components',
        components,
        // Any fixed port may already be held by another process's socket, so
        // let the OS assign a free one.
        '--port',
        '0',
        ...(readySelector == null
          ? []
          : ['--ready-selector', readySelector]),
        ...(stories == null ? [] : ['--stories', stories]),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          A11Y_TEST_SCENARIO: scenario,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${mock}`.trim(),
        },
      },
    );
    return {
      ...result,
      report: fs.existsSync(output)
        ? JSON.parse(fs.readFileSync(output, 'utf8'))
        : null,
    };
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const VALID_INDEX = JSON.stringify({
  entries: {
    'core-button--fixture': {
      id: 'core-button--fixture',
      title: 'Core/Button',
      name: 'Fixture',
      type: 'story',
    },
  },
});

const FOCUSED_INDEX = JSON.stringify({
  entries: {
    'core-button--fixture': {
      id: 'core-button--fixture',
      title: 'Core/Button',
      name: 'Fixture',
      type: 'story',
    },
    'core-button--other': {
      id: 'core-button--other',
      title: 'Core/Button',
      name: 'Other',
      type: 'story',
    },
  },
});

const PATTERN_INDEX = JSON.stringify({
  entries: {
    'a11y-button-pattern--clickable-card-disabled': {
      id: 'a11y-button-pattern--clickable-card-disabled',
      title: 'a11y/Button pattern',
      name: 'Clickable Card Disabled',
      type: 'story',
    },
  },
});

describe.sequential('accessibility-audit CLI readiness', () => {
  it('serves the stories on a port the OS assigns', () => {
    const result = runFixture('delayed', VALID_INDEX);
    expect(result.status).toBe(0);
    const served = /Storybook server running on http:\/\/localhost:(\d+)/.exec(
      result.stdout,
    );
    expect(Number(served?.[1])).toBeGreaterThan(0);
    expect(result.report.auditedStoryKeys).toHaveLength(1);
  });

  it('waits through a delayed valid Storybook root and writes audited evidence', () => {
    const result = runFixture('delayed', VALID_INDEX);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('✓ Audited: Button / Fixture');
    expect(result.report.auditedStoryKeys).toHaveLength(1);
  });

  it('waits for a focused readiness selector and records it in the report', () => {
    const result = runFixture(
      'delayed',
      VALID_INDEX,
      'core/Button',
      '[role="menu"]',
    );
    expect(result.status).toBe(0);
    expect(result.report.readySelector).toBe('[role="menu"]');
  });

  it('audits only the requested owned story', () => {
    const result = runFixture(
      'delayed',
      FOCUSED_INDEX,
      'core/Button',
      null,
      'core-button--fixture',
    );
    expect(result.status).toBe(0);
    expect(result.report.requestedStories).toEqual(['core-button--fixture']);
    expect(result.report.auditedStories.map(story => story.storyId)).toEqual([
      'core-button--fixture',
    ]);
  });

  it('fails closed when a requested story is not owned by the component', () => {
    const result = runFixture(
      'delayed',
      FOCUSED_INDEX,
      'core/Button',
      null,
      'core-link--missing',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Requested stories did not resolve in the selected component scope: core-link--missing',
    );
    expect(result.report).toBeNull();
  });

  it('fails closed when a focused readiness selector stays absent', () => {
    const result = runFixture(
      'selector-missing',
      VALID_INDEX,
      'core/Button',
      '[role="menu"]',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'selector did not become visible: [role="menu"]',
    );
    expect(result.report).toBeNull();
  });

  it('routes a11y contract fixtures to canonical owners and legacy aliases', () => {
    const result = runFixture(
      'delayed',
      PATTERN_INDEX,
      'core/ClickableCard',
    );
    expect(result.status).toBe(0);
    expect(result.report.ownerStoryRoutes).toEqual({
      'core/ClickableCard': [
        'a11y-button-pattern--clickable-card-disabled',
      ],
    });
    expect(result.report.legacyBaselineAliases).toEqual({
      'ClickableCard::Disabled': [
        'core/ClickableCard::a11y-button-pattern--clickable-card-disabled',
      ],
    });
  });

  it('fails a redirect without writing a report', () => {
    const result = runFixture('redirect', VALID_INDEX);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'story navigation ended at chrome-error://chromewebdata/',
    );
    expect(result.report).toBeNull();
  });

  it('fails a Storybook render-error state without writing a report', () => {
    const result = runFixture('error', VALID_INDEX);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Storybook reported a story render error');
    expect(result.report).toBeNull();
  });

  it('fails a story render Storybook ended with an empty root, without writing a report', () => {
    const result = runFixture('empty', VALID_INDEX);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Storybook ended the story render (finished) with no content in its root',
    );
    expect(result.report).toBeNull();
  });

  it('fails a page that loaded without starting the Storybook preview, without writing a report', () => {
    const result = runFixture('no-preview', VALID_INDEX);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'the story page finished loading without starting the Storybook preview',
    );
    expect(result.report).toBeNull();
  });

  it('fails an invalid index before browser readiness or routing', () => {
    const result = runFixture('delayed', '{invalid json');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Could not read Storybook index');
    expect(result.stderr).not.toContain('No owned Storybook stories resolved');
    expect(result.report).toBeNull();
  });
});
