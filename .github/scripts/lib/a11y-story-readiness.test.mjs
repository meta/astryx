// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {waitForStoryReadiness} = require('./a11y-story-readiness.js');

function sequencedReader(states) {
  let index = 0;
  return async () => states[Math.min(index++, states.length - 1)];
}

const waiting = {
  url: 'http://localhost:6007/iframe.html?id=core-button--default',
  urlMatches: true,
  errorVisible: false,
  mainVisible: true,
  hasContent: false,
  pageLoaded: false,
  previewStarted: true,
  renderPhase: 'rendering',
};

const ready = {...waiting, hasContent: true};

describe('waitForStoryReadiness', () => {
  it('waits for delayed story content instead of sampling the root once', async () => {
    const readState = sequencedReader([waiting, waiting, ready]);
    await expect(
      waitForStoryReadiness(readState, {pollMs: 0, sleep: async () => {}}),
    ).resolves.toBeUndefined();
  });

  it('keeps waiting while Storybook is still rendering, as long as a loaded machine takes', async () => {
    // Thirty seconds of rendering, one second per read: the story is still in
    // progress, so it is not failed for being slow.
    let time = 0;
    const states = [...Array.from({length: 30}, () => waiting), ready];
    await expect(
      waitForStoryReadiness(sequencedReader(states), {
        pollMs: 1000,
        now: () => time,
        sleep: async ms => {
          time += ms;
        },
      }),
    ).resolves.toBeUndefined();
    expect(time).toBe(30000);
  });

  it('fails a story that never renders at the 60 s backstop, naming it', async () => {
    let time = 0;
    await expect(
      waitForStoryReadiness(async () => waiting, {
        storyId: 'core-button--default',
        pollMs: 1000,
        now: () => time,
        sleep: async ms => {
          time += ms;
        },
      }),
    ).rejects.toThrow('story core-button--default never rendered within 60 s');
    expect(time).toBe(60000);
  });

  it('lets an outcome Storybook reports win over the backstop', async () => {
    let time = 0;
    const ended = {...waiting, renderPhase: 'finished'};
    const states = [...Array.from({length: 20}, () => waiting), ended];
    await expect(
      waitForStoryReadiness(sequencedReader(states), {
        storyId: 'core-button--default',
        pollMs: 1000,
        now: () => time,
        sleep: async ms => {
          time += ms;
        },
      }),
    ).rejects.toThrow(
      'Storybook ended the story render (finished) with no content in its root',
    );
    expect(time).toBe(20000);
  });

  it('rejects a redirect away from the selected Storybook iframe', async () => {
    await expect(
      waitForStoryReadiness(
        async () => ({
          ...waiting,
          url: 'chrome-error://chromewebdata/',
          urlMatches: false,
        }),
      ),
    ).rejects.toThrow('story navigation ended at chrome-error://chromewebdata/');
  });

  it('rejects Storybook render errors before baseline reconciliation', async () => {
    await expect(
      waitForStoryReadiness(async () => ({...waiting, errorVisible: true})),
    ).rejects.toThrow('Storybook reported a story render error');
  });

  it('rejects a render Storybook ended with an empty root, at once', async () => {
    let reads = 0;
    await expect(
      waitForStoryReadiness(
        async () => {
          reads += 1;
          return {...waiting, renderPhase: 'finished'};
        },
        {pollMs: 0, sleep: async () => {}},
      ),
    ).rejects.toThrow(
      'Storybook ended the story render (finished) with no content in its root',
    );
    expect(reads).toBe(1);
  });

  it('rejects a page that finished loading without starting the Storybook preview', async () => {
    await expect(
      waitForStoryReadiness(
        async () => ({
          ...waiting,
          mainVisible: false,
          pageLoaded: true,
          previewStarted: false,
          renderPhase: null,
        }),
        {pollMs: 0, sleep: async () => {}},
      ),
    ).rejects.toThrow(
      'the story page finished loading without starting the Storybook preview',
    );
  });

  it('keeps waiting for a preview that has not started while the page still loads', async () => {
    const booting = {
      ...waiting,
      mainVisible: false,
      previewStarted: false,
      renderPhase: null,
    };
    await expect(
      waitForStoryReadiness(sequencedReader([booting, booting, ready]), {
        pollMs: 0,
        sleep: async () => {},
      }),
    ).resolves.toBeUndefined();
  });
});
