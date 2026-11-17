// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file containerPressOverlay.test.tsx
 * @input vitest (jsdom), React Testing Library, ClickableCard, SelectableCard
 *   and Thumbnail
 * @output Checks the corners of the shared card and thumbnail press overlay:
 *   ClickableCard's overlay stays square, because its card clips it; the
 *   overlays of SelectableCard and Thumbnail, which do not clip, follow their
 *   own corner radius. The pixels are checked in a real browser.
 * @position Testing; validates containerPressOverlayStyles
 *   (privateAttributes/press.stylex.ts) through its users
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {getAllInjectedCss} from './forcedColors';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {SelectableCard} from '../SelectableCard/SelectableCard';
import {Thumbnail} from '../Thumbnail/Thumbnail';

/** Whether one of the element's own classes rounds its `::after`. */
function roundsOverlay(element: Element): boolean {
  const css = getAllInjectedCss();
  return Array.from(element.classList).some(className => {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `\\.${escaped}(?::not\\(#\\\\#\\))*::after\\s*\\{[^}]*border-radius:\\s*inherit`,
    ).test(css);
  });
}

function overlayElement(inside: Element): Element {
  const found = inside.closest('[data-astryx-pressable]');
  if (found == null) {
    throw new Error('no pressable element around the element');
  }
  return found;
}

describe('the card and thumbnail press overlay corners', () => {
  it('keeps ClickableCard’s overlay square, for its card to clip', () => {
    render(
      <ClickableCard label="Open billing" onClick={() => {}}>
        <span>Surface</span>
      </ClickableCard>,
    );
    expect(roundsOverlay(overlayElement(screen.getByText('Surface')))).toBe(
      false,
    );
  });

  it('rounds SelectableCard’s overlay to its own corners', () => {
    render(
      <SelectableCard label="Plan" isSelected={false} onChange={() => {}}>
        <span>Surface</span>
      </SelectableCard>,
    );
    expect(roundsOverlay(overlayElement(screen.getByText('Surface')))).toBe(
      true,
    );
  });

  it('rounds Thumbnail’s overlay to its own corners', () => {
    render(<Thumbnail src="/photo.jpg" alt="Surface" onClick={() => {}} />);
    expect(
      roundsOverlay(overlayElement(screen.getByRole('img', {name: 'Surface'}))),
    ).toBe(true);
  });
});
