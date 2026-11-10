// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Link.tooltipLoad.test.tsx
 * @output Tests that importing Link does not load the Tooltip, and that
 *   a Link with a tooltip loads it once mounted
 * @position Validates Link's on-demand tooltip import (FR10, PR2); the
 *   description and mount cases are in Link.test.tsx. Each test starts from
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

describe('Link tooltip loading (PR1)', () => {
  it('importing Link loads no Tooltip', async () => {
    const {Link} = await import('./Link');
    render(<Link href="/save">Save</Link>);
    await settle();
    expect(loads.useTooltip).toBe(0);
  });

  it('a Link with a tooltip loads it after mount', async () => {
    const {Link} = await import('./Link');
    render(
      <Link href="/save" tooltip="Save your changes">
        Save
      </Link>,
    );
    await waitFor(() => expect(loads.useTooltip).toBe(1), {timeout: 8000});
  }, 15000);
});
