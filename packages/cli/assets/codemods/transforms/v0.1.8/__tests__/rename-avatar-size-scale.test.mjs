// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../rename-avatar-size-scale.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('rename-avatar-size-scale', () => {
  it('renames every direct Avatar size literal', async () => {
    const output =
      await applyTransform(`import {Avatar} from '@astryxdesign/core';
const a = <Avatar name="A" size="tiny" />;
const b = <Avatar name="B" size="xsmall" />;
const c = <Avatar name="C" size="small" />;
const d = <Avatar name="D" size="medium" />;
const e = <Avatar name="E" size="large" />;`);

    for (const size of ['xsm', 'sm', 'md', 'lg', 'xl']) {
      expect(output).toContain(`size='${size}'`);
    }
  });

  it('renames literals inside satisfies expressions while preserving the type', async () => {
    const output =
      await applyTransform(`import {Avatar} from '@astryxdesign/core';
const view = <Avatar size={'small' satisfies AvatarSize} />;`);

    expect(output).toContain("{'md' satisfies AvatarSize}");
  });

  it('renames AvatarGroup and conditional literals', async () => {
    const output =
      await applyTransform(`import {AvatarGroup} from '@astryxdesign/core';
const view = <AvatarGroup size={large ? 'large' : 'small'}>{kids}</AvatarGroup>;`);

    expect(output).toContain("large ? 'xl' : 'md'");
  });

  it('maps import aliases and default subpath imports', async () => {
    const output =
      await applyTransform(`import {Avatar as Face} from '@xds/core';
import Faces from '@astryxdesign/core/AvatarGroup';
const view = <><Face size="medium" /><Faces size="large" /></>;`);

    expect(output).toContain("<Face size='lg'");
    expect(output).toContain("<Faces size='xl'");
  });

  it('ignores declaration-level type imports paired with a local Avatar', async () => {
    const input = `import type {Avatar} from '@astryxdesign/core';
const Avatar = props => <div {...props} />;
const view = <Avatar size="small" />;`;

    expect(await applyTransform(input)).toBe(input);
  });

  it('ignores mixed type specifiers while migrating runtime imports', async () => {
    const output =
      await applyTransform(`import {type Avatar, AvatarGroup} from '@astryxdesign/core';
const Avatar = props => <div {...props} />;
const view = <><Avatar size="small" /><AvatarGroup size="large" /></>;`);

    expect(output).toContain('<Avatar size="small"');
    expect(output).toContain("<AvatarGroup size='xl'");
  });

  it('maps namespace imports', async () => {
    const output =
      await applyTransform(`import * as Core from '@astryxdesign/core';
const view = <Core.Avatar size="small" />;`);

    expect(output).toContain("size='md'");
  });

  it('leaves numeric and dynamic sizes untouched', async () => {
    const input = `import {Avatar} from '@astryxdesign/core';
const named = 'small';
const a = <Avatar size={48} />;
const b = <Avatar size={named} />;`;
    expect(await applyTransform(input)).toBe(input);
  });

  it('leaves objects, types, arrays, and Storybook metadata untouched', async () => {
    const input = `import {Avatar} from '@astryxdesign/core';
type Density = 'tiny' | 'xsmall' | 'small' | 'medium' | 'large';
const card = {size: 'small'};
const sizes = ['tiny', 'xsmall', 'small', 'medium', 'large'];
const meta = {argTypes: {size: {options: sizes}}};
const view = <Avatar size={card.size} />;`;

    expect(await applyTransform(input)).toBe(input);
  });

  it('does not touch files without an Avatar import', async () => {
    const input = `import {Badge} from '@astryxdesign/core';
const view = <Badge size="small" />;`;
    expect(await applyTransform(input)).toBe(input);
  });

  it('ignores same-named components imported from other packages', async () => {
    const input = `import {Avatar} from '@other/core';
const view = <Avatar size="small" />;`;
    expect(await applyTransform(input)).toBe(input);
  });

  it('ignores a local component that shadows an imported alias', async () => {
    const output =
      await applyTransform(`import {Avatar as Face} from '@xds/core';
const migrated = <Face size="medium" />;
function Local(Face) { return <Face size="large" />; }`);

    expect(output).toContain("size='lg'");
    expect(output).toContain('size="large"');
  });

  it('leaves unrelated props on Avatar untouched', async () => {
    const output =
      await applyTransform(`import {Avatar} from '@astryxdesign/core';
const view = <Avatar size="small" label="small" />;`);

    expect(output).toContain("size='md'");
    expect(output).toContain('label="small"');
  });
});
