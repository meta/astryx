// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built and runtime themes pass an inherited icon entry the same variants.
 * @input Real themeBuild calls on a base theme with a function icon entry and a
 *   child that extends it with a wider `iconVariants` list.
 * @output A native ESM load renders `<Icon variant>` under the built child and
 *   under the runtime child and compares the variant each entry received.
 * @position `architecture:theme-compilation` INV15 for `spec:AST-087` FR4: an
 *   inherited entry keeps its defining theme's list, so a variant only the
 *   child lists never reaches it, built or runtime. The node project's global
 *   setup supplies the compiled core package.
 */

import {expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

it('passes an inherited entry only its defining theme variants in a built child, as at runtime', async () => {
  const tmpDir = fs.mkdtempSync(
    path.resolve(import.meta.dirname, '../../..', '.tmp-icon-entry-variants-'),
  );
  try {
    for (const directory of ['base', 'child', 'unlisted']) {
      fs.mkdirSync(path.join(tmpDir, directory));
    }
    const write = (file, source) =>
      fs.writeFileSync(path.join(tmpDir, file), source);

    write(
      'base/icons.mjs',
      `import {createElement} from 'react';
export const icons = {
  info: ({variant}) => createElement('svg', {'data-variant': variant ?? 'normal'}),
};
`,
    );
    write(
      'base/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {icons} from './icons.mjs';
export const baseTheme = defineTheme({
  name: 'entry-variants-base', tokens: {}, iconVariants: ['outline'], icons,
});
`,
    );
    write(
      'child/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
export default defineTheme({
  name: 'entry-variants-child', extends: baseTheme, tokens: {},
  iconVariants: ['outline', 'filled'],
});
`,
    );
    // A defining theme with no list: the built module writes it as `[]`.
    write(
      'unlisted/base.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {icons} from '../base/icons.mjs';
export const unlistedBase = defineTheme({
  name: 'entry-variants-unlisted-base', tokens: {}, icons,
});
`,
    );
    write(
      'unlisted/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {unlistedBase} from './base.mjs';
export default defineTheme({
  name: 'entry-variants-unlisted-child', extends: unlistedBase, tokens: {},
  iconVariants: ['filled'],
});
`,
    );
    for (const source of ['child/source.mjs', 'unlisted/source.mjs']) {
      const receipt = await themeBuild(source, {}, {cwd: tmpDir});
      expect(receipt?.type).toBe('theme.build');
    }

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Icon} from '@astryxdesign/core/Icon';
import {Theme} from '@astryxdesign/core/theme';
import {entryVariantsChildTheme as built} from './child/entry-variants-child.js';
import runtime from './child/source.mjs';
import {entryVariantsUnlistedChildTheme as unlistedBuilt} from './unlisted/entry-variants-unlisted-child.js';
import unlistedRuntime from './unlisted/source.mjs';
const received = (theme, variant) => {
  const html = renderToStaticMarkup(
    createElement(Theme, {theme}, createElement(Icon, {icon: 'info', variant})),
  );
  return /data-variant="([^"]+)"/.exec(html)?.[1] ?? null;
};
const result = {};
for (const [label, theme] of [
  ['built', built],
  ['runtime', runtime],
  ['unlistedBuilt', unlistedBuilt],
  ['unlistedRuntime', unlistedRuntime],
]) {
  result[label] = {
    filled: received(theme, 'filled'),
    outline: received(theme, 'outline'),
  };
}
process.stdout.write(JSON.stringify(result));`,
      ],
      {cwd: tmpDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000},
    );
    const result = JSON.parse(String(output));

    // The base never listed 'filled', so its entry draws normal artwork for
    // it in the child; 'outline' is listed by both and reaches the entry.
    expect(result.runtime).toEqual({filled: 'normal', outline: 'outline'});
    expect(result.built).toEqual(result.runtime);
    // A base with no list passes its entry no variant, even one its child lists.
    expect(result.unlistedRuntime).toEqual({
      filled: 'normal',
      outline: 'normal',
    });
    expect(result.unlistedBuilt).toEqual(result.unlistedRuntime);
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});
