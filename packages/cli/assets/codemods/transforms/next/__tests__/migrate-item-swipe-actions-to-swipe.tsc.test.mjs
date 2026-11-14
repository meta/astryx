// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Type-level check of the swipe codemod's output.
 *
 * `itemKey` is `string | number | undefined`. A handler that compares the
 * row's key with `===` or `!==` can read it from `onActivate` instead, and a
 * handler that passes the key on keeps its closure. This runs the codemod
 * over typed fixtures, writes the result to a temporary project that links
 * `@astryxdesign/core`, and runs the real `tsc` over it. A negative control
 * asserts that the rewrite the codemod does not make, `({itemKey}) =>
 * remove(itemKey)`, fails `tsc` with TS2345, so the check cannot pass
 * vacuously.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';

import transform from '../migrate-item-swipe-actions-to-swipe.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../../../test-utils/linked-fixture.mjs';

const CLI_DIR = path.resolve(import.meta.dirname, '../../../../..'); // packages/cli
const REPO_ROOT = path.resolve(CLI_DIR, '../..');
// The workspace's own tsc, run with node, as the v0.3.0 type-level test runs it.
const TSC = createRequire(path.join(REPO_ROOT, 'package.json')).resolve(
  'typescript/bin/tsc',
);

async function migrateSource(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'rows.tsx'}, api) ?? source;
}

// One handler passes the row's key on, and one compares it.
const ROWS = `import {List, ListItem} from '@astryxdesign/core/List';
type Row = {id: string; label: string};
export function Rows({rows, remove}: {rows: Row[]; remove: (id: string) => void}) {
  return (
    <List>
      {rows.map(row => (
        <ListItem key={row.id} itemKey={row.id} label={row.label} swipeActions={{trailing: [{label: 'Delete', onActivate: () => remove(row.id)}]}} />
      ))}
    </List>
  );
}
export function Labels({labels, setLabels}: {labels: string[]; setLabels: (next: string[]) => void}) {
  return (
    <List>
      {labels.map(label => (
        <ListItem key={label} itemKey={label} label={label} swipeActions={{trailing: [{label: 'Delete', onActivate: () => setLabels(labels.filter(other => other !== label))}]}} />
      ))}
    </List>
  );
}
`;

// The rewrite the codemod does not make: the key passed on from onActivate.
const PASSED_ON = `import {createSwipe} from '@astryxdesign/core/Swipe';
const remove = (id: string): void => {
  void id;
};
export const swipe = createSwipe({
  trailing: [{id: 'delete', label: 'Delete', onActivate: ({itemKey}) => remove(itemKey)}],
});
`;

const TSCONFIG = JSON.stringify(
  {
    extends: path.join(REPO_ROOT, 'tsconfig.json'),
    compilerOptions: {noEmit: true, skipLibCheck: true},
    include: ['*.tsx'],
  },
  null,
  2,
);

let dir;
let migrated;
beforeAll(async () => {
  // The root tsconfig names the `node` and jest-dom types.
  dir = makeLinkedFixture('astryx-swipe-codemod-tsc-', [
    '@astryxdesign/core',
    'react',
    '@types/react',
    '@types/node',
    '@testing-library/jest-dom',
  ]);
  migrated = await migrateSource(ROWS);
  for (const [which, files] of Object.entries({
    post: {'rows.tsx': migrated},
    control: {'passed-on.tsx': PASSED_ON},
  })) {
    fs.mkdirSync(path.join(dir, which));
    for (const [name, source] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, which, name), source);
    }
    fs.writeFileSync(path.join(dir, which, 'tsconfig.json'), TSCONFIG);
  }
});

afterAll(() => {
  if (dir) removeLinkedFixture(dir);
});

/** Run the real tsc on a fixture dir; return {ok, output}. */
function tsc(which) {
  const project = path.join(dir, which, 'tsconfig.json');
  try {
    execFileSync(process.execPath, [TSC, '-p', project], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    return {ok: true, output: ''};
  } catch (err) {
    return {ok: false, output: `${err.stdout || ''}${err.stderr || ''}`};
  }
}

describe('migrate-item-swipe-actions-to-swipe — type-level (tsc)', () => {
  it('the migrated rows type-check: the passed-on key keeps its closure, and the compared key reads itemKey', () => {
    expect(migrated).toContain('onActivate: () => remove(row.id)');
    expect(migrated).toMatch(/\(\{ ?itemKey ?\}\) => setLabels\(/);
    const {ok, output} = tsc('post');
    expect(ok, `tsc reported errors on migrated output:\n${output}`).toBe(true);
  }, 60000);

  it('negative control: the key passed on from onActivate fails tsc with TS2345', () => {
    const {ok, output} = tsc('control');
    expect(ok).toBe(false);
    expect(output).toMatch(/TS2345/);
  }, 60000);
});
