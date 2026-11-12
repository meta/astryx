// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file may-have-integrations.test.mjs
 * @input Temporary projects with and without a config, a manifest of their
 *   own, or a dependency that ships one, and a folder outside any project
 * @output mayHaveIntegrations is false only when no integration can load
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {mayHaveIntegrations} from './may-have-integrations.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-may-have-'));
  // A project, by the release choice's reading: it declares Core.
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'app',
      dependencies: {'@astryxdesign/core': '1.0.0', '@acme/widgets': '1.0.0'},
    }),
  );
  for (const name of ['@astryxdesign/core', '@acme/widgets']) {
    const pkg = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({name}));
  }
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('mayHaveIntegrations', () => {
  it('is false for a project with no config, manifest or integration dependency', () => {
    expect(mayHaveIntegrations(dir)).toBe(false);
    fs.mkdirSync(path.join(dir, 'src'));
    expect(mayHaveIntegrations(path.join(dir, 'src'))).toBe(false);
  });

  it('is true with an Astryx config', () => {
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      'export default {};\n',
    );
    expect(mayHaveIntegrations(dir)).toBe(true);
  });

  it('is true for a project that is an integration itself', () => {
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.ts'),
      'export default {};\n',
    );
    expect(mayHaveIntegrations(dir)).toBe(true);
  });

  it('is true when an installed dependency ships a manifest', () => {
    fs.writeFileSync(
      path.join(
        dir,
        'node_modules',
        '@acme',
        'widgets',
        'astryx.integration.mjs',
      ),
      'export default {};\n',
    );
    expect(mayHaveIntegrations(dir)).toBe(true);
  });

  it('is true outside a project, where the integrations beside the CLI load', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-outside-'));
    try {
      expect(mayHaveIntegrations(outside)).toBe(true);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});
