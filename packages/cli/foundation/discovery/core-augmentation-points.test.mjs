// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for core-augmentation-points.mjs: which Core prop axes a theme
 *   can widen, and the keys a project adds to them.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  projectAugmentations,
  propAugmentationPoint,
} from './core-augmentation-points.mjs';

const CORE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core',
);

describe('propAugmentationPoint', () => {
  it('names the interface that widens an open axis, and nothing for a closed one', () => {
    expect(propAugmentationPoint(CORE_ROOT, 'Button', 'variant')).toEqual({
      moduleName: 'Button',
      interfaceName: 'ButtonVariantMap',
    });
    expect(propAugmentationPoint(CORE_ROOT, 'Button', 'size')).toBeNull();
    expect(propAugmentationPoint(CORE_ROOT, 'Text', 'type')).toEqual({
      moduleName: 'theme',
      interfaceName: 'CustomTextTypes',
    });
    expect(propAugmentationPoint(null, 'Button', 'variant')).toBeNull();
  });
});

describe('projectAugmentations', () => {
  /** @type {string} */
  let dir;
  /** @param {string} name @param {string} content */
  const put = (name, content) => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-augmentations-')),
    );
    put(
      'package.json',
      JSON.stringify({
        name: 'app',
        dependencies: {'@acme/theme': '1.0.0', other: '1.0.0'},
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it("reads the project's files and its Core-dependent packages' declarations", () => {
    put(
      'src/brand.ts',
      `export {};
/** declare module '@astryxdesign/core/Button' { interface ButtonVariantMap { commented: true } } */
declare module '@astryxdesign/core/Button' {
  export interface ButtonVariantMap { 'primary-muted': true; quiet: true }
}
declare module 'somewhere-else' {
  interface ButtonVariantMap { elsewhere: true }
}
`,
    );
    put(
      'node_modules/@acme/theme/package.json',
      JSON.stringify({
        name: '@acme/theme',
        peerDependencies: {'@astryxdesign/core': '*'},
      }),
    );
    put(
      'node_modules/@acme/theme/dist/acme.variants.d.ts',
      "export {};\ndeclare module '@astryxdesign/core/Banner' { interface BannerStatusMap { neutral: true } }\n",
    );
    put('node_modules/other/package.json', JSON.stringify({name: 'other'}));
    put(
      'node_modules/other/index.d.ts',
      "export {};\ndeclare module '@astryxdesign/core/Banner' { interface BannerStatusMap { unrelated: true } }\n",
    );
    const {keys, complete} = projectAugmentations(dir);
    expect(complete).toBe(true);
    expect([...(keys.get('ButtonVariantMap') ?? [])]).toEqual([
      'primary-muted',
      'quiet',
    ]);
    expect([...(keys.get('BannerStatusMap') ?? [])]).toEqual(['neutral']);
  });

  it('says it is incomplete when a file that may augment Core does not parse', () => {
    put(
      'src/broken.ts',
      "declare module '@astryxdesign/core/Button' { interface ButtonVariantMap { \n",
    );
    expect(projectAugmentations(dir).complete).toBe(false);
  });
});
