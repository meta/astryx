// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lab-sync.test.mjs
 * @input lab-sync.mjs, the repository's Lab docs, route lock and Lab samples,
 *   and a fixture Lab component in a temporary tree
 * @output The repository needs no sync; a lock without its Lab entries comes
 *   back byte-identical (the generator's own order and format); a new Lab
 *   component gets its route entry and a sample stub, `--check` names both
 *   and fails before the sync and passes after it, and an existing sample is
 *   never changed.
 * @position A Node test; it imports docs and needs no build
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import * as identity from '../apps/docsite/src/lib/shadcnRegistry.mjs';
import {
  LAB_SAMPLES,
  ROUTE_LOCK,
  STUB_MARKER,
  STUB_NOTE,
  labRouteEntries,
  labSync,
  sampleStub,
  stubValue,
  syncRouteLock,
} from './lab-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/lab-sync.mjs');

describe('lab:sync on the repository', () => {
  it('finds every Lab route entry and swizzle sample present', async () => {
    expect(await labSync(ROOT, {write: false})).toEqual({
      routes: [],
      samples: [],
    });
  });

  it('writes back exactly the lock the docsite generator wrote', async () => {
    const lock = fs.readFileSync(path.join(ROOT, ROUTE_LOCK), 'utf8');
    const entries = await labRouteEntries(ROOT, identity);
    const names = new Set(entries.map(entry => entry.name));
    const parsed = JSON.parse(lock);
    const without = `${JSON.stringify(
      {...parsed, items: parsed.items.filter(item => !names.has(item.name))},
      null,
      2,
    )}\n`;
    const {text, missing} = syncRouteLock(without, entries);
    expect(missing.length).toBe(entries.length);
    expect(text).toBe(lock);
  });
});

describe('stubs', () => {
  it('builds each required prop from its doc type', () => {
    expect(stubValue({name: 'label', type: 'string'})).toBe('"label"');
    expect(stubValue({name: 'count', type: 'number'})).toBe('0');
    expect(stubValue({name: 'open', type: 'boolean'})).toBe('false');
    expect(stubValue({name: 'title', type: 'ReactNode'})).toBe("'Sample'");
    expect(stubValue({name: 'onChange', type: '(value: string) => void'})).toBe(
      'noop',
    );
    expect(stubValue({name: 'kind', type: "'video' | 'audio'"})).toBe(
      '"video"',
    );
    expect(stubValue({name: 'items', type: 'string[]'})).toBe('[]');
  });

  it('marks the stub as generated', () => {
    expect(sampleStub('lab__Foo', [{name: 'label', type: 'string'}])).toContain(
      STUB_NOTE,
    );
  });
});

/** A repository tree with one Lab component that has neither entry. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-sync-'));
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  put(
    'packages/lab/src/Foo/Foo.doc.mjs',
    `export default {
  name: 'Foo',
  props: [
    {name: 'label', type: 'string', required: true},
    {name: 'onChange', type: '(value: string) => void', required: true},
    {name: 'size', type: 'number'},
    {name: 'children', type: 'ReactNode', required: true},
  ],
};
`,
  );
  put(
    'packages/lab/src/Bar/Bar.doc.mjs',
    `export default {name: 'Bar', props: [{name: 'value', type: 'number', required: true}]};
`,
  );
  put(
    ROUTE_LOCK,
    `${JSON.stringify(
      {
        version: 1,
        items: [
          {name: 'component-alert', path: 'components/alert', aliases: []},
          {
            name: 'component-lab-bar',
            path: 'components/lab/bar',
            aliases: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  put(
    LAB_SAMPLES,
    `const noop = () => {};

export const labSamples = {
  lab__Bar: ({C, React}) => React.createElement(C, {value: 7}),
${STUB_MARKER}
};

export const labNeedsNoSample = {};
`,
  );
  return root;
}

describe('lab:sync on a new Lab component', () => {
  it('writes its route entry and a sample stub, and keeps an existing sample', async () => {
    const root = fixture();
    expect(await labSync(root, {write: false})).toEqual({
      routes: ['component-lab-foo'],
      samples: ['lab__Foo'],
    });
    const barBefore = fs.readFileSync(path.join(root, LAB_SAMPLES), 'utf8');
    await labSync(root, {write: true});
    const lock = JSON.parse(
      fs.readFileSync(path.join(root, ROUTE_LOCK), 'utf8'),
    );
    expect(lock.items.map(item => item.path)).toEqual([
      'components/alert',
      'components/lab/bar',
      'components/lab/foo',
    ]);
    const samples = fs.readFileSync(path.join(root, LAB_SAMPLES), 'utf8');
    expect(samples).toContain(
      'lab__Bar: ({C, React}) => React.createElement(C, {value: 7}),',
    );
    expect(samples).toContain(`  ${STUB_NOTE}\n  lab__Foo: ({C, React}) =>`);
    expect(samples).toContain('"label": "label",');
    expect(samples).toContain('"onChange": noop,');
    expect(samples).not.toContain('"size"');
    expect(samples).not.toContain('"children"');
    expect(barBefore.split(STUB_MARKER)[0]).toBe(
      samples.split(`  ${STUB_NOTE}`)[0],
    );
    expect(await labSync(root, {write: false})).toEqual({
      routes: [],
      samples: [],
    });
    const {labSamples} = await import(path.join(root, LAB_SAMPLES));
    expect(labSamples.lab__Foo).toBeTypeOf('function');
  });

  it('--check fails naming each missing entry and the fix, and passes after the sync', () => {
    const root = fixture();
    const env = {...process.env, LAB_SYNC_ROOT: root};
    const before = spawnSync(process.execPath, [SCRIPT, '--check'], {
      env,
      encoding: 'utf8',
    });
    expect(before.status).toBe(1);
    expect(before.stderr).toContain(
      `route-lock entry component-lab-foo (${ROUTE_LOCK})`,
    );
    expect(before.stderr).toContain(`swizzle sample lab__Foo (${LAB_SAMPLES})`);
    expect(before.stderr).toContain('Run `pnpm lab:sync`');
    execFileSync(process.execPath, [SCRIPT], {env});
    const after = spawnSync(process.execPath, [SCRIPT, '--check'], {
      env,
      encoding: 'utf8',
    });
    expect(after.status).toBe(0);
  });
});
