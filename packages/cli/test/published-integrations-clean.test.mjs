// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration packages this repository publishes stay free of
 * integration issues. Every app that installs one runs the integration check
 * on it, and each everyday command prints a warning line while the check
 * reports an issue, so one issue here is a warning on every run in every app.
 * @input packages/<name> folders with an astryx.integration.mjs whose
 * package.json is not private
 * @output fails with each package's issue messages
 * @position packages/cli/test
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {validateIntegration} from '../api/index.mjs';

const packagesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const published = fs
  .readdirSync(packagesDir, {withFileTypes: true})
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(packagesDir, entry.name))
  .filter(dir => fs.existsSync(path.join(dir, 'astryx.integration.mjs')))
  .filter(dir => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return manifest.private !== true;
  });

describe('published integration packages', () => {
  it('include the rich text package', () => {
    expect(published.map(dir => path.basename(dir))).toContain('richtext');
  });

  it.each(published.map(dir => [path.basename(dir), dir]))(
    '%s reports no integration issues, so apps that install it see no warning',
    async (_name, dir) => {
      const result = await validateIntegration(undefined, {cwd: dir});
      expect(result.data.validated).toBe(true);
      expect(result.data.issues.map(issue => issue.message)).toEqual([]);
    },
    60_000,
  );
});
