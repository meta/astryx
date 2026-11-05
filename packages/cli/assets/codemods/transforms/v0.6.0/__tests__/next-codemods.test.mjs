// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Unit tests for staged next-release codemods. */

import {describe, expect, it} from 'vitest';
import jscodeshift from 'jscodeshift';

const j = jscodeshift.withParser('tsx');
const api = {jscodeshift: j, stats: () => {}, report: () => {}};

async function apply(name, source) {
  const {default: transform} = await import(`../${name}.mjs`);
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('remove-focus-isrtl-option', () => {
  it('removes the option from inline focus-hook configurations', async () => {
    const input = `import {useGridFocus as useGrid} from '@astryxdesign/core/hooks';
const focus = useGrid({columns: 3, isRtl: forceRtl, hasRovingTabIndex: true});`;
    const output = await apply('remove-focus-isrtl-option', input);
    expect(output).not.toContain('isRtl');
    expect(output).toContain('columns: 3');
    expect(output).toContain('hasRovingTabIndex: true');
  });

  it('leaves dynamic configurations and unrelated properties alone', async () => {
    const input = `import {useListFocus} from '@astryxdesign/core';
const config = {isRtl: true};
const focus = useListFocus(config);
const unrelated = {isRtl: false};`;
    const output = await apply('remove-focus-isrtl-option', input);
    expect(output).toBe(input);
  });

  it('does not rewrite a parameter that shadows the imported hook', async () => {
    const input = `import {useListFocus} from '@astryxdesign/core';
function wrapper(useListFocus) {
  return useListFocus({isRtl: true, keep: 1});
}`;
    const output = await apply('remove-focus-isrtl-option', input);
    expect(output).toBe(input);
  });
});

describe('move-ime-helper-import', () => {
  it('splits the helper out of a mixed hooks import', async () => {
    const input = `import {isImeKeyEvent, useFocusTrap} from '@astryxdesign/core/hooks';
const guarded = isImeKeyEvent(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toMatch(
      /import \{\s*isImeKeyEvent\s*\} from '@astryxdesign\/core\/utils'/,
    );
    expect(output).toMatch(
      /import \{\s*useFocusTrap\s*\} from '@astryxdesign\/core\/hooks'/,
    );
  });

  it('merges with an existing utilities import and preserves aliases', async () => {
    const input = `import {isImeKeyEvent as isIme, useFocusTrap} from '@astryxdesign/core/hooks';
import {mergeProps} from '@astryxdesign/core/utils';
const guarded = isIme(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toMatch(
      /import \{[^}]*mergeProps[^}]*isImeKeyEvent as isIme[^}]*\} from '@astryxdesign\/core\/utils'/s,
    );
    expect(output).not.toMatch(
      /isImeKeyEvent[^\n]*from '@astryxdesign\/core\/hooks'/,
    );
  });

  it('preserves unrelated side-effect imports', async () => {
    const input = `import './polyfill';
import {isImeKeyEvent} from '@astryxdesign/core/hooks';
const guarded = isImeKeyEvent(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toContain("import './polyfill';");
    expect(output).toContain("from '@astryxdesign/core/utils'");
  });

  it('preserves a side-effect import from the mapped hooks path', async () => {
    const input = `import '@astryxdesign/core/hooks';
import {isImeKeyEvent} from '@astryxdesign/core/hooks';
const guarded = isImeKeyEvent(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toContain("import '@astryxdesign/core/hooks';");
    expect(output).toContain("from '@astryxdesign/core/utils'");
  });

  it('creates a value import beside an existing type-only import', async () => {
    const input = `import {isImeKeyEvent} from '@astryxdesign/core/hooks';
import type {UtilityType} from '@astryxdesign/core/utils';
const guarded = isImeKeyEvent(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toContain(
      "import type {UtilityType} from '@astryxdesign/core/utils';",
    );
    expect(output).toMatch(
      /import \{\s*isImeKeyEvent\s*\} from '@astryxdesign\/core\/utils'/,
    );
    expect(() => j(output)).not.toThrow();
  });

  it('creates a named import beside an existing namespace import', async () => {
    const input = `import {isImeKeyEvent} from '@astryxdesign/core/hooks';
import * as utils from '@astryxdesign/core/utils';
const guarded = isImeKeyEvent(event);`;
    const output = await apply('move-ime-helper-import', input);
    expect(output).toContain(
      "import * as utils from '@astryxdesign/core/utils';",
    );
    expect(output).toMatch(
      /import \{\s*isImeKeyEvent\s*\} from '@astryxdesign\/core\/utils'/,
    );
    expect(() => j(output)).not.toThrow();
  });

  it('is a fixed point after the import moves', async () => {
    const input = `import {isImeKeyEvent, useFocusTrap} from '@astryxdesign/core/hooks';
const guarded = isImeKeyEvent(event);`;
    const once = await apply('move-ime-helper-import', input);
    const twice = await apply('move-ime-helper-import', once);
    expect(twice).toBe(once);
  });
});

describe('rename-resizable-pixel-bounds', () => {
  it('renames inline single-region bounds', async () => {
    const input = `import {useResizable} from '@astryxdesign/core/Resizable';
const region = useResizable({defaultSize: 240, minSizePx: 120, maxSizePx: 480});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: 120');
    expect(output).toContain('maxSize: 480');
    expect(output).not.toContain('minSizePx');
    expect(output).not.toContain('maxSizePx');
  });

  it('drops an old key when the unified key already exists', async () => {
    const input = `import {useResizable} from '@astryxdesign/core';
const region = useResizable({minSize: 160, minSizePx: 80});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output.match(/minSize:/g)).toHaveLength(1);
    expect(output).toContain('minSize: 160');
    expect(output).not.toContain('minSizePx');
  });

  it('preserves shorthand values while renaming their keys', async () => {
    const input = `import {useResizable} from '@astryxdesign/core/Resizable';
const minSizePx = 120;
const region = useResizable({minSizePx});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: minSizePx');
  });

  it('renames bounds in inline multi-region configurations', async () => {
    const input = `import {useResizable as resize} from '@astryxdesign/core/Resizable';
const regions = resize({regions: {
  nav: {defaultSize: 240, minSizePx: 120},
  detail: {defaultSize: 480, maxSizePx: 900},
}});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: 120');
    expect(output).toContain('maxSize: 900');
    expect(output).not.toContain('minSizePx: 120');
    expect(output).not.toContain('maxSizePx: 900');
  });

  it('leaves spread-bearing bounds for manual migration', async () => {
    const input = `import {useResizable} from '@astryxdesign/core/Resizable';
const legacy = {minSizePx: 160};
const region = useResizable({minSizePx: 80, ...legacy});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSizePx: 80');
    expect(output).not.toContain('minSize: 80');
    expect(output).toContain('TODO(astryx upgrade)');
  });

  it.each([
    [
      'before the alias',
      `import {useResizable} from '@astryxdesign/core/Resizable';
const key = 'minSize';
const region = useResizable({[key]: 160, minSizePx: 80});`,
    ],
    [
      'after the alias',
      `import {useResizable} from '@astryxdesign/core/Resizable';
const key = 'minSize';
const region = useResizable({minSizePx: 80, [key]: 160});`,
    ],
    [
      'inside a region',
      `import {useResizable} from '@astryxdesign/core/Resizable';
const key = 'minSize';
const regions = useResizable({regions: {nav: {[key]: 160, minSizePx: 80}}});`,
    ],
  ])(
    'leaves a computed property %s for manual migration',
    async (_label, input) => {
      const output = await apply('rename-resizable-pixel-bounds', input);
      expect(output).toContain('minSizePx: 80');
      expect(output).not.toContain('minSize: 80');
      expect(output).toContain('TODO(astryx upgrade)');
    },
  );

  it('leaves unrelated and dynamic configuration objects alone', async () => {
    const input = `import {useResizable} from '@astryxdesign/core/Resizable';
const config = {minSizePx: 120};
const region = useResizable(config);
const unrelated = {maxSizePx: 500};`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toBe(input);
  });

  it('does not rewrite a parameter that shadows the imported hook', async () => {
    const input = `import {useResizable} from '@astryxdesign/core';
function wrapper(useResizable) {
  return useResizable({minSizePx: 120, keep: 1});
}`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toBe(input);
  });

  it('renames bounds when useResizable comes from a namespace import', async () => {
    const input = `import * as Astryx from '@astryxdesign/core';
const region = Astryx.useResizable({defaultSize: 240, minSizePx: 120, maxSizePx: 480});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: 120');
    expect(output).toContain('maxSize: 480');
    expect(output).not.toContain('minSizePx');
    expect(output).not.toContain('maxSizePx');
  });

  it('leaves a namespace that does not come from Astryx alone', async () => {
    const input = `import * as Other from 'other-resizable';
const region = Other.useResizable({minSizePx: 120});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSizePx: 120');
  });

  it('does not rewrite a parameter that shadows the namespace import', async () => {
    const input = `import * as Astryx from '@astryxdesign/core';
function build(Astryx) {
  return Astryx.useResizable({minSizePx: 120});
}`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSizePx: 120');
  });

  it.each([
    ['as const', '{defaultSize: 240, minSizePx: 120} as const'],
    ['satisfies', '{defaultSize: 240, minSizePx: 120} satisfies object'],
  ])('renames a static configuration wrapped in %s', async (_label, config) => {
    const input = `import {useResizable} from '@astryxdesign/core/Resizable';
const region = useResizable(${config});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: 120');
    expect(output).not.toContain('minSizePx');
  });

  it('renames wrapped multi-region configurations', async () => {
    const input = `import {useResizable} from '@astryxdesign/core';
const regions = useResizable({regions: {
  nav: {defaultSize: 240, minSizePx: 120} as const,
} as const});`;
    const output = await apply('rename-resizable-pixel-bounds', input);
    expect(output).toContain('minSize: 120');
    expect(output).not.toContain('minSizePx');
  });
});
