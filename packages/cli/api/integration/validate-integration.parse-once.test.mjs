// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One validation parses each of a package's source files once for the
 * template walks: the walk from each template reaches the same helpers, and
 * the tree a helper gave the first walk serves every later one
 * (validate-contributions.mjs `sourceTree`, inside `withListingCache`).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, afterEach, beforeEach, describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('@babel/parser')} */
const parser = require('@babel/parser');
/** @type {typeof import('./validate-integration.mjs')} */
const {validateIntegration} = require('./validate-integration.mjs');

const HELPER = [
  "import {Text} from '@astryxdesign/core';",
  'export function Panel() {',
  '  return <Text>Panel</Text>;',
  '}',
  '',
].join('\n');

/** The options the template walks parse a source file with. */
const WALK_OPTIONS = JSON.stringify({
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
  errorRecovery: true,
});

/** Each parse of the helper's text with the walks' options. */
let helperParses = 0;

// Counts the walks' parses of the helper and passes every call through.
const parse = parser.parse;
parser.parse = (input, options) => {
  if (input === HELPER && JSON.stringify(options) === WALK_OPTIONS) {
    helperParses += 1;
  }
  return parse(input, options);
};
afterAll(() => {
  parser.parse = parse;
});

/** @param {string} name */
const block = name =>
  `export default {type: 'block', name: '${name}', displayName: '${name}', aspectRatio: 1, componentsUsed: ['Panel']};\n`;

/** @param {string} name */
const blockSource = name =>
  [
    "import {Panel} from '../lib/panel';",
    `export default function ${name}() {`,
    '  return <Panel />;',
    '}',
    '',
  ].join('\n');

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-parse-once-'));
  /** @type {Record<string, string>} */
  const files = {
    'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
    'astryx.integration.mjs': "export default {templates: './templates'};\n",
    'lib/panel.tsx': HELPER,
    'templates/account-card.doc.mjs': block('Account card'),
    'templates/account-card.tsx': blockSource('AccountCard'),
    'templates/profile-card.doc.mjs': block('Profile card'),
    'templates/profile-card.tsx': blockSource('ProfileCard'),
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
  helperParses = 0;
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('a helper two templates import, during one validation', () => {
  it('is parsed once for the template walks', async () => {
    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.validated).toBe(true);
    expect(helperParses).toBe(1);
  });

  it('is parsed again by the next validation', async () => {
    await validateIntegration(undefined, {cwd: dir});
    await validateIntegration(undefined, {cwd: dir});
    expect(helperParses).toBe(2);
  });
});
