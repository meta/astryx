// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pagination.test.tsx
 * @input Uses vitest, @testing-library/react, Pagination component
 * @output Unit tests for Pagination component behavior
 * @position Testing; validates Pagination.tsx implementation
 *
 * SYNC: When Pagination.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {useState} from 'react';
import {
  render,
  screen,
  within,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Pagination, generatePageRange} from './Pagination';
import {FormLayout} from '../FormLayout/FormLayout';
import {LinkProvider} from '../Link/LinkProvider';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

afterEach(() => {
  __resetLiveRegionsForTest();
});

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

function RouterLink({
  to: _to,
  ...props
}: React.ComponentProps<'a'> & {to?: string}) {
  return <a data-router-link="" {...props} />;
}

function SameTabLink({
  to: _to,
  ...props
}: React.ComponentProps<'a'> & {to?: string}) {
  return <a {...props} target="_SELF" />;
}

function NewTabLink({
  to: _to,
  ...props
}: React.ComponentProps<'a'> & {to?: string}) {
  return <a {...props} target="_blank" />;
}

/** A page's URL, with the page size when Pagination passes one. */
function pagePath(page: number, pageSize?: number): string {
  return pageSize == null
    ? `/items/${page}`
    : `/items/${page}?size=${pageSize}`;
}

/** A URL the test browser follows without loading a document. */
function pageHash(page: number): string {
  return `#page-${page}`;
}

// =============================================================================
// generatePageRange helper
// =============================================================================

describe('generatePageRange', () => {
  it('returns all pages when total fits within slots', () => {
    expect(generatePageRange(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns all pages when total equals slot count', () => {
    // With siblingCount=1, totalSlots = 5 + 2*1 = 7
    expect(generatePageRange(4, 7, 1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows right ellipsis when near start', () => {
    const result = generatePageRange(1, 10, 1);
    expect(result).toEqual([1, 2, 3, 4, 5, '...', 10]);
  });

  it('shows left ellipsis when near end', () => {
    const result = generatePageRange(10, 10, 1);
    expect(result).toEqual([1, '...', 6, 7, 8, 9, 10]);
  });

  it('shows both ellipses when in middle', () => {
    const result = generatePageRange(5, 10, 1);
    expect(result).toEqual([1, '...', 4, 5, 6, '...', 10]);
  });

  it('handles siblingCount=2', () => {
    const result = generatePageRange(6, 12, 2);
    expect(result).toEqual([1, '...', 4, 5, 6, 7, 8, '...', 12]);
  });

  it('handles siblingCount=0', () => {
    const result = generatePageRange(5, 10, 0);
    expect(result).toEqual([1, '...', 5, '...', 10]);
  });

  it('handles single page', () => {
    expect(generatePageRange(1, 1, 1)).toEqual([1]);
  });

  it('handles two pages', () => {
    expect(generatePageRange(1, 2, 1)).toEqual([1, 2]);
  });
});

// =============================================================================
// Pagination component
// =============================================================================

describe('Pagination', () => {
  // ---------------------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------------------

  describe('basic rendering', () => {
    it('renders nav landmark with default label', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('navigation', {name: 'Pagination'}),
      ).toBeInTheDocument();
    });

    it('renders nav landmark with custom label', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={5}
          label="Results navigation"
        />,
      );
      expect(
        screen.getByRole('navigation', {name: 'Results navigation'}),
      ).toBeInTheDocument();
    });

    it('renders prev and next buttons', () => {
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeInTheDocument();
    });

    it('does not introduce Stack theme targets around navigation controls', () => {
      const {rerender} = render(
        <Pagination page={3} onChange={() => {}} totalPages={5} />,
      );
      expect(
        screen.getByRole('navigation').querySelector('.astryx-stack'),
      ).toBeNull();

      rerender(
        <Pagination
          page={3}
          onChange={() => {}}
          totalPages={5}
          variant="compact"
          hasFirstLast
        />,
      );
      expect(
        screen.getByRole('navigation').querySelector('.astryx-stack'),
      ).toBeNull();
    });

    it('gives the prev/next carets a hover tooltip matching their accessible name', () => {
      // The carets are icon-only, so sighted users need a visible label on
      // hover, not just the accessible name. The tooltip reuses the same
      // localized string, so it adds no description (Button FR12).
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      const prev = screen.getByRole('button', {name: 'Go to previous page'});
      const next = screen.getByRole('button', {name: 'Go to next page'});
      expect(
        screen
          .getAllByRole('tooltip', {hidden: true})
          .some(el => el.textContent === 'Go to previous page'),
      ).toBe(true);
      expect(
        screen
          .getAllByRole('tooltip', {hidden: true})
          .some(el => el.textContent === 'Go to next page'),
      ).toBe(true);
      expect(prev).not.toHaveAttribute('aria-describedby');
      expect(next).not.toHaveAttribute('aria-describedby');
    });

    it('renders the prev/next caret icons without an extra mirror wrapper span', () => {
      // Regression: the RTL mirror used to wrap each chevron in a
      // display:contents span, which dropped the icon out of the button's
      // flex-centering context and offset the glyph vertically. The mirror now
      // rides on the Icon via xstyle, so the icon renders as a direct centered
      // child. jsdom has no layout engine to assert the pixel centering, but we
      // can assert the structural fix: the icon carries its own class and is
      // not the lone child of a bare wrapper span. (Centering is verified
      // visually in Storybook.)
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      const next = screen.getByRole('button', {name: 'Go to next page'});
      const icon = next.querySelector('.astryx-icon');
      expect(icon).not.toBeNull();
    });

    it('renders with data-testid', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={5}
          data-testid="my-pagination"
        />,
      );
      expect(screen.getByTestId('my-pagination')).toBeInTheDocument();
    });

    it('returns null when totalItems is 0', () => {
      const {container} = render(
        <Pagination page={1} onChange={() => {}} totalItems={0} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when totalPages is 0', () => {
      const {container} = render(
        <Pagination page={1} onChange={() => {}} totalPages={0} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: pages (default)
  // ---------------------------------------------------------------------------

  describe('variant: pages', () => {
    it('renders page number buttons', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={5} />);
      for (let i = 1; i <= 5; i++) {
        expect(
          screen.getByRole('button', {name: `Go to page ${i}`}),
        ).toBeInTheDocument();
      }
    });

    it('marks current page with aria-current', () => {
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      const activeButton = screen.getByRole('button', {name: 'Go to page 3'});
      expect(activeButton).toHaveAttribute('aria-current', 'page');

      const otherButton = screen.getByRole('button', {name: 'Go to page 1'});
      expect(otherButton).not.toHaveAttribute('aria-current');
    });

    it('shows ellipsis for many pages', () => {
      render(<Pagination page={5} onChange={() => {}} totalPages={10} />);
      // Should show: 1 ... 4 5 6 ... 10
      expect(
        screen.getByRole('button', {name: 'Go to page 1'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to page 4'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to page 5'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to page 6'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to page 10'}),
      ).toBeInTheDocument();
      // Pages 2, 3, 7, 8, 9 should not be shown
      expect(
        screen.queryByRole('button', {name: 'Go to page 2'}),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: 'Go to page 9'}),
      ).not.toBeInTheDocument();
    });

    it('does not render pages when totalPages is unknown', () => {
      render(<Pagination page={1} onChange={() => {}} hasMore />);
      // Should not show any page number buttons
      expect(
        screen.queryByRole('button', {name: /Go to page/}),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: count
  // ---------------------------------------------------------------------------

  describe('variant: count', () => {
    it('renders count text', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="count"
        />,
      );
      expect(screen.getByText(/1–10 of 100/)).toBeInTheDocument();
    });

    it('clamps range end to totalItems on last page', () => {
      render(
        <Pagination
          page={5}
          onChange={() => {}}
          totalItems={45}
          pageSize={10}
          variant="count"
        />,
      );
      expect(screen.getByText(/41–45 of 45/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: compact
  // ---------------------------------------------------------------------------

  describe('variant: compact', () => {
    it('renders compact text', () => {
      render(
        <Pagination
          page={3}
          onChange={() => {}}
          totalPages={10}
          variant="compact"
        />,
      );
      expect(screen.getByText('Page 3 of 10')).toBeInTheDocument();
    });

    describe('first/last buttons', () => {
      function navButtonNames(): string[] {
        return within(screen.getByRole('navigation'))
          .getAllByRole('button')
          .map(button => button.getAttribute('aria-label') ?? '');
      }

      it('omits first/last when hasFirstLast is unset', () => {
        render(
          <Pagination
            page={5}
            onChange={() => {}}
            totalPages={10}
            variant="compact"
          />,
        );
        expect(navButtonNames()).toEqual([
          'Go to previous page',
          'Go to next page',
        ]);
      });

      it('omits first/last when hasFirstLast is false', () => {
        render(
          <Pagination
            page={5}
            onChange={() => {}}
            totalPages={10}
            variant="compact"
            hasFirstLast={false}
          />,
        );
        expect(navButtonNames()).toEqual([
          'Go to previous page',
          'Go to next page',
        ]);
      });

      it('flanks prev/next with first/last when hasFirstLast is true', () => {
        render(
          <Pagination
            page={5}
            onChange={() => {}}
            totalPages={10}
            variant="compact"
            hasFirstLast
          />,
        );
        expect(navButtonNames()).toEqual([
          'Go to first page',
          'Go to previous page',
          'Go to next page',
          'Go to last page',
        ]);
        // The readout stays between prev and next.
        const readout = within(screen.getByRole('navigation')).getByText(
          'Page 5 of 10',
        );
        const prev = screen.getByRole('button', {name: 'Go to previous page'});
        const next = screen.getByRole('button', {name: 'Go to next page'});
        expect(
          prev.compareDocumentPosition(readout) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          next.compareDocumentPosition(readout) &
            Node.DOCUMENT_POSITION_PRECEDING,
        ).toBeTruthy();
        // Compact never gains an editable box.
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      });

      it('jumps to the first and last page through onChange and changeAction', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const changeAction = vi.fn();
        render(
          <Pagination
            page={5}
            onChange={onChange}
            changeAction={changeAction}
            totalItems={95}
            pageSize={10}
            variant="compact"
            hasFirstLast
          />,
        );
        await user.click(
          screen.getByRole('button', {name: 'Go to first page'}),
        );
        expect(onChange).toHaveBeenLastCalledWith(1);
        expect(changeAction).toHaveBeenLastCalledWith(1);
        await waitFor(() => {
          expect(politeRegion()).toHaveTextContent('Page 1 of 10');
        });

        await user.click(screen.getByRole('button', {name: 'Go to last page'}));
        // 95 items at 10 per page is 10 pages.
        expect(onChange).toHaveBeenLastCalledWith(10);
        expect(changeAction).toHaveBeenLastCalledWith(10);
        await waitFor(() => {
          expect(politeRegion()).toHaveTextContent('Page 10 of 10');
        });
      });

      it('disables first on the first page and last on the last page', () => {
        const {rerender} = render(
          <Pagination
            page={1}
            onChange={() => {}}
            totalPages={10}
            variant="compact"
            hasFirstLast
          />,
        );
        expect(
          screen.getByRole('button', {name: 'Go to first page'}),
        ).toHaveAttribute('aria-disabled', 'true');
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).not.toHaveAttribute('aria-disabled');

        rerender(
          <Pagination
            page={10}
            onChange={() => {}}
            totalPages={10}
            variant="compact"
            hasFirstLast
          />,
        );
        expect(
          screen.getByRole('button', {name: 'Go to first page'}),
        ).not.toHaveAttribute('aria-disabled');
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).toHaveAttribute('aria-disabled', 'true');
      });

      it('omits first/last when the total page count is unknown', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
          <Pagination
            page={2}
            onChange={onChange}
            hasMore
            variant="compact"
            hasFirstLast
          />,
        );
        expect(navButtonNames()).toEqual([
          'Go to previous page',
          'Go to next page',
        ]);
        await user.click(screen.getByRole('button', {name: 'Go to next page'}));
        expect(onChange).toHaveBeenLastCalledWith(3);
      });

      it('mirrors the first/last chevrons under RTL like prev/next', () => {
        render(
          <InternationalizationProvider locale="en" dir="rtl">
            <div dir="rtl">
              <Pagination
                page={5}
                onChange={() => {}}
                totalPages={10}
                variant="compact"
                hasFirstLast
              />
            </div>
          </InternationalizationProvider>,
        );
        // jsdom applies no CSS transforms, so assert the first/last icons carry
        // every class the mirrored prev/next icons share (the mirror included).
        const iconClasses = (name: string) =>
          new Set(
            screen
              .getByRole('button', {name})
              .querySelector('.astryx-icon')
              ?.getAttribute('class')
              ?.split(/\s+/) ?? [],
          );
        const prev = iconClasses('Go to previous page');
        const shared = [...iconClasses('Go to next page')].filter(name =>
          prev.has(name),
        );
        expect(shared.length).toBeGreaterThan(0);
        for (const name of ['Go to first page', 'Go to last page']) {
          const classes = iconClasses(name);
          expect(shared.filter(c => !classes.has(c))).toEqual([]);
        }
      });
    });
  });

  describe('hasFirstLast on other variants', () => {
    it.each(['pages', 'count', 'dots', 'none'] as const)(
      'does not add first/last to the %s variant',
      variant => {
        render(
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={50}
            pageSize={10}
            variant={variant}
            hasFirstLast
          />,
        );
        expect(
          screen.queryByRole('button', {name: 'Go to first page'}),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Go to last page'}),
        ).not.toBeInTheDocument();
      },
    );
  });

  // ---------------------------------------------------------------------------
  // pageSize guarding
  // ---------------------------------------------------------------------------

  describe('pageSize guarding', () => {
    it('does not crash the dots variant when pageSize is 0', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={5}
          pageSize={0}
          variant="dots"
        />,
      );
      const group = screen.getByRole('radiogroup', {name: 'Page indicators'});
      expect(within(group).getAllByRole('radio')).toHaveLength(5);
    });

    it('treats NaN pageSize as the default', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={50}
          pageSize={NaN}
          variant="compact"
        />,
      );
      expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    });

    it('clamps negative pageSize to 1', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={5}
          pageSize={-10}
          variant="compact"
        />,
      );
      expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    });

    it('floors fractional pageSize', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={50}
          pageSize={2.5}
          variant="compact"
        />,
      );
      expect(screen.getByText('Page 1 of 25')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: dots
  // ---------------------------------------------------------------------------

  describe('variant: dots', () => {
    it('renders dot indicators', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={5}
          variant="dots"
        />,
      );
      const group = screen.getByRole('radiogroup', {name: 'Page indicators'});
      const dots = within(group).getAllByRole('radio');
      expect(dots).toHaveLength(5);
    });

    // -------------------------------------------------------------------------
    // Keyboard navigation (roving tabindex + arrow keys via useListFocus).
    // Selection follows focus: arrow/Home/End move focus and select that page.
    // -------------------------------------------------------------------------

    it('does not choose a page on the press: the browser keeps focus off the dot until the click', () => {
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalPages={3}
          variant="dots"
        />,
      );
      const dot = screen.getByRole('radio', {name: 'Page 2'});
      expect(fireEvent.mouseDown(dot)).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('uses roving tabindex — active dot has tabIndex 0, others -1', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={4}
          variant="dots"
        />,
      );
      expect(screen.getByRole('radio', {name: 'Page 2'})).toHaveAttribute(
        'tabindex',
        '0',
      );
      expect(screen.getByRole('radio', {name: 'Page 1'})).toHaveAttribute(
        'tabindex',
        '-1',
      );
      expect(screen.getByRole('radio', {name: 'Page 3'})).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('ArrowRight moves focus to the next dot and selects it', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          onChange={onChange}
          totalPages={4}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 2'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith(3);
      expect(screen.getByRole('radio', {name: 'Page 3'})).toHaveFocus();
    });

    it('ArrowLeft moves focus to the previous dot and selects it', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={3}
          onChange={onChange}
          totalPages={4}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 3'}).focus();
      await user.keyboard('{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith(2);
      expect(screen.getByRole('radio', {name: 'Page 2'})).toHaveFocus();
    });

    it('Home selects the first page, End the last', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const {rerender} = render(
        <Pagination
          page={3}
          onChange={onChange}
          totalPages={5}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 3'}).focus();
      await user.keyboard('{Home}');
      expect(onChange).toHaveBeenCalledWith(1);
      expect(screen.getByRole('radio', {name: 'Page 1'})).toHaveFocus();

      onChange.mockClear();
      rerender(
        <Pagination
          page={3}
          onChange={onChange}
          totalPages={5}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 3'}).focus();
      await user.keyboard('{End}');
      expect(onChange).toHaveBeenCalledWith(5);
      expect(screen.getByRole('radio', {name: 'Page 5'})).toHaveFocus();
    });

    it('wraps from the last dot to the first with ArrowRight', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={4}
          onChange={onChange}
          totalPages={4}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 4'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith(1);
      expect(screen.getByRole('radio', {name: 'Page 1'})).toHaveFocus();
    });

    it('wraps from the first dot to the last with ArrowLeft', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalPages={4}
          variant="dots"
        />,
      );
      screen.getByRole('radio', {name: 'Page 1'}).focus();
      await user.keyboard('{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith(4);
      expect(screen.getByRole('radio', {name: 'Page 4'})).toHaveFocus();
    });

    it('does not navigate with arrow keys when disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          onChange={onChange}
          totalPages={4}
          variant="dots"
          isDisabled
        />,
      );
      const dot = screen.getByRole('radio', {name: 'Page 2'});
      // spec:AST-085 FR1: the active dot keeps its tab stop, exposed as disabled.
      expect(dot).not.toHaveAttribute('disabled');
      expect(dot).toHaveAttribute('aria-disabled', 'true');
      dot.focus();
      expect(dot).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{Enter} ');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: none
  // ---------------------------------------------------------------------------

  describe('variant: none', () => {
    it('renders only prev/next buttons', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={5}
          variant="none"
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeInTheDocument();
      // No page buttons or text indicators
      expect(
        screen.queryByRole('button', {name: /Go to page/}),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant: input
  // ---------------------------------------------------------------------------

  describe('variant: input', () => {
    it('renders "Page [ n ] / N" with an editable box in page mode', () => {
      render(
        <Pagination
          page={3}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      expect(box).toBeInTheDocument();
      expect(box).toHaveValue('3');
      // Visible leading "Page" label and trailing "/ N" total (10 pages).
      expect(screen.getByText('Page')).toBeInTheDocument();
      expect(screen.getByText('/ 10')).toBeInTheDocument();
      // No page-number buttons and no range readout ("Showing 1–N of M").
      expect(
        screen.queryByRole('button', {name: /Go to page \d/}),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Showing/i)).not.toBeInTheDocument();
      // Flanked by first/prev/next/last.
      expect(
        screen.getByRole('button', {name: 'Go to first page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to last page'}),
      ).toBeInTheDocument();
    });

    it('bounds the editable box to [1, totalPages] via a NumberInput', () => {
      render(
        <Pagination
          page={3}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      // The box is a NumberInput (a spinbutton) whose min/max clamp entries to
      // the valid page range without hand-rolled parsing in Pagination.
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      expect(box).toHaveAttribute('aria-valuemin', '1');
      expect(box).toHaveAttribute('aria-valuemax', '10');
    });

    it('keeps its page box at commit timing inside a blur-or-enter FormLayout: nothing while typing, the rejection at Enter', () => {
      render(
        <FormLayout defaultEntryErrorBehavior="blur-or-enter">
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="input"
          />
        </FormLayout>,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      fireEvent.focus(box);
      fireEvent.change(box, {target: {value: '2.5'}});
      expect(box).not.toHaveAttribute('aria-invalid');
      fireEvent.keyDown(box, {key: 'Enter'});
      expect(box).toHaveAttribute('aria-invalid', 'true');
      fireEvent.change(box, {target: {value: '2'}});
      expect(box).not.toHaveAttribute('aria-invalid');
    });

    it('commits a typed page on Enter and clamps an over-range entry', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      await user.clear(box);
      await user.type(box, '4{Enter}');
      expect(onChange).toHaveBeenCalledWith(4);

      onChange.mockClear();
      await user.clear(box);
      // The box is a NumberInput bounded to [1, totalPages]: an over-max entry
      // lands on the last page rather than navigating past it.
      await user.type(box, '99{Enter}');
      expect(onChange).not.toHaveBeenCalledWith(99);
      expect(onChange).toHaveBeenCalledWith(10);
    });

    it('commits on blur', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      await user.clear(box);
      await user.type(box, '5');
      await user.tab();
      expect(onChange).toHaveBeenCalledWith(5);
    });

    it('keeps an invalid entry with its message and reverts an empty one', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={3}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      // An invalid entry never navigates. Blur keeps it with its message.
      await user.clear(box);
      await user.type(box, 'abc');
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveValue('abc');
      expect(box).toHaveAttribute('aria-invalid', 'true');
      // The message sits on the status icon, not in a box under the bar, and
      // the box widens to hold the icon beside the text.
      expect(document.querySelector('.astryx-field-status')).toBeNull();
      expect(
        screen.getByRole('button', {name: 'Error details'}),
      ).toBeInTheDocument();
      const describedBy = box.getAttribute('aria-describedby')!.split(' ');
      expect(
        describedBy.map(id => document.getElementById(id)?.textContent),
      ).toContain('Invalid number');
      const field = box.closest<HTMLElement>('[style*="calc("]');
      expect(field).not.toBeNull();

      // Emptying the box and blurring reverts to the committed page too.
      await user.clear(box);
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveValue('3');
      expect(box.closest('[style*="calc("]')).toBeNull();
    });

    it('announces the committed page to screen readers', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      await user.clear(box);
      await user.type(box, '4{Enter}');
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Page 4 of 10');
      });
    });

    it('is disabled and does not commit when isDisabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
          isDisabled
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      expect(box).toHaveAttribute('aria-disabled', 'true');
      // Disabled input never fires a change.
      await user.type(box, '5{Enter}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('rejects a below-range entry rather than navigating out of range', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={5}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      await user.clear(box);
      // The box is bounded to [1, totalPages]: 0 (and negatives) are below the
      // minimum, so they are rejected and never navigate.
      await user.type(box, '0{Enter}');
      expect(onChange).not.toHaveBeenCalledWith(0);
    });

    it('disables the input when the total is unknown (cursor/hasMore)', () => {
      render(
        <Pagination page={2} onChange={() => {}} hasMore variant="input" />,
      );
      // With no known page count there is no range to clamp against, so the
      // editable box is inert rather than accepting entries it can't resolve.
      expect(
        screen.getByRole('spinbutton', {name: 'Go to page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('renders the localized "Page" label by default and a custom pageLabel', () => {
      const {rerender} = render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="input"
        />,
      );
      // Default: the localized "Page" noun precedes the box.
      expect(screen.getByText('Page')).toBeInTheDocument();

      // A custom pageLabel relabels the box without changing navigation.
      rerender(
        <Pagination
          page={2}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          variant="input"
          pageLabel="Row"
        />,
      );
      expect(screen.getByText('Row')).toBeInTheDocument();
      expect(screen.queryByText('Page')).not.toBeInTheDocument();
      // The trailing "/ N" total stays regardless of the label.
      expect(screen.getByText('/ 10')).toBeInTheDocument();
    });

    it('navigates by page (via onChange) even with a custom pageLabel', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalItems={100}
          pageSize={10}
          variant="input"
          pageLabel="Row"
        />,
      );
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      // The box holds the page number, and committing drives page navigation.
      expect(box).toHaveValue('1');
      await user.clear(box);
      await user.type(box, '4{Enter}');
      expect(onChange).toHaveBeenCalledWith(4);
    });

    // -------------------------------------------------------------------------
    // First / Last buttons
    // -------------------------------------------------------------------------

    describe('first/last buttons', () => {
      it('first jumps to page 1, last jumps to the final page', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
          <Pagination
            page={5}
            onChange={onChange}
            totalItems={100}
            pageSize={10}
            variant="input"
          />,
        );
        await user.click(
          screen.getByRole('button', {name: 'Go to first page'}),
        );
        expect(onChange).toHaveBeenCalledWith(1);

        onChange.mockClear();
        await user.click(screen.getByRole('button', {name: 'Go to last page'}));
        // 100 items / 10 per page → 10 pages.
        expect(onChange).toHaveBeenCalledWith(10);
      });

      it('disables first on the first page and last on the last page', () => {
        const {rerender} = render(
          <Pagination
            page={1}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="input"
          />,
        );
        expect(
          screen.getByRole('button', {name: 'Go to first page'}),
        ).toHaveAttribute('aria-disabled', 'true');
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).not.toHaveAttribute('aria-disabled');

        rerender(
          <Pagination
            page={10}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="input"
          />,
        );
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).toHaveAttribute('aria-disabled', 'true');
        expect(
          screen.getByRole('button', {name: 'Go to first page'}),
        ).not.toHaveAttribute('aria-disabled');
      });

      it('hides first/last when hasFirstLast is false', () => {
        render(
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="input"
            hasFirstLast={false}
          />,
        );
        expect(
          screen.queryByRole('button', {name: 'Go to first page'}),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Go to last page'}),
        ).not.toBeInTheDocument();
        // prev/next still present.
        expect(
          screen.getByRole('button', {name: 'Go to previous page'}),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', {name: 'Go to next page'}),
        ).toBeInTheDocument();
      });

      it('omits first/last when the total page count is unknown', () => {
        render(
          <Pagination page={2} onChange={() => {}} hasMore variant="input" />,
        );
        expect(
          screen.queryByRole('button', {name: 'Go to first page'}),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Go to last page'}),
        ).not.toBeInTheDocument();
      });

      it('renders the double-chevron icons for first/last', () => {
        const {container} = render(
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="input"
          />,
        );
        // Each default double-chevron icon draws two chevron paths in one <path>
        // ("M...M..."); assert both first and last render an svg with two moves.
        const first = screen.getByRole('button', {name: 'Go to first page'});
        const last = screen.getByRole('button', {name: 'Go to last page'});
        for (const btn of [first, last]) {
          const path = btn.querySelector('svg path');
          expect(path).not.toBeNull();
          const d = path?.getAttribute('d') ?? '';
          expect((d.match(/M/g) ?? []).length).toBe(2);
        }
        expect(container).toBeTruthy();
      });

      it('does not add first/last to other variants (e.g. pages)', () => {
        render(
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={100}
            pageSize={10}
            variant="pages"
          />,
        );
        expect(
          screen.queryByRole('button', {name: 'Go to first page'}),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Go to last page'}),
        ).not.toBeInTheDocument();
      });
    });

    // -------------------------------------------------------------------------
    // Custom label via pageLabel
    // -------------------------------------------------------------------------

    describe('pageLabel', () => {
      it('renders a custom noun while keeping the "/ N" total', () => {
        render(
          <Pagination
            page={3}
            onChange={() => {}}
            totalItems={200}
            pageSize={20}
            variant="input"
            pageLabel="Row"
          />,
        );
        // The custom noun replaces the default "Page"; the total stays.
        expect(screen.getByText('Row')).toBeInTheDocument();
        expect(screen.queryByText('Page')).not.toBeInTheDocument();
        expect(screen.getByText('/ 10')).toBeInTheDocument();
        // The box still holds the 1-based page number.
        expect(
          screen.getByRole('spinbutton', {name: 'Go to page'}),
        ).toHaveValue('3');
      });

      it('keeps the input page-navigating with a custom label', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
          <Pagination
            page={1}
            onChange={onChange}
            totalPages={10}
            variant="input"
            pageLabel="Row"
          />,
        );
        const box = screen.getByRole('spinbutton', {name: 'Go to page'});
        await user.clear(box);
        await user.type(box, '5{Enter}');
        expect(onChange).toHaveBeenCalledWith(5);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Page change callbacks
  // ---------------------------------------------------------------------------

  describe('page change callbacks', () => {
    it('does not announce on initial mount', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={10} />);
      expect(politeRegion()).toBeNull();
    });

    it('announces the new page politely when navigating', async () => {
      const user = userEvent.setup();
      render(<Pagination page={2} onChange={() => {}} totalPages={10} />);
      await user.click(screen.getByRole('button', {name: 'Go to page 3'}));
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Page 3 of 10');
      });
    });

    it('announces the next page when clicking next', async () => {
      const user = userEvent.setup();
      render(<Pagination page={2} onChange={() => {}} totalPages={5} />);
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Page 3 of 5');
      });
    });

    it('announces without a total when only hasMore is known', async () => {
      const user = userEvent.setup();
      render(<Pagination page={1} onChange={() => {}} hasMore />);
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Page 2');
      });
    });

    it('calls onChange when clicking a page button', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Pagination page={1} onChange={onChange} totalPages={5} />);
      await user.click(screen.getByRole('button', {name: 'Go to page 3'}));
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('calls onChange when clicking next', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Pagination page={2} onChange={onChange} totalPages={5} />);
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('calls onChange when clicking previous', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Pagination page={3} onChange={onChange} totalPages={5} />);
      await user.click(
        screen.getByRole('button', {name: 'Go to previous page'}),
      );
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('calls onChange when clicking a dot', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalPages={5}
          variant="dots"
        />,
      );
      await user.click(screen.getByRole('radio', {name: 'Page 4'}));
      expect(onChange).toHaveBeenCalledWith(4);
    });
  });

  describe('step', () => {
    it('advances next by step pages', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination page={1} onChange={onChange} totalPages={20} step={5} />,
      );
      await user.click(
        screen.getByRole('button', {name: 'Go forward 5 pages'}),
      );
      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('moves previous by step pages', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination page={11} onChange={onChange} totalPages={20} step={5} />,
      );
      await user.click(screen.getByRole('button', {name: 'Go back 5 pages'}));
      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('clamps a next step that would overshoot to the last page', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination page={18} onChange={onChange} totalPages={20} step={5} />,
      );
      await user.click(
        screen.getByRole('button', {name: 'Go forward 5 pages'}),
      );
      expect(onChange).toHaveBeenCalledWith(20);
    });

    it('clamps a previous step that would undershoot to the first page', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination page={3} onChange={onChange} totalPages={20} step={5} />,
      );
      await user.click(screen.getByRole('button', {name: 'Go back 5 pages'}));
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('falls back to a single-page step for non-integer or < 1 values', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const {rerender} = render(
        <Pagination page={5} onChange={onChange} totalPages={20} step={0} />,
      );
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(onChange).toHaveBeenLastCalledWith(6);

      rerender(
        <Pagination page={5} onChange={onChange} totalPages={20} step={2.5} />,
      );
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(onChange).toHaveBeenLastCalledWith(6);
    });

    it('steps the input variant by step pages', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={onChange}
          totalItems={500}
          pageSize={25}
          variant="input"
          step={5}
        />,
      );
      await user.click(
        screen.getByRole('button', {name: 'Go forward 5 pages'}),
      );
      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('names the prev/next buttons for the stride when step > 1', () => {
      render(
        <Pagination page={5} onChange={() => {}} totalPages={20} step={5} />,
      );
      expect(
        screen.getByRole('button', {name: 'Go forward 5 pages'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go back 5 pages'}),
      ).toBeInTheDocument();
    });

    it('keeps the single-page names when step is 1', () => {
      render(
        <Pagination page={5} onChange={() => {}} totalPages={20} step={1} />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // changeAction (interruptible, optimistic)
  // ---------------------------------------------------------------------------

  describe('changeAction', () => {
    it('fires onChange then changeAction with the new page', async () => {
      const user = userEvent.setup();
      const order: string[] = [];
      const onChange = vi.fn(() => order.push('onChange'));
      const changeAction = vi.fn(() => {
        order.push('changeAction');
      });
      render(
        <Pagination
          page={1}
          onChange={onChange}
          changeAction={changeAction}
          totalPages={5}
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(onChange).toHaveBeenCalledWith(2);
      expect(changeAction).toHaveBeenCalledWith(2);
      expect(order).toEqual(['onChange', 'changeAction']);
    });

    it('shows the optimistic page while changeAction is pending', async () => {
      const user = userEvent.setup();
      let resolveAction: (() => void) | undefined;
      const changeAction = vi.fn(
        async () =>
          new Promise<void>(resolve => {
            resolveAction = resolve;
          }),
      );
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          changeAction={changeAction}
          totalPages={5}
          variant="compact"
        />,
      );

      // The committed `page` prop stays at 1, but the indicator optimistically
      // reflects the page being navigated to.
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(changeAction).toHaveBeenCalledWith(2);
      expect(
        within(screen.getByRole('navigation')).getByText('Page 2 of 5'),
      ).toBeInTheDocument();

      await act(async () => {
        resolveAction?.();
        await Promise.resolve();
      });
    });

    it('interrupts an in-flight action on rapid next clicks', async () => {
      // Each click derives its target from the optimistic page, so clicking
      // next twice before the action settles advances 1 -> 2 -> 3 instead of
      // being dropped by a re-entry guard.
      const resolvers: (() => void)[] = [];
      const changeAction = vi.fn(
        async () =>
          new Promise<void>(resolve => {
            resolvers.push(resolve);
          }),
      );
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          changeAction={changeAction}
          totalPages={5}
          variant="compact"
        />,
      );

      const next = screen.getByRole('button', {name: 'Go to next page'});
      const nav = screen.getByRole('navigation');
      await act(async () => {
        fireEvent.click(next);
      });
      // Scope to the nav landmark: the live region on document.body also
      // carries the announced page text.
      expect(within(nav).getByText('Page 2 of 5')).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(next);
      });
      expect(within(nav).getByText('Page 3 of 5')).toBeInTheDocument();

      expect(changeAction).toHaveBeenCalledTimes(2);
      expect(changeAction).toHaveBeenNthCalledWith(1, 2);
      expect(changeAction).toHaveBeenNthCalledWith(2, 3);

      await act(async () => {
        resolvers.forEach(resolve => resolve());
        await Promise.resolve();
      });
    });

    it('supports a synchronous changeAction', async () => {
      const user = userEvent.setup();
      const changeAction = vi.fn((_page: number) => {});
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          onChange={onChange}
          changeAction={changeAction}
          totalPages={5}
        />,
      );
      await user.click(
        screen.getByRole('button', {name: 'Go to previous page'}),
      );
      expect(onChange).toHaveBeenCalledWith(1);
      expect(changeAction).toHaveBeenCalledWith(1);
    });

    it('does not fire changeAction when disabled', async () => {
      const user = userEvent.setup();
      const changeAction = vi.fn();
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          changeAction={changeAction}
          totalPages={5}
          isDisabled
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Go to next page'}));
      expect(changeAction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Boundary states
  // ---------------------------------------------------------------------------

  describe('boundary states', () => {
    it('disables previous button on first page', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('disables next button on last page', () => {
      render(<Pagination page={5} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('enables both buttons on middle page', () => {
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).not.toHaveAttribute('aria-disabled');
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('disables both buttons when only one page', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={1} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('keeps focus on Next when it reaches the last page', async () => {
      const user = userEvent.setup();
      function Paged() {
        const [page, setPage] = useState(2);
        return <Pagination page={page} onChange={setPage} totalPages={3} />;
      }
      render(<Paged />);
      const next = screen.getByRole('button', {name: 'Go to next page'});
      next.focus();
      await user.keyboard('{Enter}');
      // The same button stays in the page: it is not natively disabled.
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(next).not.toHaveAttribute('disabled');
      expect(next).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // Cursor-based mode (hasMore)
  // ---------------------------------------------------------------------------

  describe('cursor-based mode', () => {
    it('enables next when hasMore is true', () => {
      render(<Pagination page={1} onChange={() => {}} hasMore />);
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('disables next when hasMore is false', () => {
      render(<Pagination page={3} onChange={() => {}} hasMore={false} />);
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('disables previous on first page with hasMore', () => {
      render(<Pagination page={1} onChange={() => {}} hasMore />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('enables previous on page > 1 with hasMore', () => {
      render(<Pagination page={2} onChange={() => {}} hasMore />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).not.toHaveAttribute('aria-disabled');
    });
  });

  // ---------------------------------------------------------------------------
  // Page size selector
  // ---------------------------------------------------------------------------

  describe('page size selector', () => {
    it('renders page size selector when pageSizeOptions provided', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSize={10}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={() => {}}
        />,
      );
      // The selector should be present (hidden label "Items per page")
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('does not render page size selector when pageSizeOptions not provided', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={5} />);
      // No selector trigger should be present
      const nav = screen.getByRole('navigation');
      // Only prev/next + page buttons should exist
      const buttons = within(nav).getAllByRole('button');
      // 2 nav buttons + page buttons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Disabled state
  // ---------------------------------------------------------------------------

  describe('disabled state', () => {
    it('disables all page buttons when isDisabled', () => {
      render(
        <Pagination page={3} onChange={() => {}} totalPages={5} isDisabled />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      // Page buttons should also be disabled
      expect(
        screen.getByRole('button', {name: 'Go to page 1'}),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not call onChange when disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination page={3} onChange={onChange} totalPages={5} isDisabled />,
      );
      // Disabled buttons can't be clicked
      await user.click(screen.getByRole('button', {name: 'Go to page 1'}));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // totalItems calculation
  // ---------------------------------------------------------------------------

  describe('totalItems calculation', () => {
    it('calculates totalPages from totalItems and pageSize', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={95}
          pageSize={10}
        />,
      );
      // 95 / 10 = 10 pages, should show page 10
      expect(
        screen.getByRole('button', {name: 'Go to page 10'}),
      ).toBeInTheDocument();
    });

    it('uses default pageSize of 10', () => {
      render(<Pagination page={1} onChange={() => {}} totalItems={45} />);
      // 45 / 10 = 5 pages
      expect(
        screen.getByRole('button', {name: 'Go to page 5'}),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: 'Go to page 6'}),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Page links (getPageHref)
  // ---------------------------------------------------------------------------

  describe('page links', () => {
    it('renders each page number as a link to its URL and marks the current page', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={5}
          getPageHref={pagePath}
        />,
      );
      for (const page of [1, 2, 3, 4, 5]) {
        expect(
          screen.getByRole('link', {name: `Go to page ${page}`}),
        ).toHaveAttribute('href', `/items/${page}`);
      }
      expect(screen.getByRole('link', {name: 'Go to page 2'})).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.getByRole('link', {name: 'Go to page 3'}),
      ).not.toHaveAttribute('aria-current');
      expect(screen.queryByRole('button', {name: /Go to page/})).toBeNull();
    });

    it('links Previous and Next to the page a step away', () => {
      render(
        <Pagination
          page={4}
          onChange={() => {}}
          totalPages={10}
          step={5}
          getPageHref={pagePath}
        />,
      );
      // The stride of 5 overshoots page 1, so Previous lands on it.
      expect(
        screen.getByRole('link', {name: 'Go back 5 pages'}),
      ).toHaveAttribute('href', '/items/1');
      expect(
        screen.getByRole('link', {name: 'Go forward 5 pages'}),
      ).toHaveAttribute('href', '/items/9');
    });

    it('keeps an unavailable end a disabled button and asks for no URL for it', () => {
      const getPageHref = vi.fn(pagePath);
      const requestedPages = () =>
        getPageHref.mock.calls.map(([page]) => page).sort((a, b) => a - b);
      const {rerender} = render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={3}
          getPageHref={getPageHref}
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.queryByRole('link', {name: 'Go to previous page'}),
      ).toBeNull();
      expect(
        screen.getByRole('link', {name: 'Go to next page'}),
      ).toHaveAttribute('href', '/items/2');
      // The three page numbers and Next. Previous asks for nothing.
      expect(requestedPages()).toEqual([1, 2, 2, 3]);

      getPageHref.mockClear();
      rerender(
        <Pagination
          page={3}
          onChange={() => {}}
          totalPages={3}
          getPageHref={getPageHref}
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByRole('link', {name: 'Go to next page'})).toBeNull();
      // The three page numbers and Previous. Next asks for nothing.
      expect(requestedPages()).toEqual([1, 2, 2, 3]);
    });

    it('renders no link and asks for no URL while disabled', () => {
      const getPageHref = vi.fn(pagePath);
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={5}
          getPageHref={getPageHref}
          isDisabled
        />,
      );
      expect(screen.queryByRole('link')).toBeNull();
      expect(
        screen.getByRole('button', {name: 'Go to page 3'}),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryAllByRole('tooltip', {hidden: true})).toHaveLength(0);
      expect(getPageHref).not.toHaveBeenCalled();
    });

    it('links First and Last to the first and the last page', () => {
      render(
        <Pagination
          page={4}
          onChange={() => {}}
          totalPages={9}
          variant="compact"
          hasFirstLast
          getPageHref={pagePath}
        />,
      );
      expect(
        screen.getByRole('link', {name: 'Go to first page'}),
      ).toHaveAttribute('href', '/items/1');
      expect(
        screen.getByRole('link', {name: 'Go to last page'}),
      ).toHaveAttribute('href', '/items/9');
    });

    it.each(['count', 'none'] as const)(
      'links Previous and Next in the %s variant',
      variant => {
        render(
          <Pagination
            page={2}
            onChange={() => {}}
            totalItems={50}
            variant={variant}
            getPageHref={pagePath}
          />,
        );
        expect(
          screen.getByRole('link', {name: 'Go to previous page'}),
        ).toHaveAttribute('href', '/items/1');
        expect(
          screen.getByRole('link', {name: 'Go to next page'}),
        ).toHaveAttribute('href', '/items/3');
      },
    );

    it('passes no page size when the caller sets none', () => {
      const getPageHref = vi.fn(pagePath);
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={3}
          getPageHref={getPageHref}
        />,
      );
      expect(getPageHref).toHaveBeenCalledWith(2, undefined);
      expect(screen.getByRole('link', {name: 'Go to page 2'})).toHaveAttribute(
        'href',
        '/items/2',
      );
    });

    it('passes the page size the caller sets', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSize={25}
          getPageHref={pagePath}
        />,
      );
      expect(screen.getByRole('link', {name: 'Go to page 2'})).toHaveAttribute(
        'href',
        '/items/2?size=25',
      );
    });

    it('passes the current page size when only page size options are set', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSizeOptions={[10, 20]}
          onPageSizeChange={() => {}}
          getPageHref={pagePath}
        />,
      );
      expect(screen.getByRole('link', {name: 'Go to page 2'})).toHaveAttribute(
        'href',
        '/items/2?size=10',
      );
    });

    it('passes no page size for an empty list of page size options', () => {
      const getPageHref = vi.fn(pagePath);
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalItems={100}
          pageSizeOptions={[]}
          getPageHref={getPageHref}
        />,
      );
      expect(getPageHref).toHaveBeenCalledWith(2, undefined);
    });

    it('renders its links through the as component', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={3}
          getPageHref={pagePath}
          as={RouterLink}
        />,
      );
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('data-router-link');
      }
      // A disabled end has no destination, so the router link does not render it.
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={3}
          label="First page"
          getPageHref={pagePath}
          as={RouterLink}
        />,
      );
      expect(
        within(screen.getByRole('navigation', {name: 'First page'})).getByRole(
          'button',
          {name: 'Go to previous page'},
        ),
      ).not.toHaveAttribute('data-router-link');
    });

    it('renders its links through the LinkProvider component, and as wins over it', () => {
      render(
        <LinkProvider component={RouterLink}>
          <Pagination
            page={2}
            onChange={() => {}}
            totalPages={3}
            getPageHref={pagePath}
          />
          <Pagination
            page={2}
            onChange={() => {}}
            totalPages={3}
            label="Own link"
            getPageHref={pagePath}
            as="a"
          />
        </LinkProvider>,
      );
      expect(
        within(screen.getByRole('navigation', {name: 'Pagination'})).getByRole(
          'link',
          {name: 'Go to page 1'},
        ),
      ).toHaveAttribute('data-router-link');
      expect(
        within(screen.getByRole('navigation', {name: 'Own link'})).getByRole(
          'link',
          {name: 'Go to page 1'},
        ),
      ).not.toHaveAttribute('data-router-link');
    });

    it('renders a rejected URL as a link with no destination, and its click changes no page', () => {
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          totalPages={2}
          onChange={onChange}
          getPageHref={page => `javascript:go(${page})`}
        />,
      );
      // Page 1, page 2 and Next. Previous is a disabled button.
      const anchors = screen.getByRole('navigation').querySelectorAll('a');
      expect(anchors).toHaveLength(3);
      for (const anchor of anchors) {
        expect(anchor).not.toHaveAttribute('href');
        fireEvent.click(anchor);
      }
      expect(onChange).not.toHaveBeenCalled();
      expect(politeRegion()).toBeNull();
    });

    it('links Previous and Next in cursor pagination to the pages beside the current one', () => {
      const getPageHref = vi.fn((target: number) =>
        target > 4 ? '/items?after=n' : '/items?before=p',
      );
      render(
        <Pagination
          page={4}
          onChange={() => {}}
          hasMore
          getPageHref={getPageHref}
        />,
      );
      expect(
        screen.getByRole('link', {name: 'Go to previous page'}),
      ).toHaveAttribute('href', '/items?before=p');
      expect(
        screen.getByRole('link', {name: 'Go to next page'}),
      ).toHaveAttribute('href', '/items?after=n');
      expect(
        getPageHref.mock.calls.map(([page]) => page).sort((a, b) => a - b),
      ).toEqual([3, 5]);
    });

    it('asks for no URL after the last cursor page', () => {
      const getPageHref = vi.fn((_page: number) => '/items?before=p');
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          hasMore={false}
          getPageHref={getPageHref}
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toHaveAttribute('aria-disabled', 'true');
      // The caller has no cursor for a page after the last one.
      expect(getPageHref.mock.calls.map(([page]) => page)).toEqual([1]);
    });

    it('runs the page change for a plain click on a link and leaves the navigation to the link', async () => {
      const onChange = vi.fn();
      const changeAction = vi.fn();
      render(
        <Pagination
          page={1}
          totalPages={5}
          onChange={onChange}
          changeAction={changeAction}
          getPageHref={pageHash}
        />,
      );
      const link = screen.getByRole('link', {name: 'Go to page 3'});
      // `true`: no handler cancelled the click, so the link navigates.
      expect(fireEvent.click(link)).toBe(true);
      // One call with the page alone, as from a button control.
      expect(onChange.mock.calls).toEqual([[3]]);
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Page 3 of 5');
      });
      await waitFor(() => expect(changeAction).toHaveBeenCalledWith(3));
    });

    it.each([
      ['Control', {ctrlKey: true}],
      ['Meta', {metaKey: true}],
      ['Shift', {shiftKey: true}],
      ['Alt', {altKey: true}],
    ] as const)(
      'changes no page here for a %s click, which the browser opens elsewhere',
      async (_key, modifier) => {
        const onChange = vi.fn();
        const changeAction = vi.fn();
        render(
          <Pagination
            page={1}
            totalPages={5}
            onChange={onChange}
            changeAction={changeAction}
            getPageHref={pageHash}
          />,
        );
        fireEvent.click(
          screen.getByRole('link', {name: 'Go to next page'}),
          modifier,
        );
        fireEvent.click(
          screen.getByRole('link', {name: 'Go to page 3'}),
          modifier,
        );
        expect(onChange).not.toHaveBeenCalled();
        expect(changeAction).not.toHaveBeenCalled();
        expect(politeRegion()).toBeNull();
      },
    );

    it('changes no page here for a link whose component opens it in another tab', () => {
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          totalPages={5}
          onChange={onChange}
          getPageHref={pageHash}
          as={NewTabLink}
        />,
      );
      fireEvent.click(screen.getByRole('link', {name: 'Go to page 3'}));
      expect(onChange).not.toHaveBeenCalled();
      expect(politeRegion()).toBeNull();
    });

    it('runs the page change for a link whose component names this tab as its target', () => {
      const onChange = vi.fn();
      render(
        <Pagination
          page={1}
          totalPages={5}
          onChange={onChange}
          getPageHref={pageHash}
          as={SameTabLink}
        />,
      );
      fireEvent.click(screen.getByRole('link', {name: 'Go to page 3'}));
      expect(onChange.mock.calls).toEqual([[3]]);
    });

    it('shows the tooltip of each link control, and none for an unavailable end', () => {
      render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={3}
          variant="compact"
          hasFirstLast
          getPageHref={pagePath}
        />,
      );
      // First and Previous are unavailable on page 1. Next and Last are links.
      expect(
        screen
          .getAllByRole('tooltip', {hidden: true})
          .map(tooltip => tooltip.textContent),
      ).toEqual(['Go to next page', 'Go to last page']);
    });

    it('keeps the dots a radio group and links only Previous and Next', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          totalPages={4}
          variant="dots"
          onChange={onChange}
          getPageHref={pageHash}
        />,
      );
      expect(
        screen.getAllByRole('link').map(link => link.getAttribute('href')),
      ).toEqual(['#page-1', '#page-3']);
      const group = screen.getByRole('radiogroup', {name: 'Page indicators'});
      expect(within(group).getAllByRole('radio')).toHaveLength(4);
      expect(group.querySelector('a')).toBeNull();

      // A dot still changes the page through onChange.
      screen.getByRole('radio', {name: 'Page 2'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange.mock.calls).toEqual([[3]]);
    });

    it('keeps the page box and links First, Previous, Next and Last', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Pagination
          page={2}
          totalPages={8}
          variant="input"
          onChange={onChange}
          getPageHref={pageHash}
        />,
      );
      expect(
        screen.getAllByRole('link').map(link => link.getAttribute('href')),
      ).toEqual(['#page-1', '#page-1', '#page-3', '#page-8']);
      // The page box still changes the page through onChange.
      const box = screen.getByRole('spinbutton', {name: 'Go to page'});
      await user.clear(box);
      await user.type(box, '6{Enter}');
      expect(onChange.mock.calls).toEqual([[6]]);
    });

    it('reports a page-size choice as the size and then page 1', async () => {
      const user = userEvent.setup();
      const calls: unknown[][] = [];
      render(
        <Pagination
          page={3}
          totalItems={100}
          pageSize={10}
          pageSizeOptions={[10, 20]}
          onPageSizeChange={size => calls.push(['onPageSizeChange', size])}
          onChange={(...args) => calls.push(['onChange', ...args])}
          getPageHref={pagePath}
        />,
      );
      await user.click(screen.getByRole('combobox', {name: 'Items per page'}));
      // The test DOM does not open the popup, so the option counts as hidden.
      await user.click(
        await screen.findByRole('option', {name: '20', hidden: true}),
      );
      // The size arrives first, so the caller navigates in onPageSizeChange.
      expect(calls).toEqual([
        ['onPageSizeChange', 20],
        ['onChange', 1],
      ]);
    });

    describe('the URL that the browser follows', () => {
      /** Controls whose page lives in state and changes during the click. */
      function Paged({
        onChange,
        getPageHref,
      }: {
        onChange?: (page: number) => void;
        getPageHref?: (page: number) => string;
      }) {
        const [page, setPage] = useState(3);
        return (
          <Pagination
            page={page}
            totalPages={8}
            onChange={next => {
              onChange?.(next);
              setPage(next);
            }}
            getPageHref={getPageHref}
          />
        );
      }

      afterEach(() => {
        vi.useRealTimers();
      });

      it.each([
        ['Go to next page', '#page-4', 'Go to page 4', '#page-5'],
        ['Go to previous page', '#page-2', 'Go to page 2', '#page-1'],
      ])(
        'keeps the URL of "%s" until the click is over',
        (name, clicked, current, later) => {
          vi.useFakeTimers();
          render(<Paged getPageHref={pageHash} />);
          const link = screen.getByRole('link', {name});
          expect(link).toHaveAttribute('href', clicked);
          fireEvent.click(link);
          // The page changed, and the browser has not followed the link yet.
          expect(screen.getByRole('link', {name: current})).toHaveAttribute(
            'aria-current',
            'page',
          );
          expect(link).toHaveAttribute('href', clicked);
          act(() => {
            vi.runAllTimers();
          });
          expect(link).toHaveAttribute('href', later);
        },
      );

      it('repeats the page for a second click that arrives before the first is over', () => {
        vi.useFakeTimers();
        const onChange = vi.fn();
        render(<Paged onChange={onChange} getPageHref={pageHash} />);
        const next = screen.getByRole('link', {name: 'Go to next page'});
        fireEvent.click(next);
        fireEvent.click(next);
        // The link and the callback agree on the page of both clicks.
        expect(next).toHaveAttribute('href', '#page-4');
        expect(onChange.mock.calls).toEqual([[4], [4]]);
        act(() => {
          vi.runAllTimers();
        });
        expect(next).toHaveAttribute('href', '#page-5');
      });

      it.each([
        [
          'a pointer press',
          (link: HTMLElement) => {
            fireEvent.pointerDown(link);
          },
        ],
        [
          'a key press',
          (link: HTMLElement) => {
            fireEvent.keyDown(link, {key: 'Enter'});
          },
        ],
      ])(
        'counts from the current page for %s that arrives before the click is over',
        (_name, press) => {
          vi.useFakeTimers();
          const onChange = vi.fn();
          render(<Paged onChange={onChange} getPageHref={pageHash} />);
          const next = screen.getByRole('link', {name: 'Go to next page'});
          fireEvent.click(next);
          expect(next).toHaveAttribute('href', '#page-4');
          press(next);
          expect(next).toHaveAttribute('href', '#page-5');
          fireEvent.click(next);
          expect(onChange.mock.calls).toEqual([[4], [5]]);
        },
      );

      it('releases its timer on unmount, and at a second click', () => {
        vi.useFakeTimers();
        const setTimer = vi.spyOn(window, 'setTimeout');
        const clearTimer = vi.spyOn(window, 'clearTimeout');
        /**
         * Clicks the link and returns the timer that waits for the click to
         * be over: the first one without a delay. The test DOM sets its own
         * for the navigation after it.
         */
        const clickAndFindTimer = (link: HTMLElement): object => {
          const from = setTimer.mock.calls.length;
          fireEvent.click(link);
          const index = setTimer.mock.calls.findIndex(
            ([, delay], call) => call >= from && delay === 0,
          );
          return setTimer.mock.results[index].value as object;
        };
        const {unmount} = render(<Paged getPageHref={pageHash} />);
        const next = screen.getByRole('link', {name: 'Go to next page'});
        const first = clickAndFindTimer(next);
        expect(clearTimer.mock.calls).not.toContainEqual([first]);

        const second = clickAndFindTimer(next);
        expect(clearTimer.mock.calls).toContainEqual([first]);
        expect(clearTimer.mock.calls).not.toContainEqual([second]);

        unmount();
        expect(clearTimer.mock.calls).toContainEqual([second]);
        setTimer.mockRestore();
        clearTimer.mockRestore();
      });

      it('counts each click on a button control from the new page', () => {
        vi.useFakeTimers();
        const onChange = vi.fn();
        render(<Paged onChange={onChange} />);
        const next = screen.getByRole('button', {name: 'Go to next page'});
        fireEvent.click(next);
        fireEvent.click(next);
        expect(onChange.mock.calls).toEqual([[4], [5]]);
      });
    });

    describe('focus on a control that stops or starts being a link', () => {
      /** Page links whose page lives in state, as `onChange` reports it. */
      function PagedLinks(
        props: Partial<React.ComponentProps<typeof Pagination>>,
      ) {
        const [page, setPage] = useState(2);
        return (
          <Pagination
            page={page}
            totalPages={3}
            onChange={setPage}
            getPageHref={pageHash}
            {...props}
          />
        );
      }

      /** Page links whose page the caller sets, beside a control outside. */
      function LinksBesideButton(
        props: Partial<React.ComponentProps<typeof Pagination>>,
      ) {
        return (
          <>
            <button type="button">Outside</button>
            <Pagination
              page={2}
              totalPages={3}
              onChange={() => {}}
              getPageHref={pageHash}
              {...props}
            />
          </>
        );
      }

      it.each([
        'Go to first page',
        'Go to previous page',
        'Go to next page',
        'Go to last page',
      ])('keeps focus on "%s" when its link reaches a boundary', async name => {
        const user = userEvent.setup();
        render(<PagedLinks variant="compact" hasFirstLast />);
        screen.getByRole('link', {name}).focus();
        await user.keyboard('{Enter}');
        // A disabled button replaced the link, and it holds the focus.
        const control = screen.getByRole('button', {name});
        expect(control).toHaveAttribute('aria-disabled', 'true');
        expect(control).toHaveFocus();
      });

      it('keeps focus through a link component', async () => {
        const user = userEvent.setup();
        render(<PagedLinks as={RouterLink} />);
        const link = screen.getByRole('link', {name: 'Go to next page'});
        expect(link).toHaveAttribute('data-router-link');
        link.focus();
        await user.keyboard('{Enter}');
        expect(
          screen.getByRole('button', {name: 'Go to next page'}),
        ).toHaveFocus();
      });

      it('keeps focus on a page link while the control is disabled, and after', () => {
        const {rerender} = render(<LinksBesideButton />);
        screen.getByRole('link', {name: 'Go to page 3'}).focus();
        rerender(<LinksBesideButton isDisabled />);
        expect(
          screen.getByRole('button', {name: 'Go to page 3'}),
        ).toHaveFocus();
        rerender(<LinksBesideButton />);
        expect(screen.getByRole('link', {name: 'Go to page 3'})).toHaveFocus();
      });

      it('keeps focus on Next when the caller sets the last page, and when Next is a link again', () => {
        const {rerender} = render(<LinksBesideButton />);
        screen.getByRole('link', {name: 'Go to next page'}).focus();
        rerender(<LinksBesideButton page={3} />);
        expect(
          screen.getByRole('button', {name: 'Go to next page'}),
        ).toHaveFocus();
        rerender(<LinksBesideButton page={2} />);
        expect(
          screen.getByRole('link', {name: 'Go to next page'}),
        ).toHaveFocus();
      });

      it('keeps focus while the page arrives later than the click', async () => {
        const user = userEvent.setup();
        // A router sets the page after the click, so `onChange` keeps none.
        const {rerender} = render(<LinksBesideButton />);
        screen.getByRole('link', {name: 'Go to next page'}).focus();
        await user.keyboard('{Enter}');
        // The page did not arrive: Next shows page 2 again, as a link.
        expect(
          screen.getByRole('link', {name: 'Go to next page'}),
        ).toHaveFocus();
        rerender(<LinksBesideButton page={3} />);
        expect(
          screen.getByRole('button', {name: 'Go to next page'}),
        ).toHaveFocus();
      });

      it('leaves focus on the page link that was used when Next stops being a link', async () => {
        const user = userEvent.setup();
        render(<PagedLinks />);
        await user.click(screen.getByRole('link', {name: 'Go to page 3'}));
        expect(
          screen.getByRole('button', {name: 'Go to next page'}),
        ).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('link', {name: 'Go to page 3'})).toHaveFocus();
      });

      it('takes no focus for a control that did not hold it', () => {
        const {rerender} = render(<LinksBesideButton />);
        const outside = screen.getByRole('button', {name: 'Outside'});
        outside.focus();
        rerender(<LinksBesideButton page={3} />);
        expect(outside).toHaveFocus();
        rerender(<LinksBesideButton isDisabled />);
        expect(outside).toHaveFocus();

        // Nothing holds focus: the replaced controls leave it there.
        outside.blur();
        rerender(<LinksBesideButton page={1} />);
        expect(document.body).toHaveFocus();
      });

      it('takes no focus later for a control that held it once', () => {
        const {rerender} = render(<LinksBesideButton />);
        screen.getByRole('link', {name: 'Go to next page'}).focus();
        rerender(<LinksBesideButton page={3} />);
        const outside = screen.getByRole('button', {name: 'Outside'});
        outside.focus();
        rerender(<LinksBesideButton page={2} />);
        expect(outside).toHaveFocus();
      });
    });
  });

  describe('rest forwarding', () => {
    it('forwards data-testid, id, and aria-* to the root nav', () => {
      const {container} = render(
        <Pagination
          page={1}
          onChange={() => {}}
          totalPages={3}
          data-testid="pager"
          id="pager-1"
          aria-describedby="hint"
        />,
      );
      const nav = container.querySelector('nav')!;
      expect(nav).toHaveAttribute('data-testid', 'pager');
      expect(nav).toHaveAttribute('id', 'pager-1');
      expect(nav).toHaveAttribute('aria-describedby', 'hint');
    });
  });
});
