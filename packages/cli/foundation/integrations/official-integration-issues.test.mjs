// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The repository's own integration packages, installed as an app
 * installs them, report no integration issue. A package with an issue makes
 * every `component`, `template`, `search`, `discover` and `theme` call print
 * a warning line.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {requireNatively} from '../../test-utils/native-require.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../config/project.mjs')} */
const {Project} = require('../config/project.mjs');

const SLOW = 60_000;

/** @type {string | undefined} */
let consumer;

afterEach(() => {
  if (consumer) fs.rmSync(consumer, {recursive: true, force: true});
  consumer = undefined;
});

/**
 * An app with only `name` installed from the repository and configured.
 * @param {string} name the package folder under packages/
 */
function appWith(name) {
  consumer = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-official-issues-'));
  const scope = path.join(consumer, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', name),
    path.join(scope, name),
    'dir',
  );
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  fs.writeFileSync(
    path.join(consumer, 'astryx.config.mjs'),
    `export default {integrations: ['@astryxdesign/${name}']};\n`,
  );
  return consumer;
}

describe('the official integration packages', () => {
  it.each(['lab', 'charts', 'richtext', 'vega'])(
    '%s reports no integration issue',
    async name => {
      const project = await Project.load(appWith(name), {fresh: true});
      expect(
        (await project.components()).some(
          component => component.package === `@astryxdesign/${name}`,
        ),
      ).toBe(true);
      const issues = (await project.issues()).map(issue => ({
        code: issue.code,
        message: issue.message,
      }));
      expect(issues).toEqual([]);
    },
    SLOW,
  );
});
