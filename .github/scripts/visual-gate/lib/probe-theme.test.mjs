// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {buildProbeComponents, probeColor, unionValues} from './probe-theme.mjs';

describe('unionValues', () => {
  it('reads an inline string union', () => {
    expect(unionValues("'sm' | 'md' | 'lg'")).toEqual(['sm', 'md', 'lg']);
  });

  it('resolves a named alias, so a doc that says `size: AvatarSize` is still probed', () => {
    expect(unionValues('AvatarSize', {AvatarSize: ['sm', 'lg']})).toEqual([
      'sm',
      'lg',
    ]);
  });

  it('ignores a single-literal type — that is a constant, not a variant axis', () => {
    expect(unionValues("'only'")).toEqual([]);
  });

  it('ignores a type with no enumerable values', () => {
    expect(unionValues('number')).toEqual([]);
    expect(unionValues(undefined)).toEqual([]);
  });
});

describe('probeColor', () => {
  it('is deterministic, so a baseline stays comparable across runs', () => {
    expect(probeColor('badge.base')).toBe(probeColor('badge.base'));
  });

  it('gives different selectors different colours, so two targets that collapse into one element show it', () => {
    expect(probeColor('badge.base')).not.toBe(
      probeColor('badge.variant:error'),
    );
  });

  it('honours a pinned lightness, so text stays readable against its own fill', () => {
    expect(probeColor('x', {lightness: 12})).toMatch(/12%\)$/);
  });
});

describe('buildProbeComponents', () => {
  const targets = [
    {key: 'badge', component: 'Badge', props: ['variant'], states: []},
    {
      key: 'switch',
      component: 'Switch',
      props: [],
      states: ['checked', 'disabled'],
    },
  ];
  const props = {Badge: [{name: 'variant', type: "'info' | 'error'"}]};

  it('covers every target with a base selector', () => {
    const {components} = buildProbeComponents(targets, props);
    expect(Object.keys(components).sort()).toEqual(['badge', 'switch']);
    expect(components.badge.base).toBeDefined();
    expect(components.switch.base).toBeDefined();
  });

  it('expands a variant prop into one selector per documented value', () => {
    const {components} = buildProbeComponents(targets, props);
    expect(Object.keys(components.badge).sort()).toEqual([
      'base',
      'variant:error',
      'variant:info',
    ]);
  });

  it('covers every declared state', () => {
    const {components} = buildProbeComponents(targets, props);
    expect(Object.keys(components.switch).sort()).toEqual([
      'base',
      'checked',
      'disabled',
    ]);
  });

  it('paints text and background differently, so an invisible-text regression is still visible', () => {
    const {components} = buildProbeComponents(targets, props);
    expect(components.badge.base.color).not.toBe(
      components.badge.base.backgroundColor,
    );
  });

  it('gives Popover a radius probe so the painted surface ownership is visible', () => {
    const {components} = buildProbeComponents(
      [{key: 'popover', component: 'Popover', props: [], states: []}],
      {},
    );
    expect(components.popover.base.borderRadius).toBe('32px');
  });

  it('reports a visual prop it cannot enumerate instead of dropping it silently', () => {
    const {coverage} = buildProbeComponents(
      [{key: 'stack', component: 'Stack', props: ['gap'], states: []}],
      {Stack: []},
    );
    expect(coverage.skipped).toEqual([
      {
        key: 'stack',
        prop: 'gap',
        reason: expect.stringContaining('not a documented prop'),
      },
    ]);
  });

  it('counts what it covered, which is what the CI guard asserts', () => {
    const {coverage} = buildProbeComponents(targets, props);
    expect(coverage).toMatchObject({targets: 2, selectors: 6});
  });

  it('is deterministic — same docs, same theme, so regeneration is a no-op diff', () => {
    expect(buildProbeComponents(targets, props)).toEqual(
      buildProbeComponents(targets, props),
    );
  });
});
