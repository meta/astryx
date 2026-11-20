// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-changed-stories.js
 * @input The Storybook index's story entries, the pull request's changed file
 *   paths, and the story ids the touched components' audit already runs.
 * @output The ids of the changed story files' stories that no other audit in
 *   the pull request covers.
 * @position Selects the stories the touched-components check audits on their
 *   own (spec:AST-030 FR12): a changed story is audited whoever owns it, and a
 *   touched component's audit already runs its own stories.
 */

const path = require('node:path');

/** Story index import paths are relative to the Storybook app. */
const STORYBOOK_DIR = 'apps/storybook';

/** The repository path of a story entry's file. */
function storyFilePath(importPath) {
  return path.posix.normalize(path.posix.join(STORYBOOK_DIR, importPath));
}

/**
 * The stories of the changed story files that the touched components' audit
 * does not run: a story an untouched component owns, or one no component owns.
 *
 * @param {Record<string, {type?: string, importPath?: string}>} stories
 * @param {string[]} changedFiles
 * @param {Iterable<string>} coveredIds story ids another audit already runs
 * @returns {string[]}
 */
function changedUncoveredStoryIds(stories, changedFiles, coveredIds = []) {
  const changed = new Set(
    changedFiles.map(file => file.trim()).filter(Boolean),
  );
  const covered = new Set(coveredIds);
  return Object.entries(stories)
    .filter(
      ([id, story]) =>
        story?.type === 'story' &&
        !id.endsWith('--docs') &&
        typeof story.importPath === 'string' &&
        changed.has(storyFilePath(story.importPath)) &&
        !covered.has(id),
    )
    .map(([id]) => id)
    .sort();
}

module.exports = {changedUncoveredStoryIds, storyFilePath};
