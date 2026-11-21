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
  propValueKinds,
  propWideningInterfaces,
  resolveAugmentationTarget,
  unacceptedKind,
} from './core-augmentation-points.mjs';

const CORE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core',
);

describe('propWideningInterfaces', () => {
  it.each([
    ['Button', 'variant', ['ButtonVariantMap']],
    ['Button', 'size', []],
    ['ClickableCard', 'variant', ['CardVariantMap']],
    ['Link', 'color', ['TextColorMap']],
    ['Heading', 'color', ['TextColorMap']],
    ['TextInput', 'statusVariant', ['FieldStatusVariantMap']],
    ['Text', 'type', ['CustomTextTypes']],
    ['Icon', 'variant', ['IconVariantMap']],
    ['AvatarStatusDot', 'variant', ['AvatarStatusDotVariantMap']],
  ])('%s %s takes the keys of %j', async (component, prop, names) => {
    const found = await propWideningInterfaces(CORE_ROOT, component, prop);
    expect([...(found ?? ['unknown'])]).toEqual(names);
  });

  it('cannot follow a prop without a Core', async () => {
    expect(await propWideningInterfaces(null, 'Button', 'variant')).toBeNull();
  });
});

describe('propValueKinds', () => {
  it('reads the kinds of value a prop takes, and nothing for a type it cannot follow', () => {
    /** @param {string} component @param {string} prop */
    const kinds = (component, prop) => {
      const found = propValueKinds(CORE_ROOT, component, prop);
      return found ? {kinds: [...found.kinds], fields: found.fields} : null;
    };
    expect(kinds('TextInput', 'status')).toEqual({
      kinds: ['object'],
      fields: ['type', 'message'],
    });
    expect(kinds('DateInput', 'value')).toEqual({
      kinds: ['string'],
      fields: null,
    });
    expect(kinds('Grid', 'columns')).toEqual({
      kinds: ['number', 'object'],
      fields: ['minWidth', 'max', 'repeat'],
    });
    expect(kinds('Button', 'variant')).toEqual({
      kinds: ['string'],
      fields: null,
    });
    expect(kinds('Skeleton', 'radius')).toBeNull();
    // Brand members (typed `never`, or keyed by a module path) are not fields to write.
    expect(kinds('Collapsible', 'animatedLayout')?.fields ?? null).toBeNull();
    expect(kinds('Item', 'swipe')?.fields ?? null).toBeNull();
    // `Omit<ButtonProps, 'onClick'>` names no fields: Button's own include the omitted one.
    expect(kinds('DropdownMenu', 'button')).toEqual({
      kinds: ['object'],
      fields: null,
    });
    // An interface's fields include those of the interfaces it extends.
    expect(kinds('Dialog', 'position')).toEqual({
      kinds: ['object'],
      fields: ['start', 'end', 'top', 'bottom'],
    });
    // Shapes that differ (a discriminated union) name no fields.
    expect(kinds('PowerSearchToken', 'operator')).toEqual({
      kinds: ['object'],
      fields: null,
    });
    expect(kinds('Button', 'onClick')).toBeNull();
    expect(propValueKinds(null, 'Button', 'size')).toBeNull();
  });
});

describe('unacceptedKind', () => {
  it('names the first written kind the prop does not take', () => {
    const declared = {
      kinds: new Set(/** @type {const} */ (['object'])),
      fields: null,
      numbers: new Set(),
      anyNumber: false,
    };
    expect(unacceptedKind(['string'], declared)).toBe('string');
    expect(
      unacceptedKind(['object', 'array', 'Date', 'function'], declared),
    ).toBeNull();
  });
});

describe('resolveAugmentationTarget', () => {
  it("names the interface theme build enrolls a target's values in, by the doc that owns the target", async () => {
    expect(
      await resolveAugmentationTarget(
        CORE_ROOT,
        'avatar-status-dot',
        'variant',
      ),
    ).toEqual({
      moduleName: 'Avatar',
      interfaceName: 'AvatarStatusDotVariantMap',
    });
    expect(
      await resolveAugmentationTarget(CORE_ROOT, 'button', 'size'),
    ).toBeNull();
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
    const {keys, complete} = projectAugmentations(
      dir,
      path.join(dir, 'src', 'page.tsx'),
    );
    expect(complete).toBe(true);
    expect([...(keys.get('ButtonVariantMap') ?? [])]).toEqual([
      'primary-muted',
      'quiet',
    ]);
    expect([...(keys.get('BannerStatusMap') ?? [])]).toEqual(['neutral']);
  });

  it('reads past a broken file that cannot augment Core', () => {
    put('src/broken.tsx', 'export default function Page( { return <div>; }\n');
    expect(
      projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
    ).toBe(true);
  });

  it('says it is incomplete when a file that may augment Core does not parse', () => {
    put(
      'src/broken.ts',
      "declare module '@astryxdesign/core/Button' { interface ButtonVariantMap { \n",
    );
    expect(
      projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
    ).toBe(false);
  });

  it("says it is incomplete when the page's tsconfig reaches outside the project", () => {
    put(
      'tsconfig.json',
      JSON.stringify({include: ['src', '../shared/**/*.ts']}),
    );
    expect(
      projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
    ).toBe(false);
    put(
      'tsconfig.json',
      JSON.stringify({
        include: ['src'],
        compilerOptions: {typeRoots: ['../types']},
      }),
    );
    expect(
      projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
    ).toBe(false);
    put(
      'tsconfig.json',
      JSON.stringify({
        include: ['src/**/*'],
        compilerOptions: {typeRoots: ['./types']},
      }),
    );
    expect(
      projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
    ).toBe(true);
  });

  it('reads a hidden folder the tsconfig includes, as Next.js does', () => {
    put(
      'tsconfig.json',
      JSON.stringify({
        include: [
          'next-env.d.ts',
          '**/*.ts',
          '**/*.tsx',
          '.next/types/**/*.ts',
        ],
      }),
    );
    put(
      '.next/types/brand.d.ts',
      "export {};\ndeclare module '@astryxdesign/core/Button' { interface ButtonVariantMap { brand: true } }\n",
    );
    const {keys, complete} = projectAugmentations(
      dir,
      path.join(dir, 'src', 'page.tsx'),
    );
    expect(complete).toBe(true);
    expect([...(keys.get('ButtonVariantMap') ?? [])]).toEqual(['brand']);
  });

  it('reads the declarations of a package whose integration manifest is TypeScript', () => {
    put(
      'node_modules/@acme/theme/package.json',
      JSON.stringify({name: '@acme/theme'}),
    );
    put(
      'node_modules/@acme/theme/astryx.integration.ts',
      'export default {};\n',
    );
    put(
      'node_modules/@acme/theme/dist/acme.variants.d.ts',
      "export {};\ndeclare module '@astryxdesign/core/Banner' { interface BannerStatusMap { neutral: true } }\n",
    );
    expect([
      ...(projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).keys.get(
        'BannerStatusMap',
      ) ?? []),
    ]).toEqual(['neutral']);
  });

  it('says it is incomplete when the walk meets a linked folder', () => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-augmentations-linked-'),
    );
    try {
      fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
      fs.symlinkSync(
        outside,
        path.join(dir, 'src', 'shared'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      expect(
        projectAugmentations(dir, path.join(dir, 'src', 'page.tsx')).complete,
      ).toBe(false);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});
