// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.tooltipLoad.test.tsx
 * @output Tests that importing Button does not load the Tooltip, and that
 *   a Button with a tooltip loads it once mounted
 * @position Validates Button's on-demand tooltip import (FR12, PR2); the
 *   description and mount cases are in Button.test.tsx. Each test starts from
 *   a fresh module registry.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {act, render, waitFor} from '@testing-library/react';

const loads = {useTooltip: 0};

beforeEach(() => {
  vi.resetModules();
  loads.useTooltip = 0;
  vi.doUnmock('../Tooltip/useTooltip');
  vi.doMock('../Tooltip/useTooltip', async importOriginal => {
    loads.useTooltip += 1;
    return importOriginal();
  });
});

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

describe('Button tooltip loading (PR1)', () => {
  it('importing Button loads no Tooltip', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Save" />);
    await settle();
    expect(loads.useTooltip).toBe(0);
  });

  it('a Button with a tooltip loads it after mount', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await waitFor(() => expect(loads.useTooltip).toBe(1), {timeout: 8000});
  }, 15000);
});
