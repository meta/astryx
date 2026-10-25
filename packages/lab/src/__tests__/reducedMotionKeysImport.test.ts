// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionKeysImport.test.ts
 * @input Uses vitest, Babel with the StyleX plugin, core's package exports and
 *   core's Reduce Motion keys
 * @output Checks that a lab transition keyed by core's imported Reduce Motion
 *   keys emits both rules once the constants are substituted: the fade on a
 *   coarse pointer, at once on any other
 * @position Test for the `@astryxdesign/core/motion/reducedMotion.stylex`
 *   export
 *
 * StyleX compiles a key read from another file to a placeholder that the
 * defining file's constant replaces at bundle time. The test compiles both
 * files, as lab and core each would, resolving the import to core's `source`
 * export (whether or not core's dist exists), and substitutes the constants:
 * a key that does not resolve, or resolves to a differently named constant,
 * leaves a placeholder and fails.
 */

import {existsSync, readFileSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const lab = path.resolve(__dirname, '../..');
const core = path.resolve(lab, '../core');
const coreExports = JSON.parse(
  readFileSync(path.join(core, 'package.json'), 'utf8'),
).exports as Record<string, {source?: string} | string>;

// Babel ships no type declarations to lab; type the one call used.
const {transformSync} = createRequire(import.meta.url)('@babel/core') as {
  transformSync: (
    code: string,
    options: Record<string, unknown>,
  ) => {metadata?: unknown} | null;
};

type Rule = [string, {ltr: string; constKey?: string; constVal?: string}];

const isFile = (file: string) => existsSync(file) && statSync(file).isFile();

/** StyleX's canonical name for a file: `<package name>:<path inside it>`. */
function canonicalPath(file: string): string {
  for (let dir = path.dirname(file); dir !== path.dirname(dir);) {
    const manifest = path.join(dir, 'package.json');
    if (isFile(manifest)) {
      const {name} = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string;
      };
      if (name) {
        return `${name}:${path.relative(dir, file)}`;
      }
    }
    dir = path.dirname(dir);
  }
  return file;
}

/** A core specifier resolves to its `source` export, a relative one in place. */
function resolveImport(specifier: string, from: string): string | undefined {
  if (specifier.startsWith('.')) {
    const base = path.resolve(path.dirname(from), specifier);
    return ['', '.ts', '.tsx'].map(ext => base + ext).find(isFile);
  }
  const prefix = '@astryxdesign/core/';
  if (!specifier.startsWith(prefix)) {
    return undefined;
  }
  const entry = coreExports[`./${specifier.slice(prefix.length)}`];
  return typeof entry === 'object' && entry.source != null
    ? path.join(core, entry.source)
    : undefined;
}

function compile(code: string, filename: string): Rule[] {
  const output = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['typescript', 'jsx']},
    plugins: [
      [
        '@stylexjs/babel-plugin',
        {
          dev: false,
          runtimeInjection: false,
          treeshakeCompensation: true,
          unstable_moduleResolution: {
            type: 'custom',
            filePathResolver: resolveImport,
            getCanonicalFilePath: canonicalPath,
          },
        },
      ],
    ],
  });
  return (output?.metadata as {stylex?: Rule[]}).stylex ?? [];
}

const SOURCE = `
import * as stylex from '@stylexjs/stylex';
import {
  reducedMotionFadeConsts,
  reducedMotionKeys,
} from '@astryxdesign/core/motion/reducedMotion.stylex';
export const styles = stylex.create({
  panel: {
    transitionDuration: {
      default: '300ms',
      [reducedMotionKeys.fade]: reducedMotionFadeConsts.duration,
      [reducedMotionKeys.instant]: '0s',
    },
  },
});
`;

describe('core Reduce Motion keys from lab', () => {
  it('emits the fade and the at-once rules for a lab transition keyed by the imported keys', () => {
    const coreFile = path.join(core, 'src/motion/reducedMotion.stylex.ts');
    const constants = new Map(
      compile(readFileSync(coreFile, 'utf8'), coreFile)
        .map(([, rule]) => rule)
        .filter(rule => rule.constKey != null)
        .map(rule => [rule.constKey as string, rule.constVal as string]),
    );
    const rules = compile(SOURCE, path.join(lab, 'src/Panel.tsx')).map(
      ([, rule]) =>
        rule.ltr.replace(
          /var\(--([a-z0-9]+)\)/g,
          (placeholder, key: string) => constants.get(key) ?? placeholder,
        ),
    );
    expect(rules).toContainEqual(
      expect.stringMatching(
        /^@media \(prefers-reduced-motion: reduce\) and \(pointer: coarse\)\{\.(\w+)\.\1\{transition-duration:200ms\}\}$/,
      ),
    );
    expect(rules).toContainEqual(
      expect.stringMatching(
        /^@media \(prefers-reduced-motion: reduce\) and \(not \(pointer: coarse\)\)\{\.(\w+)\.\1\{transition-duration:0s\}\}$/,
      ),
    );
    expect(rules.join('\n')).not.toMatch(/var\(--x/);
  });
});
