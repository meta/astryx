// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

/**
 * @file Readiness gate for one Storybook accessibility scan.
 * @input Repeated snapshots of the page's URL and load state, the Storybook
 *   shell's classes, the selected story's render phase, and the root content.
 * @output Resolves once the intended story has rendered content; rejects on an
 *   outcome the page or Storybook reports: a redirect, a Storybook error
 *   display, a page that finished loading without starting the preview, or a
 *   story render that ended with an empty root; and rejects, by name, a story
 *   that reaches none of these within the backstop.
 * @position Pure policy used by accessibility-audit.js and unit tests.
 *
 * Loading and rendering a story is CPU-bound, so on a loaded machine a tight
 * budget failed stories that were still rendering and would have rendered
 * moments later. The gate decides on the outcomes above instead, which every
 * story reaches once Storybook has run it. Its one clock is a backstop for a
 * story that never reaches one, such as a loader or play function that never
 * settles: 60 s, far above the slowest story measured on a loaded machine, so
 * it names that story instead of leaving the job's timeout to end the whole
 * shard with none named.
 */

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Render phases after which Storybook does no more work on the story.
const ENDED_PHASES = new Set(['finished', 'errored', 'aborted']);

async function waitForStoryReadiness(
  readState,
  {
    storyId = null,
    backstopMs = 60000,
    pollMs = 50,
    now = Date.now,
    sleep = defaultSleep,
  } = {},
) {
  const backstop = now() + backstopMs;
  while (true) {
    const state = await readState();
    if (!state.urlMatches) {
      throw new Error(`story navigation ended at ${state.url}`);
    }
    if (state.errorVisible) {
      throw new Error('Storybook reported a story render error');
    }
    if (state.mainVisible && state.hasContent) {
      return;
    }
    if (ENDED_PHASES.has(state.renderPhase)) {
      throw new Error(
        `Storybook ended the story render (${state.renderPhase}) with no content in its root`,
      );
    }
    if (state.pageLoaded && !state.previewStarted) {
      throw new Error(
        'the story page finished loading without starting the Storybook preview',
      );
    }
    if (now() >= backstop) {
      const subject = storyId == null ? 'the story' : `story ${storyId}`;
      throw new Error(
        `${subject} never rendered within ${backstopMs / 1000} s`,
      );
    }
    await sleep(pollMs);
  }
}

module.exports = {waitForStoryReadiness};
