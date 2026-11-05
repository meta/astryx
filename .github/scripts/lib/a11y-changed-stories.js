// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-changed-stories.js
 * @input The Storybook index's story entries, the story routes the audit
 *   builds (story id and owner), and the pull request's changed file paths.
 * @output The ids of the changed story files' stories that no component owns.
 * @position Selects the stories the touched-components check audits on their
 *   own (spec:AST-030 FR12): a touched component's audit never reaches a story
 *   whose owner is no component.
 */

const path = require('node:path');

/** Story index import paths are relative to the Storybook app. */
const STORYBOOK_DIR = 'apps/storybook';

/** The repository path of a story entry's file. */
function storyFilePath(importPath) {
  return path.posix.normalize(path.posix.join(STORYBOOK_DIR, importPath));
}

/**
 * The stories of the changed story files whose owner is no component. A story
 * with no route counts as unowned, so it is audited rather than dropped.
 *
 * @param {Record<string, {type?: string, importPath?: string}>} stories
 * @param {Array<{id: string, component: string}>} routes
 * @param {string[]} changedFiles
 * @returns {string[]}
 */
function changedUnownedStoryIds(stories, routes, changedFiles) {
  const changed = new Set(
    changedFiles.map(file => file.trim()).filter(Boolean),
  );
  const owners = new Map(routes.map(route => [route.id, route.component]));
  return Object.entries(stories)
    .filter(
      ([id, story]) =>
        story?.type === 'story' &&
        !id.endsWith('--docs') &&
        typeof story.importPath === 'string' &&
        changed.has(storyFilePath(story.importPath)) &&
        String(owners.get(id) ?? 'unknown/').startsWith('unknown/'),
    )
    .map(([id]) => id)
    .sort();
}

module.exports = {changedUnownedStoryIds, storyFilePath};
