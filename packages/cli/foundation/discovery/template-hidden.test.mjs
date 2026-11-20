// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {discoverCoreTemplates} from './template-adapter.mjs';

describe('discovered page templates carry isHiddenFromOverview as hidden', () => {
  it('marks a page its doc keeps off the gallery, and no other page', async () => {
    const pages = (await discoverCoreTemplates()).filter(
      t => t.type === 'page',
    );
    const showcase = pages.find(t => t.dirName === 'theme-showcase');
    const dashboard = pages.find(t => t.dirName === 'dashboard');
    expect(showcase?.hidden).toBe(true);
    expect(dashboard?.hidden).toBe(false);
  });
});
