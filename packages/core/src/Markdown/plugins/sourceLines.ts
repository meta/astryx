// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sourceLines.ts
 * @input The parse Markdown already runs
 * @output A first-party plugin that records each block's source lines
 * @position Optional Markdown parse option, owned by module:Markdown/sourceLines
 */

import {createMarkdownSourceLinesEntry} from './protocol';

/**
 * Records the 1-based, inclusive source lines of every block Markdown renders,
 * nested blocks included. Rendered blocks carry them as `data-source-line` and
 * `data-source-line-end`, `components` block renderers receive them as
 * `sourceLines`, and canonical block nodes carry them as `position` lines.
 * The lines come from the parse Markdown already runs; without this plugin
 * no line work happens.
 */
export const markdownSourceLinesPlugin =
  createMarkdownSourceLinesEntry('source-lines');
