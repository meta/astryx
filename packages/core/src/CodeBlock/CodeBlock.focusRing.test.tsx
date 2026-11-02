// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.focusRing.test.tsx
 * @input Uses CodeBlock and the inset focus-ring test helper
 * @output Tests that the code viewport draws the shared focus ring, inset so
 *   the root's clip does not cut it
 * @position Colocated test; the ring's geometry is checked in a real browser
 */

import {describe, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {CodeBlock} from './CodeBlock';
import {expectInsetSharedFocusRing} from '../__tests__/insetFocusRing';

describe('CodeBlock: the code viewport draws the shared focus ring', () => {
  it('inset inside the clipped root', () => {
    render(<CodeBlock code="const a = 1;" language="ts" />);
    expectInsetSharedFocusRing(screen.getByRole('group', {hidden: true}));
  });
});
