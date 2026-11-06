// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toolbar.test.tsx
 * @input Uses vitest, @testing-library/react, user-event, Toolbar, MoreMenu
 * @output Unit tests for Toolbar component and nested popover focus ownership
 * @position Testing; validates Toolbar implementation and post-dismissal tab stops
 *
 * SYNC: When Toolbar component changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {Toolbar} from './Toolbar';
import {MoreMenu} from '../MoreMenu';
import {
  paddingBlockStyles,
  paddingInlineStyles,
} from '../Layout/padding.stylex';

describe('Toolbar', () => {
  it('renders with toolbar role', () => {
    render(<Toolbar label="Actions" />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('renders aria-label from label prop', () => {
    render(<Toolbar label="Formatting actions" />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-label',
      'Formatting actions',
    );
  });

  it('renders startContent slot', () => {
    render(
      <Toolbar
        label="Actions"
        startContent={<span data-testid="start">Start</span>}
      />,
    );
    expect(screen.getByTestId('start')).toBeInTheDocument();
  });

  it('renders endContent slot', () => {
    render(
      <Toolbar
        label="Actions"
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('renders centerContent slot', () => {
    render(
      <Toolbar
        label="Actions"
        centerContent={<span data-testid="center">Center</span>}
      />,
    );
    expect(screen.getByTestId('center')).toBeInTheDocument();
  });

  it('renders all three slots together', () => {
    render(
      <Toolbar
        label="Actions"
        startContent={<span data-testid="start">Start</span>}
        centerContent={<span data-testid="center">Center</span>}
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(screen.getByTestId('center')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();

    // Three-slot layout produces 3 child divs (plus the aria-hidden
    // keyboard-hint layer infrastructure, excluded as an implementation detail)
    const toolbar = screen.getByRole('toolbar');
    expect(
      toolbar.querySelectorAll(':scope > :not([popover]):not(template)'),
    ).toHaveLength(3);
  });

  it('renders two-slot layout without centerContent', () => {
    render(
      <Toolbar
        label="Actions"
        startContent={<span data-testid="start">Start</span>}
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();

    // Two-slot layout produces 2 child divs (plus the aria-hidden
    // keyboard-hint layer infrastructure, excluded here)
    const toolbar = screen.getByRole('toolbar');
    expect(
      toolbar.querySelectorAll(':scope > :not([popover]):not(template)'),
    ).toHaveLength(2);
  });

  it('renders start-only layout', () => {
    render(
      <Toolbar
        label="Actions"
        startContent={<span data-testid="start">Start</span>}
      />,
    );
    expect(screen.getByTestId('start')).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar');
    expect(
      toolbar.querySelectorAll(':scope > :not([popover]):not(template)'),
    ).toHaveLength(1);
  });

  it('renders end-only layout', () => {
    render(
      <Toolbar
        label="Actions"
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('end')).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar');
    expect(
      toolbar.querySelectorAll(':scope > :not([popover]):not(template)'),
    ).toHaveLength(1);
  });

  it('sets aria-orientation to horizontal by default', () => {
    render(<Toolbar label="Actions" />);
    expect(screen.getByRole('toolbar')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  it('reflects the size', () => {
    render(<Toolbar label="Actions" size="sm" />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('data-size', 'sm');
  });

  it.each([
    ['sm', 2],
    ['md', 2],
  ] as const)(
    'uses the %s block inset without overriding container inline padding',
    (size, blockPadding) => {
      const {container} = render(<Toolbar label="Actions" size={size} />);
      const sectionInner = container.querySelector('.astryx-section');
      const expectedBlockClasses = stylex
        .props(paddingBlockStyles[blockPadding])
        .className?.split(' ')
        .filter(Boolean);
      const compactInlineClasses = stylex
        .props(paddingInlineStyles[1])
        .className?.split(' ')
        .filter(Boolean);

      expect(sectionInner).toBeInTheDocument();
      expect(expectedBlockClasses).not.toHaveLength(0);
      expect(sectionInner).toHaveClass(...(expectedBlockClasses ?? []));
      expect(sectionInner).not.toHaveClass(...(compactInlineClasses ?? []));
    },
  );

  it('defaults to md size', () => {
    render(<Toolbar label="Actions" />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('data-size', 'md');
  });

  it('reflects lg size', () => {
    render(<Toolbar label="Actions" size="lg" />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('data-size', 'lg');
  });

  it('forwards ref to root element', () => {
    const ref = vi.fn();
    render(<Toolbar label="Actions" ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes variant to Section', () => {
    const {container} = render(<Toolbar label="Actions" variant="muted" />);
    // Section renders with astryx-section class containing the variant
    const sectionInner = container.querySelector('.astryx-section');
    expect(sectionInner).toBeInTheDocument();
    expect(sectionInner).toHaveAttribute('data-variant', 'muted');
  });

  it('defaults to transparent variant', () => {
    const {container} = render(<Toolbar label="Actions" />);
    const sectionInner = container.querySelector('.astryx-section');
    expect(sectionInner).toBeInTheDocument();
    expect(sectionInner).toHaveAttribute('data-variant', 'transparent');
  });

  describe('slot clipping', () => {
    // The slot wrappers are the direct parents of the caller's content. A slot
    // that clips its overflow cuts off anything its children paint outside
    // their own box (box-shadow, focus rings, hover halos).
    function slotOf(testId: string): HTMLElement {
      const slot = screen.getByTestId(testId).parentElement;
      if (slot == null) {
        throw new Error(`expected "${testId}" to sit inside a slot`);
      }
      return slot;
    }

    function clipsOverflow(el: HTMLElement): boolean {
      const style = getComputedStyle(el);
      return [style.overflow, style.overflowX, style.overflowY].some(value =>
        ['hidden', 'clip', 'auto', 'scroll'].includes(value),
      );
    }

    it('does not clip any slot in the three-slot layout', () => {
      render(
        <Toolbar
          label="Actions"
          startContent={<span data-testid="start">Start</span>}
          centerContent={<span data-testid="center">Center</span>}
          endContent={<span data-testid="end">End</span>}
        />,
      );
      expect(clipsOverflow(slotOf('start'))).toBe(false);
      expect(clipsOverflow(slotOf('center'))).toBe(false);
      expect(clipsOverflow(slotOf('end'))).toBe(false);
    });

    it('does not clip any slot in the two-slot layout', () => {
      render(
        <Toolbar
          label="Actions"
          startContent={<span data-testid="start">Start</span>}
          endContent={<span data-testid="end">End</span>}
        />,
      );
      expect(clipsOverflow(slotOf('start'))).toBe(false);
      expect(clipsOverflow(slotOf('end'))).toBe(false);
    });

    it('still lets the center slot shrink below its content width', () => {
      render(
        <Toolbar
          label="Actions"
          startContent={<span data-testid="start">Start</span>}
          centerContent={<span data-testid="center">Center</span>}
          endContent={<span data-testid="end">End</span>}
        />,
      );
      // The `auto` track only shrinks for an item whose minimum width is zero.
      // Dropping the clip must not turn a narrow toolbar into a wider one.
      expect(parseFloat(getComputedStyle(slotOf('center')).minWidth)).toBe(0);
    });
  });

  it('navigates with ArrowRight/ArrowLeft in horizontal orientation', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        label="Actions"
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
            <button type="button">Paste</button>
          </>
        }
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons[1]);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons[2]);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('navigates with ArrowDown/ArrowUp in vertical orientation', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        label="Actions"
        orientation="vertical"
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
            <button type="button">Paste</button>
          </>
        }
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(buttons[1]);

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('supports Home and End keys', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        label="Actions"
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
            <button type="button">Paste</button>
          </>
        }
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons[1].focus();

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(buttons[2]);

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('spreads additional HTML attributes to toolbar element', () => {
    render(<Toolbar label="Actions" data-testid="my-toolbar" />);
    expect(screen.getByTestId('my-toolbar')).toBe(screen.getByRole('toolbar'));
  });

  it('is a single tab stop — only one item is tabbable (navigation-3)', () => {
    render(
      <Toolbar
        label="Actions"
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
            <button type="button">Paste</button>
          </>
        }
      />,
    );
    const buttons = screen.getAllByRole('button');
    const tabbable = buttons.filter(b => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('tabindex', '0');
    expect(buttons[1]).toHaveAttribute('tabindex', '-1');
    expect(buttons[2]).toHaveAttribute('tabindex', '-1');
  });

  it('keeps a link member in the arrow order and off the tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toolbar
          label="Actions"
          startContent={
            <>
              <button type="button">Cut</button>
              <a href="https://example.com">Docs</a>
              <button type="button">Paste</button>
            </>
          }
        />
        <button type="button">After</button>
      </>,
    );

    const cut = screen.getByRole('button', {name: 'Cut'});
    cut.focus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();

    cut.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', {name: 'Docs'})).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', {name: 'Paste'})).toHaveFocus();
  });

  it('keeps its tab stop after outside dismissal of MoreMenu', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Toolbar
          label="Actions"
          startContent={<button type="button">Copy</button>}
          endContent={
            <MoreMenu
              label="More actions"
              items={[{label: 'Duplicate'}, {label: 'Delete'}]}
            />
          }
        />
        <button type="button">After</button>
      </>,
    );

    const trigger = screen.getByRole('button', {name: 'More actions'});
    // Seed the trigger's tab stop with keyboard navigation so this tests
    // boundary ownership independently of pointer-focus synchronization.
    act(() => screen.getByRole('button', {name: 'Copy'}).focus());
    await user.keyboard('{ArrowRight}');
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole('menu', {hidden: true})).toHaveFocus(),
    );

    const item = screen.getByRole('menuitem', {
      name: 'Duplicate',
      hidden: true,
    });
    act(() => item.focus());
    expect(item).toHaveFocus();
    expect(trigger.getAttribute('tabindex')).toBe('0');
    expect(
      screen.getByRole('button', {name: 'Copy'}).getAttribute('tabindex'),
    ).toBe('-1');
    expect(
      screen.getByRole('menu', {hidden: true}).getAttribute('tabindex'),
    ).not.toBe('0');

    await user.click(screen.getByRole('button', {name: 'After'}));
    // jsdom has no native light dismiss. Deliver the browser's close event
    // after focus has moved outside, without restoring it to the trigger.
    const popover = item.closest('[popover]');
    fireEvent(
      popover!,
      Object.assign(new Event('toggle'), {newState: 'closed'}),
    );
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    await user.tab({shift: true});
    expect(trigger).toHaveFocus();
    await user.tab({shift: true});
    expect(screen.getByRole('button', {name: 'Before'})).toHaveFocus();
  });

  it('leaves navigation inside an open MoreMenu to the menu', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        label="Actions"
        startContent={<button type="button">Copy</button>}
        endContent={
          <MoreMenu
            label="More actions"
            items={[{label: 'Duplicate'}, {label: 'Delete'}]}
          />
        }
      />,
    );
    const trigger = screen.getByRole('button', {name: 'More actions'});
    act(() => screen.getByRole('button', {name: 'Copy'}).focus());
    await user.keyboard('{ArrowRight}');
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole('menu', {hidden: true})).toHaveFocus(),
    );

    const first = screen.getByRole('menuitem', {
      name: 'Duplicate',
      hidden: true,
    });
    const last = screen.getByRole('menuitem', {name: 'Delete', hidden: true});
    act(() => first.focus());
    await user.keyboard('{ArrowLeft}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(first).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(last).toHaveFocus();

    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('keeps its own arrow navigation when rendered inside a popover', async () => {
    const user = userEvent.setup();
    render(
      <div popover="manual">
        <Toolbar
          label="Actions"
          startContent={
            <>
              <button type="button">Copy</button>
              <button type="button">Paste</button>
            </>
          }
        />
      </div>,
    );
    // jsdom does not open native popovers; the ancestor still tests ownership.
    const copy = screen.getByRole('button', {name: 'Copy', hidden: true});
    const paste = screen.getByRole('button', {name: 'Paste', hidden: true});
    act(() => copy.focus());
    await user.keyboard('{ArrowRight}');
    expect(paste).toHaveFocus();
    expect(paste.getAttribute('tabindex')).toBe('0');
  });

  it('does not steal caret keys from a text input mid-line (navigation-4)', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        label="Search"
        startContent={
          <>
            <input type="text" aria-label="Query" defaultValue="hello" />
            <button type="button">Go</button>
          </>
        }
      />,
    );
    const inputEl = screen.getByLabelText('Query');
    if (!(inputEl instanceof HTMLInputElement)) {
      throw new Error('expected an input');
    }
    inputEl.focus();
    inputEl.setSelectionRange(1, 1); // caret mid-line
    await user.keyboard('{ArrowRight}');
    // Caret movement stays in the input; focus is not stolen by the toolbar.
    expect(document.activeElement).toBe(inputEl);
  });

  it('composes consumer onKeyDown with internal arrow navigation', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();

    render(
      <Toolbar
        label="Actions"
        onKeyDown={onKeyDown}
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
          </>
        }
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    await user.keyboard('{ArrowRight}');

    expect(onKeyDown).toHaveBeenCalled();
    expect(buttons[1]).toHaveFocus();
  });

  it('respects preventDefault from consumer onKeyDown', async () => {
    const user = userEvent.setup();

    render(
      <Toolbar
        label="Actions"
        onKeyDown={e => e.preventDefault()}
        startContent={
          <>
            <button type="button">Cut</button>
            <button type="button">Copy</button>
          </>
        }
      />,
    );

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    await user.keyboard('{ArrowRight}');

    expect(buttons[0]).toHaveFocus();
  });
});
