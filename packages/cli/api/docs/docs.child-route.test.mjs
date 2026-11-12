// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs child named without its namespace (spec:AST-046 FR5). A
 * namespace whose children repeat its name makes its own routes stutter:
 * `tokens` holds `tokens-color`, so the route is `tokens/tokens-color`, while
 * the namespace listing shows the bare `tokens-color`. A reader who types what
 * the listing shows, or the route without the repeated prefix, names the one
 * child either way, so that child answers. Two children answering one name is
 * ambiguous, and the read still fails with its suggestions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/**
 * A project with two integrations, each a namespace holding a child named
 * `setup`, so one name has two owners.
 */
function scaffoldTwoOwners() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/alpha', '@acme/beta']};\n",
  );
  for (const kit of ['alpha', 'beta']) {
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', kit);
    fs.mkdirSync(path.join(pkgDir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: `@acme/${kit}`, version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'docs', `${kit}.doc.mjs`),
      `export const docs = ${JSON.stringify(
        {
          type: 'namespace',
          name: kit,
          title: kit,
          summary: `Everything about ${kit}.`,
          slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
        },
        null,
        2,
      )};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'docs', 'setup.doc.mjs'),
      `export const docs = ${JSON.stringify(
        {
          type: 'generic',
          name: 'setup',
          title: `${kit} setup`,
          description: `How to set up ${kit}.`,
          placement: {parent: `namespace:${kit}`, slot: 'guides', order: 1},
          sections: [
            {title: 'Steps', content: [{type: 'prose', text: 'Steps.'}]},
          ],
        },
        null,
        2,
      )};\n`,
    );
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-child-route-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('a docs child named without its namespace', () => {
  it(
    'opens the child a reader names by the name the listing shows',
    async () => {
      const canonical = await docs('tokens/tokens-color');
      expect(await docs('tokens-color')).toEqual(canonical);
      expect(canonical.data.name).toBe('tokens/tokens-color');
    },
    SLOW,
  );

  it(
    'opens the child whose route leaves out the prefix its name repeats',
    async () => {
      expect(await docs('tokens/color')).toEqual(
        await docs('tokens/tokens-color'),
      );
      expect(await docs('tokens/usage')).toEqual(
        await docs('tokens/tokens-usage'),
      );
    },
    SLOW,
  );

  it(
    'opens a child of a namespace that does not stutter',
    async () => {
      expect(await docs('headers-and-footers')).toEqual(
        await docs('layout/headers-and-footers'),
      );
    },
    SLOW,
  );

  it(
    'leaves every name that already worked alone',
    async () => {
      expect((await docs('tokens')).data.route).toBe('tokens');
      expect((await docs('layout/side-panels')).data.name).toBe(
        'layout/side-panels',
      );
    },
    SLOW,
  );

  it(
    'never opens an experimental doc by a bare name',
    async () => {
      // `add`, `calendar` and `render` name experimental docs the project
      // reaches only by a marked route (spec:AST-017 FR27).
      for (const name of ['add', 'calendar', 'render']) {
        await expect(docs(name)).rejects.toMatchObject({
          code: 'ERR_UNKNOWN_TOPIC',
        });
      }
    },
    SLOW,
  );

  it(
    'still refuses a name no child holds',
    async () => {
      await expect(docs('Button')).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_TOPIC',
      });
      await expect(docs('tokens/nope')).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_TOPIC',
      });
    },
    SLOW,
  );

  it(
    'still refuses a name two children hold, and names them both',
    async () => {
      scaffoldTwoOwners();
      const error = await docs('setup', undefined, {cwd: tmpDir}).catch(
        caught => caught,
      );
      expect(error).toMatchObject({code: 'ERR_UNKNOWN_TOPIC'});
      const suggested = (error.suggestions ?? []).map(
        (/** @type {{name: string}} */ one) => one.name,
      );
      expect(suggested).toContain('alpha/setup');
      expect(suggested).toContain('beta/setup');
    },
    SLOW,
  );
});
