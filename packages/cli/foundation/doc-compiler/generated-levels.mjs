// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The levels the docs tree generates: the level each doc kind is grouped
 * in, and the levels that hold the flat topics.
 *
 * @input a doc kind, or a flat topic's category
 * @output the levels, and the level a topic sits in
 * @position foundation/doc-compiler: read by the tree (./tree.mjs), which
 *   re-exports them, and by the lookup commands' not-found hint
 *   (../suggest/other-command.mjs), which reads the levels' route segments
 *   without the tree's modules
 */

/**
 * The generated level that `groupBy: 'kind'` makes for each kind: its route
 * segment, title, and summary.
 * @type {Readonly<Record<string, {segment: string, title: string, summary: string}>>}
 */
export const KIND_GROUPS = Object.freeze({
  command: {
    segment: 'commands',
    title: 'Commands',
    summary: 'Every command and subcommand.',
  },
  function: {
    segment: 'functions',
    title: 'Functions',
    summary: 'Every function: its signature, parameters, returns, and errors.',
  },
  schema: {
    segment: 'schemas',
    title: 'Schemas',
    summary: 'Data shapes, field by field.',
  },
  enum: {
    segment: 'enums',
    title: 'Enums',
    summary:
      'Every fixed list of values, such as error codes and response types.',
  },
  generic: {segment: 'guides', title: 'Guides', summary: 'Every guide.'},
});

/**
 * The generated levels that hold the flat topics, by category
 * (spec:AST-046 FR12). A topic keeps its own name as its route; its level is
 * only where it sits. Readers see these titles in a topic's path, so each is
 * a plain name for what the topics are.
 */
export const TOPIC_LEVELS = Object.freeze({
  guides: Object.freeze({
    route: 'guides',
    title: 'Guides',
    summary:
      'Guides that stand on their own: getting started, principles, theming, and working with AI. Each topic keeps its own name; open one by it.',
  }),
  foundations: Object.freeze({
    route: 'foundations',
    title: 'Foundations',
    summary:
      'Color, elevation, icons, illustrations, motion, shape, and spacing: the visual foundations every component builds on. Each topic keeps its own name; open one by it.',
  }),
});

/**
 * The generated level a flat topic sits in.
 * @param {string | null | undefined} category
 * @returns {'guides' | 'foundations'}
 */
export const topicLevel = category =>
  category === 'foundations' ? 'foundations' : 'guides';
