// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` says what an installed integration is: the
 * description in its package.json, as it does for a package a source lists.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/** @param {Record<string, unknown>} pkg the integration's package.json */
function writeProject(pkg) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/guides']};\n",
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'guides');
  fs.mkdirSync(path.join(packageDir, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  fs.writeFileSync(
    path.join(packageDir, 'docs', 'acme-guide.doc.mjs'),
    `export const docs = ${JSON.stringify({
      type: 'generic',
      name: 'acme-guide',
      title: 'Acme guide',
      description: 'How Acme uses Astryx.',
      sections: [
        {title: 'Start', content: [{type: 'prose', text: 'Start here.'}]},
      ],
    })};\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-desc-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('astryx discover: an installed integration says what it is', () => {
  it(
    'lists the package.json description in JSON and text',
    async () => {
      writeProject({
        name: '@acme/guides',
        version: '1.0.0',
        description: 'Acme guides for building with Astryx.',
      });

      const json = await runCli(['--json', 'discover', '--installed'], {
        cwd: tmpDir,
      });
      expect(json.status, json.stderr).toBe(0);
      const entry = JSON.parse(json.stdout).data.find(
        (/** @type {{name: string}} */ each) => each.name === '@acme/guides',
      );
      expect(entry.description).toBe('Acme guides for building with Astryx.');

      const text = await runCli(['discover', '--installed'], {cwd: tmpDir});
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).toMatch(
        /description:\s+Acme guides for building with Astryx\./,
      );
    },
    SLOW,
  );

  it(
    'prints the first sentence in text and the whole description in JSON',
    async () => {
      writeProject({
        name: '@acme/guides',
        version: '1.0.0',
        description:
          'Acme guides for building with Astryx. They cover setup and themes.',
      });

      const json = await runCli(['--json', 'discover', '@acme/guides'], {
        cwd: tmpDir,
      });
      expect(json.status, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).data.description).toBe(
        'Acme guides for building with Astryx. They cover setup and themes.',
      );

      for (const argv of [
        ['discover', '--installed'],
        ['discover', '@acme/guides'],
      ]) {
        const text = await runCli(argv, {cwd: tmpDir});
        expect(text.status, text.stderr).toBe(0);
        expect(text.stdout).toMatch(
          /^description:\s+Acme guides for building with Astryx\.$/m,
        );
        expect(text.stdout).not.toContain('They cover setup');
      }
    },
    SLOW,
  );

  it(
    'removes terminal escape codes, control and bidirectional characters from the package text',
    async () => {
      writeProject({
        name: '@acme/guides',
        version: '1.0.0',
        description:
          '\u001b[31mAcme\u001b[0m guides\u0007 for\tbuilding.\u202e\u200b\u001b]0;title\u0007',
      });

      const json = await runCli(['--json', 'discover', '--installed'], {
        cwd: tmpDir,
      });
      expect(json.status, json.stderr).toBe(0);
      const entry = JSON.parse(json.stdout).data.find(
        (/** @type {{name: string}} */ each) => each.name === '@acme/guides',
      );
      expect(entry.description).toBe('Acme guides for building.');

      const text = await runCli(['discover', '--installed'], {cwd: tmpDir});
      expect(text.stdout).not.toContain('\u001b');
      expect(text.stdout).not.toContain('\u0007');
      expect(text.stdout).not.toContain('\u202e');
    },
    SLOW,
  );

  it(
    'adds no description when the package.json has none',
    async () => {
      writeProject({name: '@acme/guides', version: '1.0.0'});

      const json = await runCli(['--json', 'discover', '--installed'], {
        cwd: tmpDir,
      });
      expect(json.status, json.stderr).toBe(0);
      const entry = JSON.parse(json.stdout).data.find(
        (/** @type {{name: string}} */ each) => each.name === '@acme/guides',
      );
      expect(entry).not.toHaveProperty('description');
    },
    SLOW,
  );

  it(
    'adds no description when the package.json description is blank',
    async () => {
      writeProject({
        name: '@acme/guides',
        version: '1.0.0',
        description: '  \u001b[0m  ',
      });

      const json = await runCli(['--json', 'discover', '--installed'], {
        cwd: tmpDir,
      });
      expect(json.status, json.stderr).toBe(0);
      const entry = JSON.parse(json.stdout).data.find(
        (/** @type {{name: string}} */ each) => each.name === '@acme/guides',
      );
      expect(entry).not.toHaveProperty('description');
    },
    SLOW,
  );
});
