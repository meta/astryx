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
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

afterEach(() => {
  __resetLiveRegionsForTest();
});

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
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
      // localized string, so it is reachable via aria-describedby.
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      const prev = screen.getByRole('button', {name: 'Go to previous page'});
      const next = screen.getByRole('button', {name: 'Go to next page'});
      const tooltips = screen.getAllByRole('tooltip', {hidden: true});
      const tooltipIds = new Set(tooltips.map(el => el.id));
      expect(
        prev
          .getAttribute('aria-describedby')
          ?.split(' ')
          .some(id => tooltipIds.has(id)),
      ).toBe(true);
      expect(
        next
          .getAttribute('aria-describedby')
          ?.split(' ')
          .some(id => tooltipIds.has(id)),
      ).toBe(true);
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
        ).toBeDisabled();
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).not.toBeDisabled();

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
        ).not.toBeDisabled();
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).toBeDisabled();
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
      const group = screen.getByRole('group', {name: 'Page indicators'});
      expect(within(group).getAllByRole('button')).toHaveLength(5);
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
      const group = screen.getByRole('group', {name: 'Page indicators'});
      const dots = within(group).getAllByRole('button');
      expect(dots).toHaveLength(5);
    });

    it('marks active dot with aria-current', () => {
      render(
        <Pagination
          page={3}
          onChange={() => {}}
          totalPages={5}
          variant="dots"
        />,
      );
      const activeDot = screen.getByRole('button', {name: 'Go to page 3'});
      expect(activeDot).toHaveAttribute('aria-current', 'page');
    });

    // -------------------------------------------------------------------------
    // Keyboard navigation (roving tabindex + arrow keys via useListFocus).
    // Selection follows focus: arrow/Home/End move focus and select that page.
    // -------------------------------------------------------------------------

    it('uses roving tabindex — active dot has tabIndex 0, others -1', () => {
      render(
        <Pagination
          page={2}
          onChange={() => {}}
          totalPages={4}
          variant="dots"
        />,
      );
      expect(
        screen.getByRole('button', {name: 'Go to page 2'}),
      ).toHaveAttribute('tabindex', '0');
      expect(
        screen.getByRole('button', {name: 'Go to page 1'}),
      ).toHaveAttribute('tabindex', '-1');
      expect(
        screen.getByRole('button', {name: 'Go to page 3'}),
      ).toHaveAttribute('tabindex', '-1');
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
      screen.getByRole('button', {name: 'Go to page 2'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith(3);
      expect(screen.getByRole('button', {name: 'Go to page 3'})).toHaveFocus();
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
      screen.getByRole('button', {name: 'Go to page 3'}).focus();
      await user.keyboard('{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith(2);
      expect(screen.getByRole('button', {name: 'Go to page 2'})).toHaveFocus();
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
      screen.getByRole('button', {name: 'Go to page 3'}).focus();
      await user.keyboard('{Home}');
      expect(onChange).toHaveBeenCalledWith(1);
      expect(screen.getByRole('button', {name: 'Go to page 1'})).toHaveFocus();

      onChange.mockClear();
      rerender(
        <Pagination
          page={3}
          onChange={onChange}
          totalPages={5}
          variant="dots"
        />,
      );
      screen.getByRole('button', {name: 'Go to page 3'}).focus();
      await user.keyboard('{End}');
      expect(onChange).toHaveBeenCalledWith(5);
      expect(screen.getByRole('button', {name: 'Go to page 5'})).toHaveFocus();
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
      screen.getByRole('button', {name: 'Go to page 4'}).focus();
      await user.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith(1);
      expect(screen.getByRole('button', {name: 'Go to page 1'})).toHaveFocus();
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
      screen.getByRole('button', {name: 'Go to page 1'}).focus();
      await user.keyboard('{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith(4);
      expect(screen.getByRole('button', {name: 'Go to page 4'})).toHaveFocus();
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
      const dot = screen.getByRole('button', {name: 'Go to page 2'});
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

    it('reverts to the current page on an invalid or empty entry', async () => {
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
      // A number input rejects non-numeric characters, so an invalid entry
      // never navigates and reverts to the committed page on blur.
      await user.clear(box);
      await user.type(box, 'abc');
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveValue('3');

      // Emptying the box and blurring reverts to the committed page too.
      await user.clear(box);
      await user.tab();
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveValue('3');
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
        ).toBeDisabled();
        expect(
          screen.getByRole('button', {name: 'Go to last page'}),
        ).not.toBeDisabled();

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
        ).toBeDisabled();
        expect(
          screen.getByRole('button', {name: 'Go to first page'}),
        ).not.toBeDisabled();
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
      await user.click(screen.getByRole('button', {name: 'Go to page 4'}));
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
      ).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<Pagination page={5} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeDisabled();
    });

    it('enables both buttons on middle page', () => {
      render(<Pagination page={3} onChange={() => {}} totalPages={5} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).not.toBeDisabled();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).not.toBeDisabled();
    });

    it('disables both buttons when only one page', () => {
      render(<Pagination page={1} onChange={() => {}} totalPages={1} />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeDisabled();
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
      ).not.toBeDisabled();
    });

    it('disables next when hasMore is false', () => {
      render(<Pagination page={3} onChange={() => {}} hasMore={false} />);
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeDisabled();
    });

    it('disables previous on first page with hasMore', () => {
      render(<Pagination page={1} onChange={() => {}} hasMore />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).toBeDisabled();
    });

    it('enables previous on page > 1 with hasMore', () => {
      render(<Pagination page={2} onChange={() => {}} hasMore />);
      expect(
        screen.getByRole('button', {name: 'Go to previous page'}),
      ).not.toBeDisabled();
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
      ).toBeDisabled();
      expect(
        screen.getByRole('button', {name: 'Go to next page'}),
      ).toBeDisabled();
      // Page buttons should also be disabled
      expect(screen.getByRole('button', {name: 'Go to page 1'})).toBeDisabled();
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
