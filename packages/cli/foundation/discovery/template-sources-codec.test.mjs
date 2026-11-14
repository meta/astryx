// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template-sources-codec.test.mjs
 * @input Template discovery over Core and a TypeScript integration
 * @output Every record, and the whole result, reads back exactly through the
 *   codec template discovery is kept with
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {discoverAllWithErrors} from './template-adapter.mjs';
import {EXACT_CODEC, isPlain, sameExactly} from '../fs/exact-codec.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

/** @type {string} */
let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-codec-'));
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'app',
      dependencies: {'@astryxdesign/core': '*', '@acme/widgets': '1.0.0'},
    }),
  );
  const pkg = path.join(dir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkg, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.ts'),
    "const integration: {templates: string} = {templates: './templates'};\nexport default integration;\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'templates', 'tally.doc.mjs'),
    "export default {type: 'page', name: 'tally', description: 'Running totals.', category: 'Widget - Tally'};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'templates', 'tally.tsx'),
    'export default function Page() { return null; }\n',
  );
  // A template that replaces another of the same package, so the records
  // carry a replacement's fields too.
  fs.writeFileSync(
    path.join(pkg, 'templates', 'tally-v2.doc.mjs'),
    "export default {type: 'page', name: 'tally-v2', description: 'Running totals, again.', category: 'Widget - Tally', replaces: 'tally'};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'templates', 'tally-v2.tsx'),
    'export default function Page() { return null; }\n',
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('template discovery through the exact codec', () => {
  it('reads every record back exactly, key order included', async () => {
    const found = await discoverAllWithErrors(dir);
    expect(found.templates.length).toBeGreaterThan(1);
    expect(found.templates.some(t => t.name === 'tally-v2')).toBe(true);
    expect(
      found.templates.some(
        t => t.replaces != null || t.replacementTarget != null,
      ),
    ).toBe(true);
    expect(isPlain(found)).toBe(true);
    const whole = EXACT_CODEC.decode(
      JSON.parse(JSON.stringify(EXACT_CODEC.encode(found))),
    );
    expect(sameExactly(whole, found)).toBe(true);
    for (const record of found.templates) {
      expect(isPlain(record), String(record.name)).toBe(true);
      const back = EXACT_CODEC.decode(
        JSON.parse(JSON.stringify(EXACT_CODEC.encode(record))),
      );
      expect(sameExactly(back, record), String(record.name)).toBe(true);
    }
  }, 60_000);
});
