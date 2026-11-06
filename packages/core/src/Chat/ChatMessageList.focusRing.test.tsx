// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageList.focusRing.test.tsx
 * @input Uses ChatMessageList, Tooltip, HoverCard, focusOutlineStyles
 * @output Tests that the chat log and the text-only Tooltip and HoverCard
 *   trigger spans draw the shared focus ring
 * @position Colocated test; the ring's geometry is checked in a real browser
 *
 * jsdom does not match `:focus-visible`, so these pin the composition: each
 * tab stop carries the atomic classes the ring compiles to.
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {focusVars} from '../theme/tokens.stylex';
import {ChatMessageList} from './ChatMessageList';
import {Tooltip} from '../Tooltip';
import {HoverCard} from '../HoverCard';

const inset = stylex.create({
  ring: {
    outlineOffset: {
      default: null,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
});

// Debug class names name their source file; only the atoms matter.
const atoms = (className: string | undefined) =>
  (className ?? '').split(' ').filter(c => c !== '' && !c.includes('__'));

function expectAtoms(el: Element, expected: string[]) {
  const classes = el.className.split(' ');
  for (const c of expected) {
    expect(classes).toContain(c);
  }
}

describe('Astryx-made tab stops draw the shared focus ring', () => {
  it('the chat log, inset inside the area that scrolls it', () => {
    render(
      <ChatMessageList>
        <p>Hello</p>
      </ChatMessageList>,
    );
    expectAtoms(
      screen.getByRole('log'),
      atoms(
        stylex.props(focusOutlineStyles.focusVisible, inset.ring).className,
      ),
    );
  });

  it('the text-only Tooltip trigger', () => {
    render(<Tooltip content="More about it">plain text</Tooltip>);
    expectAtoms(
      screen.getByText('plain text'),
      atoms(stylex.props(focusOutlineStyles.focusVisible).className),
    );
  });

  it('the text-only HoverCard trigger', () => {
    render(<HoverCard content={<p>Card</p>}>plain text</HoverCard>);
    expectAtoms(
      screen.getByText('plain text'),
      atoms(stylex.props(focusOutlineStyles.focusVisible).className),
    );
  });
});
