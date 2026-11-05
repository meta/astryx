// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template discovery isolates each configured integration.
 *
 * An integration whose templates root cannot be read (here, the manifest points
 * `templates` at a file) is that package's discovery error. Core templates and
 * every other integration's templates are still discovered.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {discoverAll, discoverAllWithErrors} from './template-adapter.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

let tmpDir = '';

/**
 * @param {string} name
 * @param {Record<string, string>} files
 */
function installPackage(name, files) {
  const dir = path.join(tmpDir, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version: '1.0.0'}),
  );
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), contents);
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-isolation-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {integrations: ['@acme/file-root', '@acme/good']};\n`,
  );
  installPackage('@acme/file-root', {
    'astryx.integration.mjs': `export default {templates: './templates.mjs'};\n`,
    'templates.mjs': 'export default {};\n',
  });
  installPackage('@acme/good', {
    'astryx.integration.mjs': `export default {templates: './templates'};\n`,
    'templates/good-hero.template.mjs': `export default {type: 'block', name: 'Good hero', description: 'A hero.'};\n`,
    'templates/good-hero.tsx': 'export default function GoodHero() { return null; }\n',
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('template discovery with an unreadable templates root', () => {
  it('keeps core and the other integrations', async () => {
    const templates = await discoverAll(tmpDir);

    expect(templates).toContainEqual(
      expect.objectContaining({dirName: 'good-hero', package: '@acme/good'}),
    );
    expect(templates.some(template => template.package == null)).toBe(true);
    expect(templates.some(t => t.package === '@acme/file-root')).toBe(false);
  });

  it('reports the unreadable root as that package’s error', async () => {
    const {errors} = await discoverAllWithErrors(tmpDir);

    expect(errors).toContainEqual(
      expect.objectContaining({
        package: '@acme/file-root',
        message: expect.stringContaining('templates.mjs'),
      }),
    );
  });

  it('keeps astryx template --list working', async () => {
    const {status, stdout} = await runCli(['template', '--list', '--json'], {
      cwd: tmpDir,
    });

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data).toContainEqual(
      expect.objectContaining({id: 'good-hero'}),
    );
  });
});
