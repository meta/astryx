// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.swipeReducedMotion.test.tsx
 * @input Item with swipe actions under a theme, the swipe gesture hook, spied
 * @output Verifies the swipe layer settles a row at once under a theme with
 *   `reducedMotion: 'always'` with the person's setting off, as it does under
 *   the setting
 * @position Companion to Item.swipeLayer.test.tsx for the swipe layer's
 *   reduced-motion read
 */

import {describe, expect, it, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import {defineTheme} from '../theme/defineTheme';
import {ALWAYS_TEMPO} from '../theme/reducedMotionAlways.testing';
import {Theme} from '../theme/Theme';
import {Item} from './Item';
import type * as SwipeAction from './useSwipeAction';

// No public theme can set reducedMotion yet: a theme with ALWAYS_TEMPO
// resolves to 'always' through this mock.
vi.mock('../theme/themeMotion', async importOriginal => {
  const {resolvingAlways} =
    await import('../theme/reducedMotionAlways.testing');
  return resolvingAlways(await importOriginal());
});

const {reducedMotionReads} = vi.hoisted(() => ({
  reducedMotionReads: [] as (boolean | undefined)[],
}));

vi.mock('./useSwipeAction', async importOriginal => {
  const actual = await importOriginal<typeof SwipeAction>();
  return {
    ...actual,
    useSwipeAction: (options: Parameters<typeof actual.useSwipeAction>[0]) => {
      reducedMotionReads.push(options.isReducedMotion);
      return actual.useSwipeAction(options);
    },
  };
});

const still = defineTheme({
  name: 'SwipeStill',
  motion: {tempo: ALWAYS_TEMPO},
});
const moving = defineTheme({name: 'SwipeMoving', motion: {tempo: 1.2}});

async function renderRowUnder(theme: typeof still) {
  reducedMotionReads.length = 0;
  const view = render(
    <Theme theme={theme}>
      <Item
        label="Inbox"
        data-testid="row"
        swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
      />
    </Theme>,
  );
  await waitFor(() => {
    expect(
      screen.getByTestId('row').querySelector('[data-swipe-panel="trailing"]'),
    ).not.toBeNull();
  });
  return view;
}

describe('the swipe layer and reduced motion', () => {
  it("settles at once under a theme with reducedMotion: 'always', with the setting off", async () => {
    await renderRowUnder(still);
    expect(reducedMotionReads.at(-1)).toBe(true);
  });

  it('animates its settle under a theme that leaves reduced motion to the setting', async () => {
    await renderRowUnder(moving);
    expect(reducedMotionReads.at(-1)).toBe(false);
  });
});
