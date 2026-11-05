// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-docs-depth-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** An app with an integration that places one guide under its namespace. */
function scaffoldGuide() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(packageDir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  const namespace = {
    type: 'namespace',
    name: 'acme',
    title: 'Acme docs',
    summary: 'Build with the Acme kit.',
    slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
  };
  const guide = {
    type: 'generic',
    name: 'themes',
    title: 'Theme building',
    description: 'Build an Acme theme.',
    placement: {parent: 'namespace:acme', slot: 'guides'},
    sections: [
      {
        title: 'Create the theme',
        content: [
          {
            type: 'prose',
            text: 'Child guide body marker: compile the ocean palette.',
          },
          {type: 'code', lang: 'bash', code: 'npx acme theme build ocean'},
        ],
      },
    ],
  };
  for (const [file, doc] of [
    ['acme.doc.mjs', namespace],
    ['themes.doc.mjs', guide],
  ]) {
    fs.writeFileSync(
      path.join(packageDir, 'docs', file),
      `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
}

describe('astryx docs --depth', () => {
  it(
    'lists every doc below a namespace, one line each, by where it sits',
    async () => {
      const result = await runCli(['docs', 'cli/api', '--depth', 'all']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^functions\s+\S/m);
      expect(result.stdout).toMatch(/^functions\/search\s+search\(\): /m);
      expect(result.stdout).toContain('Open one: ');
      expect(result.stdout).toContain('docs cli/api/<name>');
      // One line each: no doc's body.
      expect(result.stdout).not.toContain('`astryx search` runs it.');
    },
    SLOW,
  );

  it(
    'says how many docs sit below where the read stops',
    async () => {
      const zero = await runCli(['docs', 'cli/api', '--depth', '0']);
      expect(zero.status).toBe(0);
      expect(zero.stdout).toMatch(
        /^\d+ docs below\. Read them: .*docs cli\/api --depth 1$/m,
      );
      expect(zero.stdout).not.toMatch(/^functions\s/m);

      const one = await runCli(['docs', 'cli/api', '--depth', '1']);
      expect(one.status).toBe(0);
      expect(one.stdout).toMatch(/^functions\s+.*\(\d+ docs below\)$/m);
      expect(one.stdout).not.toMatch(/^functions\/search\s/m);
    },
    SLOW,
  );

  it(
    'prints each doc below whole with --detail full, and drops code at compact',
    async () => {
      scaffoldGuide();
      const full = await runCli(
        ['docs', 'acme', '--depth', 'all', '--detail', 'full'],
        tmpDir,
      );
      expect(full.status).toBe(0);
      expect(full.stdout).toMatch(/^## Theme building \(themes\)$/m);
      expect(full.stdout).toMatch(/^### Create the theme$/m);
      expect(full.stdout).toContain(
        'Child guide body marker: compile the ocean palette.',
      );
      expect(full.stdout).toContain('npx acme theme build ocean');

      const compact = await runCli(
        ['docs', 'acme', '--depth', '1', '--detail', 'compact'],
        tmpDir,
      );
      expect(compact.status).toBe(0);
      expect(compact.stdout).toContain('Child guide body marker');
      expect(compact.stdout).not.toContain('npx acme theme build ocean');

      // Without --depth, the namespace still lists the guide by one line.
      const plain = await runCli(['docs', 'acme'], tmpDir);
      expect(plain.status).toBe(0);
      expect(plain.stdout).toMatch(/^themes\s+Build an Acme theme\./m);
      expect(plain.stdout).not.toContain('Child guide body marker');
    },
    SLOW,
  );

  it(
    'returns the same tree as JSON, with text only when --detail asks',
    async () => {
      const brief = await runCli(['--json', 'docs', 'cli/api', '--depth', '2']);
      expect(brief.status).toBe(0);
      const briefData = JSON.parse(brief.stdout);
      expect(briefData.type).toBe('docs.node');
      const functions = briefData.data.slots
        .flatMap((/** @type {any} */ slot) => slot.children)
        .find(
          (/** @type {any} */ child) => child.route === 'cli/api/functions',
        );
      const search = functions.slots
        .flatMap((/** @type {any} */ slot) => slot.children)
        .find(
          (/** @type {any} */ child) =>
            child.route === 'cli/api/functions/search',
        );
      expect(search).not.toHaveProperty('content');

      const full = await runCli([
        '--json',
        'docs',
        'cli/api',
        '--depth',
        '2',
        '--detail',
        'full',
      ]);
      expect(full.status).toBe(0);
      expect(full.stdout).toContain('`astryx search` runs it.');
    },
    SLOW,
  );

  it(
    'composes with --index and --full, and leaves a topic read as it was',
    async () => {
      const depth = await runCli(['docs', 'cli/api', '--depth', '1']);
      expect(depth.status).toBe(0);
      for (const flag of ['--index', '--full']) {
        const both = await runCli(['docs', 'cli/api', '--depth', '1', flag]);
        expect(both.status).toBe(0);
        expect(both.stdout).toBe(depth.stdout);
      }
      for (const args of [
        ['docs', 'theme'],
        ['docs', 'theme', '--index'],
        ['docs', 'theme', '--full'],
      ]) {
        const plain = await runCli(args);
        const withDepth = await runCli([...args, '--depth', '2']);
        expect(withDepth.status).toBe(plain.status);
        expect(withDepth.stdout).toBe(plain.stdout);
      }
    },
    SLOW,
  );

  it(
    'refuses a depth that is not a number of levels',
    async () => {
      const result = await runCli([
        '--json',
        'docs',
        'cli/api',
        '--depth',
        'deep',
      ]);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    },
    SLOW,
  );
});
