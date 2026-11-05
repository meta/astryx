// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LineClamp.test.tsx
 * @input Uses vitest, @testing-library/react, LineClamp component
 * @output Unit tests for LineClamp component behavior
 * @position Testing; validates LineClamp.tsx implementation
 *
 * SYNC: When LineClamp.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {useState} from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {LineClamp} from './LineClamp';

// jsdom has no layout engine, so content never actually overflows and
// isTruncated stays false, the same constraint core's Text.test.tsx works
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
  // actually clips anything here, but the tab-order fix reacts to
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

      expect(link).toHaveAttribute('inert');
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

      expect(link).not.toHaveAttribute('inert');
    });

    it('makes a link reachable again once it is no longer clipped', () => {
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp">
          Some text <a href="/more">Read more</a>
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
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );
      expect(link).toHaveAttribute('inert');

      // Move the link above the fold and force another render.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(
        <LineClamp maxLines={2} data-testid="clamp" hasTruncateTooltip={false}>
          Some text <a href="/more">Read more</a>
        </LineClamp>,
      );

      expect(link).not.toHaveAttribute('inert');
      expect(link).not.toHaveAttribute('data-line-clamp-hidden');
    });

    it('hides a descendant a child re-enables past the fold after mount', async () => {
      // Only the late link is placed past the fold; everything else sits
      // above it. Enabling it changes an attribute only: no text change, no
      // LineClamp render, no resize, so only the mutation observer can see it.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
          const isLate = this.textContent === 'Late link';
          const isClamp = this.getAttribute('data-testid') === 'clamp';
          const top = isLate ? 40 : 0;
          const bottom = isClamp ? 40 : top + 16;
          return {
            top,
            bottom,
            left: 0,
            right: 0,
            width: 0,
            height: 16,
          } as DOMRect;
        },
      );
      function Late() {
        const [on, setOn] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOn(true)}>
              Reveal
            </button>
            <a href={on ? '/late' : undefined}>Late link</a>
          </>
        );
      }
      render(
        <LineClamp maxLines={2} data-testid="clamp">
          <Late />
        </LineClamp>,
      );
      fireEvent.click(screen.getByText('Reveal'));
      const late = screen.getByText('Late link');
      await waitFor(() => {
        expect(late).toHaveAttribute('inert');
      });
    });

    it("never rewrites a caller's tabIndex or aria-hidden, clipped or not", () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const props = {
        maxLines: 2,
        'data-testid': 'clamp',
        hasTruncateTooltip: false,
      };
      const link = (
        <a href="/more" tabIndex={-1} aria-hidden="true">
          Read more
        </a>
      );
      const {rerender} = render(<LineClamp {...props}>{link}</LineClamp>);
      const anchor = screen.getByText('Read more');
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(anchor, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(<LineClamp {...props}>{link}</LineClamp>);
      expect(anchor).toHaveAttribute('inert');
      expect(anchor).toHaveAttribute('tabindex', '-1');
      expect(anchor).toHaveAttribute('aria-hidden', 'true');

      rectMap.set(anchor, {top: 10, bottom: 26});
      rerender(
        <LineClamp {...props} maxLines={3}>
          {link}
        </LineClamp>,
      );
      expect(anchor).not.toHaveAttribute('inert');
      expect(anchor).toHaveAttribute('tabindex', '-1');
      expect(anchor).toHaveAttribute('aria-hidden', 'true');
    });

    it('hides a link that was clipped while it held focus once focus leaves it', () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp" hasTruncateTooltip={false}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      const link = screen.getByText('Read more');
      link.focus();
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(
        <LineClamp maxLines={2} data-testid="clamp" hasTruncateTooltip={false}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      // Skipped while it holds focus.
      expect(link).not.toHaveAttribute('inert');

      link.blur();
      expect(link).toHaveAttribute('inert');
    });

    it('hides a clipped summary and a clipped contenteditable, which Core counts as focusable', () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const props = {
        maxLines: 2,
        'data-testid': 'clamp',
        hasTruncateTooltip: false,
      };
      const {rerender} = render(
        <LineClamp {...props}>
          <details>
            <summary>More</summary>
            Body
          </details>
          <span contentEditable suppressContentEditableWarning>
            Edit
          </span>
        </LineClamp>,
      );
      const summary = screen.getByText('More');
      const editable = screen.getByText('Edit');
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(summary, {top: 40, bottom: 56});
      rectMap.set(editable, {top: 60, bottom: 76});
      mockRects(rectMap);
      rerender(
        <LineClamp {...props}>
          <details>
            <summary>More</summary>
            Body
          </details>
          <span contentEditable suppressContentEditableWarning>
            Edit
          </span>
        </LineClamp>,
      );

      expect(summary).toHaveAttribute('inert');
      expect(editable).toHaveAttribute('inert');
    });

    it('keeps a link inert that the clamp restored and hid again in one task', async () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const props = {
        maxLines: 2,
        'data-testid': 'clamp',
        hasTruncateTooltip: false,
      };
      // A fresh element each time, so React renders again and the clamp syncs.
      const content = () => (
        <LineClamp {...props}>
          <a href="/more">Read more</a>
        </LineClamp>
      );
      const {rerender} = render(content());
      const link = screen.getByText('Read more');
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(content());
      await waitFor(() => {
        expect(link).toHaveAttribute('inert');
      });

      // Visible and clipped again before the observer reports either write.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(content());
      expect(link).not.toHaveAttribute('inert');
      rectMap.set(link, {top: 40, bottom: 56});
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });

      expect(link).toHaveAttribute('inert');
      expect(link).toHaveAttribute('data-line-clamp-hidden');

      // Visible for good: the clamp still owns the attribute and takes it off.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(content());
      expect(link).not.toHaveAttribute('inert');
      expect(link).not.toHaveAttribute('data-line-clamp-hidden');
    });

    it('still calls a caller onBlur', () => {
      const onBlur = vi.fn();
      render(
        <LineClamp maxLines={2} data-testid="clamp" onBlur={onBlur}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );

      fireEvent.blur(screen.getByText('Read more'));

      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('leaves a link in a nested clamp to the nested clamp', async () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const content = () => (
        <LineClamp maxLines={5} data-testid="outer" hasTruncateTooltip={false}>
          <LineClamp
            maxLines={2}
            data-testid="inner"
            hasTruncateTooltip={false}>
            <a href="/more">Read more</a>
          </LineClamp>
        </LineClamp>
      );
      const {rerender} = render(content());
      const link = screen.getByText('Read more');
      // Clipped by the inner clamp, well inside the outer clamp's box.
      rectMap.set(screen.getByTestId('outer'), {top: 0, bottom: 200});
      rectMap.set(screen.getByTestId('inner'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).toHaveAttribute('inert');

      // The inner clamp grows: its link is on screen and reachable again.
      rectMap.set(screen.getByTestId('inner'), {top: 0, bottom: 80});
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).not.toHaveAttribute('inert');
      expect(link).not.toHaveAttribute('data-line-clamp-hidden');
    });

    it('releases a link in a clamp that mounts inside one already on screen', async () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const content = (withInner: boolean) => (
        <LineClamp maxLines={5} data-testid="outer" hasTruncateTooltip={false}>
          Text
          {withInner && (
            <LineClamp
              maxLines={2}
              data-testid="inner"
              hasTruncateTooltip={false}>
              <a href="/more">Read more</a>
            </LineClamp>
          )}
        </LineClamp>
      );
      const {rerender} = render(content(false));
      rectMap.set(screen.getByTestId('outer'), {top: 0, bottom: 200});
      mockRects(rectMap);
      // The inner clamp mounts clipped, so it writes `inert` as it mounts.
      rerender(content(true));
      const link = screen.getByText('Read more');
      rectMap.set(screen.getByTestId('inner'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      rerender(content(true));
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).toHaveAttribute('inert');

      // It scrolls into view: the clamp still owns the attribute.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(content(true));
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).not.toHaveAttribute('inert');
    });

    it("still releases a link it hid across renders with a caller's inline callback ref", async () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      // A new function every render, so the merged ref changes every render.
      const content = () => (
        <>
          <LineClamp
            maxLines={2}
            data-testid="clamp"
            hasTruncateTooltip={false}
            ref={() => {}}>
            <a href="/more">Read more</a>
          </LineClamp>
          <LineClamp maxLines={2} hasTruncateTooltip={false} ref={() => {}}>
            Other
          </LineClamp>
        </>
      );
      const {rerender} = render(content());
      const link = screen.getByText('Read more');
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 10, bottom: 26});
      mockRects(rectMap);
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).not.toHaveAttribute('inert');
      // Hide the link, then render again before the observer reports the write.
      rectMap.set(link, {top: 40, bottom: 56});
      rerender(content());
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).toHaveAttribute('inert');

      // It scrolls into view for good: the clamp still owns the attribute.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(content());
      await act(async () => {
        await Promise.resolve();
      });
      expect(link).not.toHaveAttribute('inert');
    });

    it("keeps a caller's inert that is set while the link is clipped", async () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const props = {
        maxLines: 2,
        'data-testid': 'clamp',
        hasTruncateTooltip: false,
      };
      const {rerender} = render(
        <LineClamp {...props}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      const link = screen.getByText('Read more');
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(
        <LineClamp {...props}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      expect(link).toHaveAttribute('data-line-clamp-hidden');

      // The caller makes the link inert while it is clipped.
      rerender(
        <LineClamp {...props}>
          <a href="/more" inert>
            Read more
          </a>
        </LineClamp>,
      );
      await waitFor(() => {
        expect(link).not.toHaveAttribute('data-line-clamp-hidden');
      });

      // The clamp widens: the link is visible, and still inert.
      rectMap.set(link, {top: 10, bottom: 26});
      rerender(
        <LineClamp {...props} maxLines={3}>
          <a href="/more" inert>
            Read more
          </a>
        </LineClamp>,
      );
      expect(link).toHaveAttribute('inert');
    });

    it('never hides the element that holds focus', () => {
      const rectMap = new Map<Element, {top: number; bottom: number}>();
      const {rerender} = render(
        <LineClamp maxLines={2} data-testid="clamp" hasTruncateTooltip={false}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      const link = screen.getByText('Read more');
      link.focus();
      rectMap.set(screen.getByTestId('clamp'), {top: 0, bottom: 40});
      rectMap.set(link, {top: 40, bottom: 56});
      mockRects(rectMap);
      rerender(
        <LineClamp maxLines={2} data-testid="clamp" hasTruncateTooltip={false}>
          <a href="/more">Read more</a>
        </LineClamp>,
      );
      expect(link).toHaveFocus();
      expect(link).not.toHaveAttribute('inert');
    });
  });

  describe('observers', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function countMutationObservers(clamps: number) {
      const Native = MutationObserver;
      let created = 0;
      vi.stubGlobal(
        'MutationObserver',
        class extends Native {
          constructor(callback: MutationCallback) {
            super(callback);
            created += 1;
          }
        },
      );
      const {unmount} = render(
        <>
          {Array.from({length: clamps}, (_, i) => (
            <LineClamp key={i} maxLines={2}>
              Row {i} <a href="/more">more</a>
            </LineClamp>
          ))}
        </>,
      );
      unmount();
      vi.unstubAllGlobals();
      return created;
    }

    it('shares one MutationObserver across every clamp', () => {
      expect(countMutationObservers(20)).toBe(countMutationObservers(1));
    });
  });

  describe('keyboard access to the full text', () => {
    function mockOverflow() {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
        100,
      );
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
        20,
      );
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('makes a truncated clamp a tab stop, and leaves a fitting one alone', async () => {
      mockOverflow();
      render(
        <LineClamp maxLines={2} data-testid="clamp">
          Long text
        </LineClamp>,
      );
      await waitFor(() => {
        expect(screen.getByTestId('clamp')).toHaveAttribute('tabindex', '0');
      });
      cleanup();
      vi.restoreAllMocks();
      render(
        <LineClamp maxLines={2} data-testid="clamp">
          Short
        </LineClamp>,
      );
      expect(screen.getByTestId('clamp')).not.toHaveAttribute('tabindex');
    });

    it("lets a caller's tabIndex win and skips the stop when the tooltip is off", async () => {
      mockOverflow();
      render(
        <>
          <LineClamp maxLines={2} data-testid="own" tabIndex={-1}>
            Long text
          </LineClamp>
          <LineClamp maxLines={2} data-testid="off" hasTruncateTooltip={false}>
            Long text
          </LineClamp>
        </>,
      );
      await waitFor(() => {
        expect(screen.getByTestId('own')).toHaveAttribute('tabindex', '-1');
      });
      expect(screen.getByTestId('off')).not.toHaveAttribute('tabindex');
    });
  });
});
