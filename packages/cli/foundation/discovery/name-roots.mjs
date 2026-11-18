// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where each catalog the lookup commands read keeps the files its names
 * come from, and which folders a walk of them does not enter: Core's `src`,
 * the CLI's page and block templates, its own topics and docs tree, the
 * folders of its own typed docs, and an integration's components, templates
 * and docs folders. Also how a CLI topic file is named, and the root
 * namespace a docs tree file declares, read from its text. Nothing here
 * loads a module, so the lookup commands' not-found hint reads it on every
 * miss.
 *
 * @input the CLI's root, an integration's folders, a tree file's text
 * @output folders, skip rules, the topic file pattern, a root namespace's name
 * @position foundation/discovery: read by docs discovery
 *   (./docs-discovery.mjs), template discovery (./template-ids.mjs), the
 *   CLI's own docs (./cli-self-docs.mjs), the docs tree
 *   (../doc-compiler/tree.mjs), and the not-found hint's name index
 *   (../suggest/name-index.mjs)
 */

import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';

/** Where the CLI's own topics live; its docs tree is the `tree` folder. */
export const BUILTIN_DOCS_DIR = path.join(CLI_ROOT, 'assets', 'docs');

/**
 * A built-in topic file: `{topic}.doc.mjs`. Anchored at both ends so a
 * localization overlay (`{topic}.doc.zh.mjs`) is not read as a topic of its
 * own — it is loaded by the topic it overlays. A docs tree file is named the
 * same way, after its doc.
 */
export const BUILTIN_TOPIC_FILE_RE = /^([\w-]+)\.doc\.mjs$/;

/**
 * The name of the root namespace a docs tree file declares, read from its
 * text without loading it, or null: a namespace doc without `placement`.
 *
 * @param {string} text the file's text
 * @returns {string | null}
 */
export function rootNamespaceName(text) {
  if (!/["']?type["']?\s*:\s*["']namespace["']/u.test(text)) return null;
  if (/["']?placement["']?\s*:/u.test(text)) return null;
  return /["']?name["']?\s*:\s*["']([\w-]+)["']/u.exec(text)?.[1] ?? null;
}

const TEMPLATES_DIR = path.join(CLI_ROOT, 'assets', 'templates');

/** Core's page templates: one folder each. */
export const PAGES_DIR = path.join(TEMPLATES_DIR, 'pages');

/** Core's block templates: a doc and its same-stem source each. */
export const BLOCKS_DIR = path.join(TEMPLATES_DIR, 'blocks');

/**
 * The integrations' templates folders, in order: those set to a folder.
 * @param {Array<{templates?: string}>} integrations
 * @returns {string[]}
 */
export function templateRoots(integrations) {
  return integrations.flatMap(integration =>
    typeof integration?.templates === 'string' && integration.templates !== ''
      ? [integration.templates]
      : [],
  );
}

/** The directories, relative to the CLI root, that hold the CLI's own docs. */
export const CLI_SELF_DOC_DIRS = [
  'clients/cli/commands',
  'api',
  'authoring',
  'foundation',
];

/**
 * The folder names a walk of the CLI's own doc directories does not enter:
 * dependencies, fixtures and tests (`__…`), and hidden folders.
 * @param {string} name
 * @returns {boolean}
 */
export const skipCliSelfDocFolder = name =>
  name === 'node_modules' || name.startsWith('__') || name.startsWith('.');

/**
 * The folder names a walk of Core's `src` does not enter.
 * @param {string} name
 * @returns {boolean}
 */
export const skipCoreFolder = name => name === 'node_modules';

/**
 * The folder names a walk of an integration's components folder does not
 * enter: integration discovery reads no doc in them.
 * @param {string} name
 * @returns {boolean}
 */
export const skipComponentsFolder = name =>
  name === 'node_modules' || name === '__tests__';

/**
 * The folder names a walk of an integration's docs folder does not enter.
 * @param {string} name
 * @returns {boolean}
 */
export const skipDocsFolder = name => name === 'node_modules';
