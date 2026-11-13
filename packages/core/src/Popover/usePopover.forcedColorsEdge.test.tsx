// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePopover.forcedColorsEdge.test.tsx
 * @input usePopover's painted surface and the CSS rules StyleX injects
 * @output Proof that the surface's forced-colors border sets no border width
 *   or style outside forced colors, so a caller's own border keeps showing
 * @position Unit evidence for the Popover forced-colors edge
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {usePopover} from './usePopover';

const original = {
  show: HTMLElement.prototype.showPopover,
  hide: HTMLElement.prototype.hidePopover,
};

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn();
  HTMLElement.prototype.hidePopover = vi.fn();
});

afterAll(() => {
  HTMLElement.prototype.showPopover = original.show;
  HTMLElement.prototype.hidePopover = original.hide;
});

function collectCssText(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        out += rule.cssText + '\n';
      }
    } catch {
      // A cross-origin sheet has no readable rules.
    }
  }
  return (
    out +
    Array.from(document.querySelectorAll('style'))
      .map(s => s.textContent || '')
      .join('\n')
  );
}

/** The border width and style declarations of `el` outside any @media rule. */
function borderDeclarationsOutsideMedia(el: Element): string[] {
  const css = collectCssText().replace(
    /@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g,
    '',
  );
  return Array.from(el.classList).flatMap(cls =>
    Array.from(
      css.matchAll(
        new RegExp(`\\.${cls}(?![0-9a-z_-])[^{]*\\{([^}]*)\\}`, 'gi'),
      ),
      m => m[1],
    )
      .join(';')
      .split(';')
      .map(d => d.replace(/\s+/g, ''))
      .filter(d => /^border-(width|style):/.test(d)),
  );
}

function HeadlessPopover() {
  const popover = usePopover({dialogLabel: 'Filters'});
  return (
    <>
      <button
        type="button"
        ref={popover.triggerRef}
        onClick={() => popover.show()}
        {...popover.triggerProps}>
        Open
      </button>
      {popover.render(<span>Content</span>)}
    </>
  );
}

it('sets no border width or style on the surface outside forced colors', () => {
  render(<HeadlessPopover />);
  fireEvent.click(screen.getByRole('button', {name: 'Open'}));
  const surface = screen.getByRole('dialog', {name: 'Filters', hidden: true});
  expect(borderDeclarationsOutsideMedia(surface)).toEqual([]);
});
