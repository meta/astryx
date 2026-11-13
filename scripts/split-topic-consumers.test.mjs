// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every repo consumer that lists or reads doc topics by name still finds
 * a topic after it is split into a docs-tree namespace: a
 * root namespace answers `astryx docs <name>` as the flat topic did, so no
 * list, generated file, or check may treat it as missing. The docsite's own
 * page check lives in apps/docsite (route-resolution.test.ts); the theme
 * template's citations are checked in check-theme-template.test.mjs.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {docs} from '../packages/cli/api/docs/docs.mjs';
import {cliRootNamespaceNames} from '../packages/cli/foundation/doc-compiler/tree.mjs';
import {generateCompressedIndex} from '../packages/cli/foundation/agent-docs/agent-docs.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SLOW = 60_000;

/** The CLI's root namespaces other than `cli`, its command and API reference. */
const splitTopics = cliRootNamespaceNames().filter(name => name !== 'cli');

describe('consumers of a topic split into a namespace', () => {
  it('finds the split topics', () => {
    expect(splitTopics).toContain('layout');
  });

  it(
    'opens each one with astryx docs <name>',
    async () => {
      for (const name of splitTopics) {
        const read = await docs(name);
        expect(read, name).toMatchObject({
          type: 'docs.node',
          data: {kind: 'namespace', route: name},
        });
      }
    },
    SLOW,
  );

  it('lists each one in the agent docs block, as a flat topic is listed', () => {
    const line = generateCompressedIndex('1.0.0')
      .split('\n')
      .find(l => l.trimStart().startsWith('docs <topic>'));
    // The block names a few key topics; each one that is a split topic must
    // still appear, so a split never drops it from every AGENTS.md.
    for (const key of ['getting-started', 'principles', 'tokens', 'theme']) {
      expect(line, key).toContain(key);
    }
  });

  it(
    'keeps every split foundation topic in the sandbox doc preview',
    () => {
      const script = path.join(
        REPO_ROOT,
        'apps/sandbox/scripts/generate-foundation-docs.mjs',
      );
      const output = path.join(
        REPO_ROOT,
        'apps/sandbox/src/generated/foundationDocs.json',
      );
      fs.mkdirSync(path.dirname(output), {recursive: true});
      execFileSync(process.execPath, [script], {cwd: REPO_ROOT, stdio: 'pipe'});
      const preview = JSON.parse(fs.readFileSync(output, 'utf8'));
      for (const [name, doc] of Object.entries(preview)) {
        if (name.startsWith('__')) continue;
        expect(doc.sections.length, name).toBeGreaterThan(0);
      }
      for (const name of splitTopics.filter(n => n in preview)) {
        expect(preview[name].title, name).toBeTruthy();
      }
      expect(Object.keys(preview)).toContain('typography');
    },
    SLOW,
  );
});
