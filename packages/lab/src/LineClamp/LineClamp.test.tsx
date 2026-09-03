// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LineClamp.test.tsx
 * @input Uses vitest, @testing-library/react, LineClamp component
 * @output Unit tests for LineClamp component behavior
 * @position Testing; validates LineClamp.tsx implementation
 *
 * SYNC: When LineClamp.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {LineClamp} from './LineClamp';

// jsdom has no layout engine, so content never actually overflows and
// isTruncated stays false — same constraint core's Text.test.tsx works
// under for the same useTruncation hook. These tests cover the
// non-truncated (default) rendering path; the tooltip-on-truncation path is
// exercised manually in Storybook.
describe('LineClamp', () => {
  it('renders children', () => {
    render(<LineClamp maxLines={2}>Some clamped content</LineClamp>);
    expect(screen.getByText('Some clamped content')).toBeInTheDocument();
  });

  it('renders arbitrary mixed children, not just plain text', () => {
    render(
      <LineClamp maxLines={2}>
        Some <strong>mixed</strong> inline content
      </LineClamp>,
    );
    expect(screen.getByText('mixed')).toBeInTheDocument();
  });

  it('renders as a div by default', () => {
    render(<LineClamp maxLines={2}>Content</LineClamp>);
    expect(screen.getByText('Content').tagName).toBe('DIV');
  });

  it('renders as the element passed via `as`', () => {
    render(
      <LineClamp maxLines={2} as="span">
        Content
      </LineClamp>,
    );
    expect(screen.getByText('Content').tagName).toBe('SPAN');
  });

  it('applies -webkit-line-clamp with the given maxLines', () => {
    render(<LineClamp maxLines={3}>Content</LineClamp>);
    const el = screen.getByText('Content');
    expect(el.style.webkitLineClamp).toBe('3');
  });

  it('does not set a title/tooltip when content is not truncated', () => {
    render(<LineClamp maxLines={2}>Short</LineClamp>);
    expect(screen.getByText('Short')).not.toHaveAttribute('title');
  });

  it('forwards ref to the root element', () => {
    const ref = vi.fn();
    render(
      <LineClamp maxLines={2} ref={ref}>
        Content
      </LineClamp>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('forwards xstyle/className/style to the root element', () => {
    render(
      <LineClamp maxLines={2} className="custom-class">
        Content
      </LineClamp>,
    );
    expect(screen.getByText('Content')).toHaveClass('custom-class');
  });

  // jsdom still can't lay out real text, so `-webkit-line-clamp` never
  // actually clips anything here — but the tab-order fix (#4259) reacts to
  // plain geometry (getBoundingClientRect), not to useTruncation's
  // isTruncated flag, so it's fully testable by mocking that geometry: a
  // container rect and a descendant rect are all the effect ever reads.
  // Each mock is installed and only then followed by a `rerender` (never
  // relying on the initial `render`'s own effect pass), since jsdom's
  // default all-zero rects would otherwise make the very first pass see a
  // coincidental "clipped" reading (0 >= 0) regardless of scenario.
  describe('keeps a clipped focusable descendant out of the tab order (#4259)', () => {
    function mockRects(rects: Map<Element, {top: number; bottom: number}>) {
      return vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          const rect = rects.get(this) ?? {top: 0, bottom: 0};
          return {
            ...rect,
            left: 0,
            right: 0,
            width: 0,
            height: rect.bottom - rect.top,
            x: 0,
            y: rect.top,
            toJSON() {
              return this;
            },
          } as DOMRect;
        });
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('hides a link whose top falls at or past the clamp box bottom edge', () => {
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );
      const container = screen.getByTestId('clamp');
      const link = screen.getByText('Read more');
      mockRects(
        new Map([
          [container, {top: 0, bottom: 40}],
          [link, {top: 40, bottom: 56}], // top === container's bottom: clipped
        ]),
      );
      rerender(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );

      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link).toHaveAttribute('aria-hidden', 'true');
    });

    it('leaves a visible link in the tab order untouched', () => {
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );
      const container = screen.getByTestId('clamp');
      const link = screen.getByText('Read more');
      mockRects(
        new Map([
          [container, {top: 0, bottom: 40}],
          [link, {top: 20, bottom: 36}], // fully above the bottom edge: visible
        ]),
      );
      rerender(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );

      expect(link).not.toHaveAttribute('tabindex');
      expect(link).not.toHaveAttribute('aria-hidden');
    });

    it("restores a link's own original tabIndex once it's no longer clipped", () => {
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text{' '}
          <a href="/more" tabIndex={3}>
            Read more
          </a>
        </LineClamp>,
      );
      const container = screen.getByTestId('clamp');
      const link = screen.getByText('Read more');
      const rectMap = new Map([
        [container, {top: 0, bottom: 40}],
        [link, {top: 40, bottom: 56}],
      ]);
      mockRects(rectMap);
      rerender(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text{' '}
          <a href="/more" tabIndex={3}>
            Read more
          </a>
        </LineClamp>,
      );
      expect(link).toHaveAttribute('tabindex', '-1');

      // Move the link above the fold and force another render.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(
        <LineClamp maxLines={2} data-testid="clamp" hasTooltip={false}>
          Some text{' '}
          <a href="/more" tabIndex={3}>
            Read more
          </a>
        </LineClamp>,
      );

      expect(link).toHaveAttribute('tabindex', '3');
      expect(link).not.toHaveAttribute('aria-hidden');
    });
  });
});
