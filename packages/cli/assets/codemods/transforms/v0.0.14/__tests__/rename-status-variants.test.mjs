// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../rename-status-variants.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('rename-status-variants', () => {
  it('renames direct StatusDot literals and ternary branches', async () => {
    const output = await applyTransform(`import {StatusDot} from '@astryxdesign/core';
const a = <StatusDot variant="positive" />;
const b = <StatusDot variant={'negative'} />;
const c = <StatusDot variant={ready ? 'info' : 'positive'} />;`);

    expect(output).toContain("variant='success'");
    expect(output).toContain("variant={'error'}");
    expect(output).toContain("ready ? 'accent' : 'success'");
  });

  it('renames literals inside satisfies expressions while preserving the type', async () => {
    const output =
      await applyTransform(`import {StatusDot} from '@astryxdesign/core';
const view = <StatusDot variant={'positive' satisfies StatusDotVariant} />;`);

    expect(output).toContain("{'success' satisfies StatusDotVariant}");
  });

  it('renames Icon, SVGIcon, AvatarStatusDot, and ProgressBar props', async () => {
    const output = await applyTransform(`import {
  Icon,
  SVGIcon,
  AvatarStatusDot,
  ProgressBar,
} from '@astryxdesign/core';
const view = <>
  <Icon color="negative" />
  <SVGIcon color="positive" />
  <AvatarStatusDot variant="negative" />
  <ProgressBar variant="positive" />
</>;`);

    expect(output.match(/'error'/g)).toHaveLength(2);
    expect(output.match(/'success'/g)).toHaveLength(2);
  });

  it('maps import aliases and default subpath imports', async () => {
    const output = await applyTransform(`import {StatusDot as Dot} from '@xds/core';
import IconGlyph from '@astryxdesign/core/Icon';
const view = <><Dot variant="positive" /><IconGlyph color="negative" /></>;`);

    expect(output).toContain("<Dot variant='success'");
    expect(output).toContain("<IconGlyph color='error'");
  });

  it('maps namespace imports', async () => {
    const output = await applyTransform(`import * as Core from '@astryxdesign/core';
const view = <Core.StatusDot variant="info" />;`);

    expect(output).toContain("variant='accent'");
  });

  it('keeps Badge info distinct while renaming its removed variants', async () => {
    const output = await applyTransform(`import {Badge} from '@astryxdesign/core';
const view = <>
  <Badge variant="info" />
  <Badge variant="positive" />
  <Badge variant="negative" />
</>;`);

    expect(output).toContain('variant="info"');
    expect(output).toContain("variant='success'");
    expect(output).toContain("variant='error'");
  });

  it('leaves variables, helpers, objects, types, and Storybook metadata untouched', async () => {
    const input = `import {StatusDot} from '@astryxdesign/core';
type CellTone = 'positive' | 'negative' | 'info';
const args = {variant: 'positive'};
const options = ['positive', 'negative', 'info'];
function tone() { return 'negative' as const; }
const view = <StatusDot variant={tone()} />;`;

    expect(await applyTransform(input)).toBe(input);
  });

  it('leaves unrelated props untouched', async () => {
    const output = await applyTransform(`import {StatusDot} from '@astryxdesign/core';
const view = <StatusDot variant="positive" label="positive" />;`);

    expect(output).toContain("variant='success'");
    expect(output).toContain('label="positive"');
  });

  it('ignores same-named components imported from other packages', async () => {
    const input = `import {StatusDot} from '@other/core';
const view = <StatusDot variant="positive" />;`;
    expect(await applyTransform(input)).toBe(input);
  });

  it('ignores a local component that shadows an imported alias', async () => {
    const output = await applyTransform(`import {StatusDot as Dot} from '@xds/core';
const migrated = <Dot variant="positive" />;
function Local(Dot) { return <Dot variant="negative" />; }`);

    expect(output).toContain("variant='success'");
    expect(output).toContain('variant="negative"');
  });

  it('returns undefined when no direct prop needs a change', async () => {
    const jscodeshift = (await import('jscodeshift')).default;
    const j = jscodeshift.withParser('tsx');
    const source = `import {StatusDot} from '@astryxdesign/core';
const view = <StatusDot variant="success" />;`;
    expect(
      transform(
        {source, path: 'test.tsx'},
        {jscodeshift: j, stats: () => {}, report: () => {}},
      ),
    ).toBeUndefined();
  });
});
