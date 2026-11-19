// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {
  compareVersions,
  defineNativeTheme,
  resolveNativeTheme,
} from './defineNativeTheme.js';

const theme = {name: 'brand', tokens: {'--color-accent': '#0064e0'}};

describe('defineNativeTheme', () => {
  it('scopes a version-specific material and resolves it per OS version', () => {
    const native = defineNativeTheme(
      theme,
      {
        material: 'translucent',
        platforms: {
          ios: [{minVersion: '26', material: 'liquidGlass'}],
          android: [{material: 'opaque'}],
        },
      },
      {onReport: () => {}},
    );
    expect(
      resolveNativeTheme(native, {platform: 'ios', osVersion: '26.1'}).material,
    ).toBe('liquidGlass');
    expect(
      resolveNativeTheme(native, {platform: 'ios', osVersion: '18.6'}).material,
    ).toBe('translucent');
    expect(
      resolveNativeTheme(native, {platform: 'android', osVersion: '16'})
        .material,
    ).toBe('opaque');
    expect(
      resolveNativeTheme(native, {platform: 'windows', osVersion: '11'})
        .material,
    ).toBe('translucent');
  });

  it('rejects a platform feature outside the versions that have it', () => {
    expect(() =>
      defineNativeTheme(
        theme,
        {platforms: {ios: [{material: 'liquidGlass'}]}},
        {onReport: () => {}},
      ),
    ).toThrow(/liquidGlass.*minVersion: '26'/);
  });

  it('reports web-only theme parts and keeps only the portable part', () => {
    const report = vi.fn();
    const webTheme = {
      ...theme,
      components: {Button: {root: {}}},
      icons: {},
      __onDark: {x: 1},
    };
    const native = defineNativeTheme(webTheme, {}, {onReport: report});
    expect(report.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('"components" is web-only'),
      expect.stringContaining('"onDark" is web-only'),
    ]);
    expect(native.theme).toEqual(theme);
  });

  it('extends another native theme: durable members merge, platform lists replace', () => {
    const base = defineNativeTheme(theme, {
      material: 'opaque',
      platforms: {android: [{material: 'translucent'}]},
    });
    const child = defineNativeTheme(
      theme,
      {platforms: {ios: [{material: 'opaque'}]}},
      {extends: base},
    );
    expect(child.config.material).toBe('opaque');
    expect(child.config.platforms?.android).toEqual([
      {material: 'translucent'},
    ]);
    expect(child.config.platforms?.ios).toEqual([{material: 'opaque'}]);
  });

  it('compares dotted versions numerically', () => {
    expect(compareVersions('26', '26.0.1')).toBeLessThan(0);
    expect(compareVersions('10.15', '10.9')).toBeGreaterThan(0);
  });
});
