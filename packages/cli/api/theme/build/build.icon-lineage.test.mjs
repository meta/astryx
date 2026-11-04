// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon preservation through multiple generations of built themes.
 * @input Real themeBuild calls and registries imported under the same local
 *   binding name from separate base and child theme directories.
 * @output A native ESM load verifies inherited and overridden React icons
 *   survive when a grandchild extends the child's generated artifact.
 * @position Direct API regression for persisted icon inheritance in #5058.
 *   The node project's global setup supplies the compiled core package.
 */

import {expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

it('preserves merged icon lineage through a built child with colliding import names', async () => {
  const tmpDir = fs.mkdtempSync(
    path.resolve(import.meta.dirname, '../../..', '.tmp-icon-lineage-'),
  );
  try {
    for (const directory of ['base', 'child']) {
      fs.mkdirSync(path.join(tmpDir, directory));
    }
    const write = (file, source) =>
      fs.writeFileSync(path.join(tmpDir, file), source);
    const writeRegistry = (file, labels) => {
      write(
        file,
        `import {createElement} from 'react';
export const icons = {
${Object.entries(labels)
  .map(
    ([key, label]) =>
      `  ${JSON.stringify(key)}: createElement('svg', {'data-icon': ${JSON.stringify(label)}}),`,
  )
  .join('\n')}
};
`,
      );
    };

    writeRegistry('base/icons.mjs', {
      check: 'base-check',
      close: 'base-close',
    });
    writeRegistry('child/icons.mjs', {
      add: 'child-add',
      close: 'child-close',
    });
    write(
      'base/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {icons} from './icons.mjs';
export const baseTheme = defineTheme({
  name: 'base', tokens: {'--color-bg': '#fff'}, icons,
});
`,
    );
    write(
      'child/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
import {icons} from './icons.mjs';
export default defineTheme({
  name: 'child', extends: baseTheme, tokens: {}, icons,
});
`,
    );
    const child = await themeBuild('child/source.mjs', {}, {cwd: tmpDir});
    expect(child?.type).toBe('theme.build');

    write(
      'grandchild.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {childTheme} from './child/child.js';
export default defineTheme({name: 'grandchild', extends: childTheme, tokens: {}});
`,
    );
    const grandchild = await themeBuild('grandchild.mjs', {}, {cwd: tmpDir});
    expect(grandchild?.type).toBe('theme.build');
    const checked = await themeBuild(
      'grandchild.mjs',
      {check: true},
      {cwd: tmpDir},
    );
    expect(checked?.data.upToDate).toBe(true);

    // Native imports catch invalid aliases and incorrect relative specifiers
    // that the source loader could otherwise resolve or transform away.
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import assert from 'node:assert/strict';
import {isValidElement} from 'react';
import {childTheme} from './child/child.js';
import {grandchildTheme} from './grandchild.js';
const expected = {check: 'base-check', close: 'child-close', add: 'child-add'};
assert.deepEqual(Object.keys(grandchildTheme.icons).sort(), Object.keys(expected).sort());
for (const [key, label] of Object.entries(expected)) {
  const icon = grandchildTheme.icons[key];
  assert.ok(isValidElement(icon), key + ' must remain a React element');
  assert.equal(icon.type, 'svg');
  assert.equal(icon.props['data-icon'], label);
  assert.equal(icon, childTheme.icons[key], key + ' must retain its imported identity');
}`,
      ],
      {cwd: tmpDir, stdio: 'pipe', timeout: 10000},
    );
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});
