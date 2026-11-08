// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icons.test.tsx
 * @input Uses vitest, @testing-library/react, Theme, defineTheme, CommentIcon
 * @output Tests which source draws a Comments glyph
 * @position Testing; validates icons.tsx
 */

import {afterEach, describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {resetIcons} from '@astryxdesign/core/Icon';
import {defineTheme, Theme} from '@astryxdesign/core/theme';
import {CommentIcon} from './icons';

describe('CommentIcon', () => {
  afterEach(() => {
    resetIcons();
  });

  it('draws the bundled glyph when no theme entry answers the key', () => {
    const {container} = render(<CommentIcon name="reply" />);

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it("draws a theme's node entry for the key", () => {
    const theme = defineTheme({
      name: 'comment-icons-node',
      icons: {'comment:reply': <span data-testid="themed">reply</span>},
    });

    render(
      <Theme theme={theme}>
        <CommentIcon name="reply" />
      </Theme>,
    );

    expect(screen.getByTestId('themed')).toBeInTheDocument();
  });

  it("calls a theme's function entry at the glyph's size", () => {
    const theme = defineTheme({
      name: 'comment-icons-function',
      icons: {
        'comment:reply': ({size}) => <span data-testid="themed">{size}</span>,
      },
    });

    render(
      <Theme theme={theme}>
        <CommentIcon name="reply" size="xsm" />
      </Theme>,
    );

    expect(screen.getByTestId('themed')).toHaveTextContent('xsm');
  });

  it('draws nothing when the selected function entry returns null', () => {
    // spec:AST-087 FR6: a selected function's result is final, so the bundled
    // glyph does not stand in for it.
    const theme = defineTheme({
      name: 'comment-icons-null',
      icons: {'comment:reply': () => null},
    });

    const {container} = render(
      <Theme theme={theme}>
        <CommentIcon name="reply" />
      </Theme>,
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.astryx-icon')).toBeNull();
  });
});
