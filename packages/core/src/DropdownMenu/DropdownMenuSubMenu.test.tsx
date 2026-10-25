// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSubMenu.test.tsx
 * @input vitest, @testing-library/react, DropdownMenu + DropdownMenuSubMenu
 * @output Unit tests for DropdownMenuSubMenu (#3829)
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {createRef, useState} from 'react';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {DropdownMenuSubMenu} from './DropdownMenuSubMenu';
import {warmMenuBottomSheet} from './__tests__/warmMenuBottomSheet';
import {IconButton} from '../IconButton';
import {RadioList, RadioListItem} from '../RadioList';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';
import {rtlStyles} from '../utils';

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

function MoveMenu({onMove}: {onMove?: (folder: string) => void} = {}) {
  return (
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem label="Rename" onClick={() => {}} />
      <DropdownMenuSubMenu label="Move to">
        <DropdownMenuItem label="Folder A" onClick={() => onMove?.('a')} />
        <DropdownMenuItem label="Folder B" onClick={() => onMove?.('b')} />
      </DropdownMenuSubMenu>
    </DropdownMenu>
  );
}

describe('DropdownMenuSubMenu', () => {
  it('renders the trigger with aria-haspopup and collapsed aria-expanded', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the flyout on trigger click and exposes its items', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    expect(
      screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
    ).toBeInTheDocument();
  });

  it('caps the flyout width and height to the available viewport', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" menuWidth={640}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);

    const flyout = screen.getByRole('menu', {name: /Move to/, hidden: true});
    const popover = flyout.closest('[popover]');
    expect(popover?.className).toContain(
      'DropdownMenuSubMenu__flyoutStyles.popoverViewport',
    );
    expect(popover).not.toHaveStyle(
      'margin-inline-start: max(var(--spacing-2),env(safe-area-inset-left,0px))',
    );
    expect(popover).not.toHaveStyle(
      'margin-inline-end: max(var(--spacing-2),env(safe-area-inset-right,0px))',
    );
    expect(popover).toHaveStyle({minWidth: 'var(--x-minWidth)'});
    expect(popover?.getAttribute('style')).toContain('min(640px, calc(100vw');
    expect(flyout).toHaveStyle(
      'max-height: min(300px,calc(100dvb - calc(max(var(--spacing-4), env(safe-area-inset-top, 0px)) + var(--astryx-layer-inset-block-start, 0px)) - calc(max(var(--spacing-4), env(safe-area-inset-bottom, 0px)) + var(--astryx-layer-inset-block-end, 0px))))',
    );
    expect(flyout).not.toHaveStyle({overflowY: 'auto'});
    expect(flyout).toHaveAttribute('tabindex', '-1');

    Object.defineProperties(flyout, {
      clientHeight: {configurable: true, value: 300},
      scrollHeight: {configurable: true, value: 480},
    });
    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(flyout).toHaveStyle({overflowY: 'auto'});
      expect(flyout).toHaveAttribute('tabindex', '0');
    });
  });

  it.each(['max-content', 'fit-content', 'auto'])(
    'preserves the valid %s flyout width while retaining the viewport cap',
    async menuWidth => {
      const user = userEvent.setup();
      render(
        <DropdownMenu button={{label: 'Actions'}}>
          <DropdownMenuSubMenu label="Move to" menuWidth={menuWidth}>
            <DropdownMenuItem label="Folder A" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      await user.click(screen.getByRole('button', {name: /Actions/}));
      await user.click(
        screen.getByRole('menuitem', {name: /Move to/, hidden: true}),
      );

      const flyout = screen.getByRole('menu', {name: /Move to/, hidden: true});
      const popover = flyout.closest('[popover]');
      expect(popover?.className).toContain(
        'DropdownMenuSubMenu__flyoutStyles.popoverCustomIntrinsicWidth',
      );
      expect(popover?.getAttribute('style')).toContain(menuWidth);
      expect(popover?.className).toContain(
        'DropdownMenuSubMenu__flyoutStyles.popoverViewport',
      );
      expect(popover?.getAttribute('style')).not.toContain(`min(${menuWidth},`);
    },
  );

  it('opens on ArrowRight and returns focus to the trigger on ArrowLeft', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // A pointer open focuses the menu container via rAF (#4477); wait for
    // that to settle before moving focus to the submenu trigger, so the
    // deferred focus can't steal it back mid-test.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    // Focus moved into the flyout's first item.
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(trigger).toHaveFocus();
  });

  it('mirrors its indicator and keyboard directions under RTL', async () => {
    const user = userEvent.setup();
    const {className: mirrorClassName} = stylex.props(rtlStyles.mirror);
    const mirrorClasses = mirrorClassName?.split(' ') ?? [];
    expect(mirrorClasses.length).toBeGreaterThan(0);
    render(
      <div dir="rtl" style={{direction: 'rtl'}}>
        <MoveMenu />
      </div>,
    );

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    const indicator = trigger.querySelector('.astryx-icon');
    expect(indicator).not.toBeNull();
    for (const className of mirrorClasses) {
      expect(indicator).toHaveClass(className);
    }

    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    // jsdom does not propagate the ancestor's computed direction, so set the
    // same RTL direction directly on each keyboard event owner.
    trigger.style.direction = 'rtl';
    trigger.focus();
    await user.keyboard('{ArrowLeft}');
    const flyout = screen.getByRole('menu', {name: /Move to/, hidden: true});
    flyout.style.direction = 'rtl';
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(trigger).toHaveFocus();
  });

  it('names the flyout from its trigger via aria-labelledby', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    const flyout = await screen.findByRole('menu', {
      name: /Move to/,
      hidden: true,
    });
    expect(flyout).toHaveAttribute('aria-labelledby', trigger.id);
  });

  it('invokes the nested item handler on selection', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<MoveMenu onMove={onMove} />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    await user.click(
      screen.getByRole('menuitem', {name: /Move to/, hidden: true}),
    );
    await user.click(
      await screen.findByRole('menuitem', {name: 'Folder A', hidden: true}),
    );
    expect(onMove).toHaveBeenCalledWith('a');
  });

  it('closes the whole menu after selecting a nested item', async () => {
    // Regression: the nested closeMenu only closed the flyout, leaving the
    // root menu open. Selecting a leaf must dismiss the entire stack. The root
    // menu's open state is reflected on its trigger button's aria-expanded.
    const user = userEvent.setup();
    render(<MoveMenu />);
    const button = screen.getByRole('button', {name: /Actions/});
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(
      screen.getByRole('menuitem', {name: /Move to/, hidden: true}),
    );
    await user.click(
      await screen.findByRole('menuitem', {name: 'Folder A', hidden: true}),
    );
    // The whole stack is dismissed — the root menu closed too.
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('activates a nested item with the Enter key and closes the menu', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<MoveMenu onMove={onMove} />);
    const button = screen.getByRole('button', {name: /Actions/});
    await user.click(button);
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // Let the root menu's pointer-open focus (the container, via rAF) settle
    // before moving focus to the submenu trigger, so it can't steal focus
    // back mid-test.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledWith('a');
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('does not open a disabled submenu', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" isDisabled>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('steps through every flyout item with ArrowDown without skipping', async () => {
    // Regression: the flyout renders inline inside the parent menu's
    // roving-focus container, so an unstopped ArrowDown bubbled to the parent
    // and moved focus a second time — skipping the middle item.
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to">
          <DropdownMenuItem label="Projects" onClick={() => {}} />
          <DropdownMenuItem label="Archive" onClick={() => {}} />
          <DropdownMenuItem label="Trash" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // Let the pointer-open container focus (rAF, #4477) settle so it can't
    // steal focus from the manually focused trigger mid-test.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    // Opens and focuses the first item.
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Projects', hidden: true}),
      ).toHaveFocus();
    });
    // ArrowDown lands on the MIDDLE item (previously skipped to Trash).
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Archive', hidden: true}),
      ).toHaveFocus();
    });
    // ArrowDown again lands on the last item.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Trash', hidden: true}),
      ).toHaveFocus();
    });
    // ArrowUp returns to the middle item (no skip in reverse either).
    await user.keyboard('{ArrowUp}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Archive', hidden: true}),
      ).toHaveFocus();
    });
  });
});

describe('DropdownMenuSubMenu host attributes', () => {
  async function openRoot(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', {name: /Actions/}));
    // A pointer open focuses the menu in a frame; let it land first.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    return screen.getByRole('menuitem', {name: /Move to/, hidden: true});
  }

  it('aria-*, data-* and id reach the trigger row, and the flyout stays labelled by it', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu
          label="Move to"
          aria-keyshortcuts="M"
          data-row="move"
          id="move-row">
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'M');
    expect(trigger).toHaveAttribute('data-row', 'move');
    expect(trigger).toHaveAttribute('id', 'move-row');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(
      screen.getByRole('menu', {name: 'Move to', hidden: true}),
    ).toHaveAttribute('aria-labelledby', 'move-row');
  });

  it('reports each flyout open and close to onOpenChange once', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" onOpenChange={onOpenChange}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(onOpenChange).not.toHaveBeenCalled();
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('menuDataTestId names the flyout menu, and data-testid the row', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu
          label="Move to"
          data-testid="move-row"
          menuDataTestId="move-menu">
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(trigger).toHaveAttribute('data-testid', 'move-row');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(screen.getByTestId('move-menu')).toBe(
      screen.getByRole('menu', {name: 'Move to', hidden: true}),
    );
  });

  it('a ref reaches the trigger row', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLElement>();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" ref={ref}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(ref.current).toBe(trigger);
  });

  it("a caller's handlers run after the row's own, and the row still opens and takes the hover focus", async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    const onClick = vi.fn();
    const onPointerMove = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu
          label="Move to"
          onKeyDown={onKeyDown}
          onClick={onClick}
          onPointerMove={onPointerMove}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    fireEvent.pointerMove(trigger, {pointerType: 'mouse'});
    expect(trigger).toHaveFocus();
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    // A key the row does not consume reaches the caller.
    fireEvent.keyDown(trigger, {key: 'm'});
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    fireEvent.click(trigger, {detail: 1});
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a stable callback ref is not re-run as the flyout opens and closes', async () => {
    const user = userEvent.setup();
    const ref = vi.fn<(el: HTMLElement | null) => void>();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" ref={ref}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(ref).toHaveBeenLastCalledWith(trigger);
    ref.mockClear();
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(ref).not.toHaveBeenCalled();
  });

  it("a disabled row does not pass a click on to the caller's onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" isDisabled onClick={onClick}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    // A programmatic or assistive-technology activation.
    act(() => trigger.click());
    expect(onClick).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('the row keeps its own popup state and tab stop', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu
          label="Move to"
          aria-haspopup="listbox"
          aria-expanded={true}>
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    const trigger = await openRoot(user);
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('tabindex', '-1');
  });
});

describe('DropdownMenu data-driven submenus', () => {
  it('renders a submenu when an item declares nested items', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Rename', onClick: () => {}},
          {
            label: 'Move to',
            items: [
              {
                label: 'Folder A',
                onClick: () => {
                  onMove('a');
                },
              },
              {
                label: 'Folder B',
                onClick: () => {
                  onMove('b');
                },
              },
            ],
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(trigger);
    await user.click(
      await screen.findByRole('menuitem', {name: 'Folder B', hidden: true}),
    );
    expect(onMove).toHaveBeenCalledWith('b');
  });

  it('keyboard-reaches an item positioned after a submenu row', async () => {
    // Regression: the submenu flyout renders inline inside the root menu, so
    // the root's item query swept in the (hidden) flyout items. Arrow nav then
    // stalled on those unfocusable items and never reached "Delete" below the
    // submenu row.
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Rename', onClick: () => {}},
          {
            label: 'Move to',
            items: [
              {label: 'Folder A', onClick: () => {}},
              {label: 'Folder B', onClick: () => {}},
            ],
          },
          {type: 'divider'},
          {label: 'Delete', onClick: onDelete},
        ]}
      />,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    // Pointer open focuses the container (#4477); the first ArrowDown then
    // moves onto Rename.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Rename', hidden: true}),
      ).toHaveFocus();
    });
    // Rename → Move to → Delete (no stalling on hidden flyout items).
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: /Move to/, hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalled();
  });
});

describe('DropdownMenuSubMenu accessibility (WCAG 2.2 / APG)', () => {
  // 2.1.2 No Keyboard Trap + APG submenu contract: Escape closes the current
  // submenu and returns focus to its trigger, leaving the parent menu open.
  it('closes only the submenu on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    const button = screen.getByRole('button', {name: /Actions/});
    await user.click(button);
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{Escape}');
    // Submenu collapsed, focus back on the trigger…
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(trigger).toHaveFocus();
    // …but the parent menu is still open (Escape didn't dismiss everything).
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  // 2.1.1 Keyboard: type-ahead is operable inside the flyout.
  it('supports first-character type-ahead within the flyout', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to">
          <DropdownMenuItem label="Apple" onClick={() => {}} />
          <DropdownMenuItem label="Banana" onClick={() => {}} />
          <DropdownMenuItem label="Cherry" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // Let the pointer-open container focus (rAF, #4477) settle so it can't
    // steal focus from the manually focused trigger mid-test.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Apple', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('c');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Cherry', hidden: true}),
      ).toHaveFocus();
    });
  });

  // The core of the inline-flyout fix: a submenu nested inside a submenu must
  // not double-handle arrow keys (each level self-scopes via boundarySelector),
  // so navigation in the deepest flyout steps one item at a time.
  it('navigates a two-level nested submenu without double-stepping', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <DropdownMenu button={{label: 'Share'}}>
        <DropdownMenuItem label="Copy link" onClick={() => {}} />
        <DropdownMenuSubMenu label="Share to">
          <DropdownMenuItem label="Email" onClick={() => {}} />
          <DropdownMenuSubMenu label="Team">
            <DropdownMenuItem
              label="Design"
              onClick={() => {
                onPick('design');
              }}
            />
            <DropdownMenuItem
              label="Eng"
              onClick={() => {
                onPick('eng');
              }}
            />
            <DropdownMenuItem
              label="Data"
              onClick={() => {
                onPick('data');
              }}
            />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Share/}));
    const shareTo = screen.getByRole('menuitem', {
      name: /Share to/,
      hidden: true,
    });
    // Let the root menu's pointer-open focus (the container, via rAF, #4477)
    // settle first so it can't steal focus back after we move to the submenu
    // trigger.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Share', hidden: true}),
      ).toHaveFocus();
    });
    shareTo.focus();
    await user.keyboard('{ArrowRight}');
    // First flyout: focus on Email.
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Email', hidden: true}),
      ).toHaveFocus();
    });
    // Down to the nested submenu trigger, then open it.
    await user.keyboard('{ArrowDown}');
    const teamTrigger = screen.getByRole('menuitem', {
      name: /Team/,
      hidden: true,
    });
    await waitFor(() => {
      expect(teamTrigger).toHaveFocus();
    });
    await user.keyboard('{ArrowRight}');
    // Deepest flyout: Design → Eng → Data, one step per press (no skipping).
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Design', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Eng', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Data', hidden: true}),
      ).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('data');
  });

  // Regression: hovering the submenu trigger while a sibling item still holds
  // focus must move the single focus-driven highlight onto the trigger — not
  // leave two items highlighted at once (the trigger via :hover, the sibling
  // via :focus). Mirrors DropdownMenuItem's hover-focus behavior.
  it('moves focus to the submenu trigger on hover, keeping a single highlight', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));

    const rename = screen.getByRole('menuitem', {
      name: 'Rename',
      hidden: true,
    });
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });

    rename.focus();
    expect(rename).toHaveFocus();

    // A mouse hover over the submenu trigger moves focus onto it, so the single
    // focus-driven highlight follows the pointer instead of leaving two.
    fireEvent.pointerMove(trigger, {pointerType: 'mouse'});
    expect(trigger).toHaveFocus();
    expect(rename).not.toHaveFocus();
  });

  // 1.4.13 Content on Hover or Focus: the flyout stays open while the pointer
  // is over it (moving onto the flyout must not dismiss it).
  it('keeps the flyout open while the pointer is over it', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    const flyout = await screen.findByRole('menu', {
      name: /Move to/,
      hidden: true,
    });
    await user.hover(flyout);
    await user.hover(
      screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
    );
    // Still open after moving the pointer onto the flyout and its items.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  // Async/loading submenu (hasSpinner): the flyout may contain no focusable
  // items yet (only a disabled "Loading…" row). Opening it must still move
  // keyboard ownership INTO the flyout — otherwise focus stays on the parent
  // list, arrow keys rove the parent while the empty flyout stays open, and
  // Enter re-triggers into a broken state.
  it('moves focus into a loading (item-less) flyout so keyboard ownership transfers', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu label="Move to" hasSpinner>
          <DropdownMenuItem label="Loading…" isDisabled onClick={() => {}} />
        </DropdownMenuSubMenu>
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    // The flyout has no focusable items, so focus lands on the flyout container
    // itself — NOT on a parent item (Rename/Delete).
    const flyout = screen.getByRole('menu', {name: /Move to/, hidden: true});
    await waitFor(() => {
      expect(flyout).toHaveFocus();
    });
    expect(
      screen.getByRole('menuitem', {name: 'Rename', hidden: true}),
    ).not.toHaveFocus();
    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).not.toHaveFocus();
    // Left/Escape from the loading flyout closes it and returns to the trigger.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(trigger).toHaveFocus();
  });

  it('roves to the first item once a loading flyout resolves', async () => {
    // After children load, ArrowDown from the focused container moves onto the
    // first real item (container reports index -1, so next = first).
    const user = userEvent.setup();
    function AsyncSubmenu() {
      const [loaded, setLoaded] = useState(false);
      return (
        <DropdownMenu button={{label: 'Actions'}}>
          <DropdownMenuSubMenu
            label="Move to"
            hasSpinner={!loaded}
            onOpenChange={open => {
              if (open) {
                setLoaded(true);
              }
            }}>
            {loaded ? (
              <>
                <DropdownMenuItem label="Folder A" onClick={() => {}} />
                <DropdownMenuItem label="Folder B" onClick={() => {}} />
              </>
            ) : (
              <DropdownMenuItem
                label="Loading…"
                isDisabled
                onClick={() => {}}
              />
            )}
          </DropdownMenuSubMenu>
        </DropdownMenu>
      );
    }
    render(<AsyncSubmenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // Let the pointer-open container focus (rAF, #4477) settle so it can't
    // steal focus from the manually focused trigger mid-test.
    await waitFor(() => {
      expect(
        screen.getByRole('menu', {name: 'Actions', hidden: true}),
      ).toHaveFocus();
    });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    // Children resolve on open; ArrowDown moves from the container to Folder A.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
      ).toHaveFocus();
    });
  });
});

describe('DropdownMenuSubMenu theming slots', () => {
  it('exposes a themeable slot on the submenu indicator icon', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    // The indicator-icon slot sits on the chevron glyph itself (the element
    // that carries the icon size), so a theme can restyle its size/color
    // directly.
    const indicator = trigger.querySelector(
      '.astryx-dropdown-menu-indicator-icon',
    );
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('astryx-icon');
  });
});

describe('DropdownMenuSubMenu hover/click guard', () => {
  it('keeps the flyout open when a hover-open is immediately clicked', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<MoveMenu />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
    ).toHaveFocus();

    vi.useRealTimers();
  });

  it('closes on a click that lands well after the hover-open', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<MoveMenu />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    vi.useRealTimers();
  });

  it('moves focus into the flyout synchronously on a click-open', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);

    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });

    await user.click(trigger);

    // No waitFor: a deferred (rAF) focus would fail here.
    expect(
      screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
    ).toHaveFocus();
  });
});

describe('DropdownMenuSubMenu press model', () => {
  it('a press released on the sub-menu row opens it and keeps the menu', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    const root = screen.getByRole('button', {name: /Actions/});
    await user.click(root);
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    const rename = screen.getByRole('menuitem', {name: 'Rename', hidden: true});
    fireEvent.pointerDown(rename, {pointerType: 'touch', pointerId: 1});
    fireEvent.pointerMove(trigger, {pointerType: 'touch', pointerId: 1});
    fireEvent.pointerUp(trigger, {pointerType: 'touch', pointerId: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(root).toHaveAttribute('aria-expanded', 'true');
  });

  it('a release inside the flyout acts on the flyout row and closes the whole menu', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<MoveMenu onMove={onMove} />);
    const root = screen.getByRole('button', {name: /Actions/});
    await user.click(root);
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    const folderB = screen.getByRole('menuitem', {
      name: 'Folder B',
      hidden: true,
    });
    const folderA = screen.getByRole('menuitem', {
      name: 'Folder A',
      hidden: true,
    });
    fireEvent.pointerDown(folderA, {pointerType: 'touch', pointerId: 1});
    fireEvent.pointerMove(folderB, {pointerType: 'touch', pointerId: 1});
    fireEvent.pointerUp(folderB, {pointerType: 'touch', pointerId: 1});
    fireEvent.click(folderA, {detail: 1});
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('b');
    expect(root).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DropdownMenuSubMenu safe triangle', () => {
  const flyoutRect = {
    top: 0,
    bottom: 200,
    left: 300,
    right: 500,
    width: 200,
    height: 200,
    x: 300,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;

  async function openByHover() {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const flyout = screen.getByRole('menu', {name: /Move to/, hidden: true});
    vi.spyOn(flyout, 'getBoundingClientRect').mockReturnValue(flyoutRect);
    return {trigger, flyout};
  }

  it('a diagonal path toward the flyout keeps it open past the close delay', async () => {
    const {trigger} = await openByHover();
    // The pointer leaves the row at (250, 100), heading for the flyout's near
    // (left) edge; every move inside the triangle restarts the close delay.
    fireEvent.mouseLeave(trigger, {clientX: 250, clientY: 100});
    for (const [x, y] of [
      [260, 90],
      [270, 80],
      [280, 60],
      [290, 40],
    ]) {
      act(() => {
        vi.advanceTimersByTime(150);
      });
      fireEvent.pointerMove(document.body, {clientX: x, clientY: y});
    }
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    vi.useRealTimers();
  });

  it('leaving both the row and the triangle closes after the delay', async () => {
    const {trigger} = await openByHover();
    fireEvent.mouseLeave(trigger, {clientX: 250, clientY: 100});
    // Straight down, away from the flyout: outside the triangle.
    fireEvent.pointerMove(document.body, {clientX: 250, clientY: 400});
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.useRealTimers();
  });

  it('a pointer that pauses inside the triangle keeps the flyout open', async () => {
    const {trigger} = await openByHover();
    // The pointer leaves the row mid-diagonal and then STOPS, aiming at a
    // row: no further pointermove fires. Pausing is not leaving, and this is
    // the exact moment the triangle exists to protect — the close delay used
    // to run out underneath it.
    fireEvent.mouseLeave(trigger, {clientX: 250, clientY: 100});
    fireEvent.pointerMove(document.body, {clientX: 275, clientY: 95});

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    vi.useRealTimers();
  });

  it('a pause inside the triangle still closes once the pointer leaves it', async () => {
    const {trigger} = await openByHover();
    fireEvent.mouseLeave(trigger, {clientX: 250, clientY: 100});
    fireEvent.pointerMove(document.body, {clientX: 275, clientY: 95});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Re-arming is not the same as never closing: the first move out of the
    // triangle lets the delay run.
    fireEvent.pointerMove(document.body, {clientX: 250, clientY: 400});
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.useRealTimers();
  });
});

describe('DropdownMenuSubMenu drill-in on a phone', () => {
  const originalMatchMedia = window.matchMedia;

  // The drill-in resolves on the same query the root presentation uses for
  // its bottom sheet, so one component carries one meaning of "adaptive".
  function stubCompactTouch(matches: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: matches && query === COMPACT_TOUCH_PRESENTATION_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }

  afterEach(() => {
    vi.stubGlobal('matchMedia', originalMatchMedia);
  });

  function PhoneMenu({onMove}: {onMove?: (folder: string) => void} = {}) {
    return (
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu label="Move to">
          <DropdownMenuItem label="Folder A" onClick={() => onMove?.('a')} />
          <DropdownMenuSubMenu label="Archive">
            <DropdownMenuItem label="2025" onClick={() => onMove?.('2025')} />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>
    );
  }

  // The popover is not open for jsdom's accessibility tree, so every query
  // passes `hidden`; the rows a drilled-in view replaced sit under a `hidden`
  // wrapper, which is what "shown" means here.
  const h = {hidden: true} as const;
  const isShown = (el: HTMLElement) => el.closest('[hidden]') == null;
  const visibleRows = () =>
    screen
      .getAllByRole('menuitem', h)
      .filter(isShown)
      .map(el => el.textContent);
  const shownRow = (name: string) =>
    screen.getAllByRole('menuitem', {name, ...h}).find(isShown)!;
  const shownMenu = (name: string) =>
    screen.getAllByRole('menu', {name, ...h}).find(isShown)!;

  it('on a phone a sub-menu drills in, is named by its row, and Back returns', async () => {
    stubCompactTouch(true);
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<PhoneMenu onMove={onMove} />);
    const trigger = screen.getByRole('button', {name: /Actions/});
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    const rootMenu = shownMenu('Actions');

    const moveTo = shownRow('Move to');
    expect(moveTo).toHaveAttribute('aria-haspopup', 'menu');
    expect(moveTo).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(moveTo, {detail: 1});

    // The list is replaced in place: the sibling rows are gone from view, the
    // drilled list is named by its row and leads with a Back row.
    const drilled = await waitFor(() => shownMenu('Move to'));
    expect(rootMenu).toContainElement(drilled);
    expect(visibleRows()).toEqual(['Back to Actions', 'Folder A', 'Archive']);
    // The sibling row is still mounted (its state stays live) but hidden.
    expect(screen.getByRole('menuitem', {name: 'Rename', ...h})).not.toBe(
      undefined,
    );
    expect(isShown(screen.getByRole('menuitem', {name: 'Rename', ...h}))).toBe(
      false,
    );
    // No flyout beside the menu: the drilled list has no popover of its own.
    expect(drilled.closest('[popover]')).toBe(rootMenu.closest('[popover]'));

    // Back returns to the sub-menu row.
    fireEvent.click(shownRow('Back to Actions'), {
      detail: 1,
    });
    await waitFor(() => expect(shownRow('Move to')).toHaveFocus());
    expect(visibleRows()).toEqual(['Rename', 'Move to', 'Delete']);

    // Escape and ArrowLeft pop too, and a second level names its parent.
    fireEvent.keyDown(shownRow('Move to'), {
      key: 'Enter',
    });
    await waitFor(() => shownMenu('Move to'));
    // A keyboard drill-in lands on the first row after Back.
    expect(shownRow('Folder A')).toHaveFocus();
    fireEvent.keyDown(shownRow('Archive'), {
      key: 'Enter',
    });
    await waitFor(() => shownMenu('Archive'));
    expect(visibleRows()).toEqual(['Back to Move to', '2025']);
    expect(shownRow('2025')).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, {key: 'ArrowLeft'});
    await waitFor(() => expect(shownRow('Archive')).toHaveFocus());
    expect(visibleRows()).toEqual(['Back to Actions', 'Folder A', 'Archive']);
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    await waitFor(() => expect(shownRow('Move to')).toHaveFocus());
    // One Escape popped one level; the menu is still open.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // A pick inside a drilled list acts and closes the whole menu.
    fireEvent.click(shownRow('Move to'), {
      detail: 1,
    });
    await waitFor(() => shownMenu('Move to'));
    fireEvent.click(shownRow('Folder A'), {
      detail: 1,
    });
    expect(onMove).toHaveBeenCalledWith('a');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('typeahead and arrows scope to the drilled rows', async () => {
    stubCompactTouch(true);
    const user = userEvent.setup();
    render(<PhoneMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    fireEvent.keyDown(await waitFor(() => shownRow('Move to')), {
      key: 'Enter',
    });
    const drilled = await waitFor(() => shownMenu('Move to'));
    const folderA = shownRow('Folder A');
    expect(folderA).toHaveFocus();
    // "d" matches Delete at the root, which is not shown: nothing moves.
    fireEvent.keyDown(folderA, {key: 'd'});
    expect(folderA).toHaveFocus();
    // Arrows, Home and End walk the drilled list only, Back included; the
    // hidden parent rows are not in the order.
    fireEvent.keyDown(folderA, {key: 'ArrowUp'});
    expect(shownRow('Back to Actions')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    expect(shownRow('Archive')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, {key: 'Home'});
    expect(shownRow('Back to Actions')).toHaveFocus();
    expect(drilled).toBeInTheDocument();
  });

  it('presentation="flyout" keeps the flyout on a phone and "drill-in" drills on a laptop', async () => {
    stubCompactTouch(true);
    const user = userEvent.setup();
    const {unmount} = render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" presentation="flyout">
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    fireEvent.click(await waitFor(() => shownRow('Move to')), {
      detail: 1,
    });
    // The flyout renders in a popover of its own beside the row.
    const flyout = await waitFor(() => shownMenu('Move to'));
    expect(flyout.closest('[popover]')).not.toBe(
      shownMenu('Actions').closest('[popover]'),
    );
    expect(screen.queryByRole('menuitem', {name: /^Back to/, ...h})).toBeNull();
    unmount();

    stubCompactTouch(false);
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" presentation="drill-in">
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    fireEvent.click(await waitFor(() => shownRow('Move to')), {
      detail: 1,
    });
    await waitFor(() => shownRow('Back to Actions'));
  });

  it('closing the menu resets the drilled view', async () => {
    stubCompactTouch(true);
    const user = userEvent.setup();
    render(<PhoneMenu />);
    const trigger = screen.getByRole('button', {name: /Actions/});
    await user.click(trigger);
    fireEvent.click(await waitFor(() => shownRow('Move to')), {
      detail: 1,
    });
    await waitFor(() => shownMenu('Move to'));
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    await waitFor(() => expect(shownRow('Move to')).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false'),
    );
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(visibleRows()).toEqual(['Rename', 'Move to', 'Delete']);
  });

  describe('a menu hung off a custom trigger', () => {
    async function drillIntoMoveTo(triggerName: RegExp | string) {
      const user = userEvent.setup();
      const trigger = screen.getByRole('button', {name: triggerName});
      await user.click(trigger);
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'true'),
      );
      fireEvent.click(await waitFor(() => shownRow('Move to')), {detail: 1});
      await waitFor(() => shownMenu('Move to'));
      return visibleRows()[0];
    }

    it('names its Back row after the icon button it hangs off', async () => {
      stubCompactTouch(false);
      render(
        <DropdownMenu
          renderTrigger={props => (
            <IconButton
              icon="moreHorizontal"
              label="Session actions"
              {...props}
            />
          )}>
          <DropdownMenuSubMenu label="Move to" presentation="drill-in">
            <DropdownMenuItem label="Folder A" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      expect(await drillIntoMoveTo('Session actions')).toBe(
        'Back to Session actions',
      );
    });

    it('names its Back row after a text trigger', async () => {
      stubCompactTouch(false);
      render(
        <DropdownMenu
          renderTrigger={props => (
            <button type="button" {...props}>
              Options
            </button>
          )}>
          <DropdownMenuSubMenu label="Move to" presentation="drill-in">
            <DropdownMenuItem label="Folder A" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      expect(await drillIntoMoveTo('Options')).toBe('Back to Options');
    });

    it('takes the name the caller gave the menu with aria-label', async () => {
      stubCompactTouch(false);
      render(
        <DropdownMenu
          aria-label="Row actions"
          renderTrigger={props => (
            <button type="button" {...props}>
              …
            </button>
          )}>
          <DropdownMenuSubMenu label="Move to" presentation="drill-in">
            <DropdownMenuItem label="Folder A" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenu>,
      );
      expect(shownMenuNamed('Row actions')).toBeDefined();
      expect(await drillIntoMoveTo('…')).toBe('Back to Row actions');
    });

    const shownMenuNamed = (name: string) =>
      screen.getAllByRole('menu', {name, ...h}).find(isShown);
  });
});

describe('DropdownMenuSubMenu light dismiss of the root menu (#6893)', () => {
  // The browser closes the root `popover=\"auto\"` element itself on an outside
  // tap; that path never reaches the submenu, whose flyout is
  // `popover=\"manual\"`. Simulate it by hiding the root popover element
  // directly, exactly what light dismiss does to it.
  function lightDismissRootMenu() {
    const menu = screen.getByRole('menu', {name: /Actions/, hidden: true});
    const rootPopover = menu.closest<HTMLElement>('[popover]');
    expect(rootPopover).not.toBeNull();
    act(() => {
      rootPopover!.hidePopover();
    });
  }

  function getFlyoutPopover(name: RegExp) {
    const flyout = screen.getByRole('menu', {name, hidden: true});
    return flyout.closest<HTMLElement>('[popover]');
  }

  it('closes an open flyout when the root menu is light-dismissed', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    const flyoutPopover = getFlyoutPopover(/Move to/);
    expect(flyoutPopover).toHaveAttribute('popover-open', '');

    lightDismissRootMenu();

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(flyoutPopover).not.toHaveAttribute('popover-open');
  });

  it('leaves the submenu collapsed when the menu reopens after a light dismiss', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    lightDismissRootMenu();
    await user.click(screen.getByRole('button', {name: /Actions/}));

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(getFlyoutPopover(/Move to/)).not.toHaveAttribute('popover-open');
  });

  it('closes an open flyout when the root menu closes via controlled isMenuOpen', async () => {
    const user = userEvent.setup();
    function ControlledMenu() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <DropdownMenu
            button={{label: 'Actions'}}
            isMenuOpen={open}
            onOpenChange={setOpen}>
            <DropdownMenuSubMenu label="Move to">
              <DropdownMenuItem label="Folder A" onClick={() => {}} />
            </DropdownMenuSubMenu>
          </DropdownMenu>
          <button type="button" onClick={() => setOpen(false)}>
            close it
          </button>
        </>
      );
    }
    render(<ControlledMenu />);
    const trigger = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    const flyoutPopover = getFlyoutPopover(/Move to/);

    await user.click(screen.getByRole('button', {name: /close it/}));

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(flyoutPopover).not.toHaveAttribute('popover-open');
  });

  it('closes flyouts nested two levels deep on light dismiss', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to">
          <DropdownMenuSubMenu label="Deeper">
            <DropdownMenuItem label="Leaf" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const first = screen.getByRole('menuitem', {
      name: /Move to/,
      hidden: true,
    });
    await user.click(first);
    await waitFor(() => {
      expect(first).toHaveAttribute('aria-expanded', 'true');
    });
    const deeper = screen.getByRole('menuitem', {
      name: /Deeper/,
      hidden: true,
    });
    await user.click(deeper);
    await waitFor(() => {
      expect(deeper).toHaveAttribute('aria-expanded', 'true');
    });
    const firstPopover = getFlyoutPopover(/Move to/);
    const deeperPopover = getFlyoutPopover(/Deeper/);

    lightDismissRootMenu();

    await waitFor(() => {
      expect(first).toHaveAttribute('aria-expanded', 'false');
    });
    await waitFor(() => {
      expect(deeper).toHaveAttribute('aria-expanded', 'false');
    });
    expect(firstPopover).not.toHaveAttribute('popover-open');
    expect(deeperPopover).not.toHaveAttribute('popover-open');
  });

  // Regression for the stale hover timer: a hover over the submenu trigger
  // schedules an open after the show delay. A press on the same trigger
  // cancels its own scheduled hover-open (that is the click guard), so the
  // way a timer is still pending at close time is a close that comes from
  // elsewhere — here the root menu's light dismiss, the #6893 case. The
  // close must cancel the scheduled hover-open: once the delay elapses the
  // flyout stays closed instead of reopening behind the dismissed menu.
  // Time is driven manually so the dismiss lands inside the show delay;
  // auto-advancing timers would let the hover-open fire before it.
  it('cancels a hover-open scheduled before the menu was closed from elsewhere', async () => {
    vi.useFakeTimers();
    try {
      render(<MoveMenu />);
      fireEvent.click(screen.getByRole('button', {name: /Actions/}));
      const trigger = screen.getByRole('menuitem', {
        name: /Move to/,
        hidden: true,
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // Schedules the hover-open (default show delay 150ms).
      fireEvent.mouseEnter(trigger);

      // Close from elsewhere while the hover-open is still pending.
      lightDismissRootMenu();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // The scheduled delay passes; the flyout must stay closed.
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(getFlyoutPopover(/Move to/)).not.toHaveAttribute('popover-open');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DropdownMenuSubMenu header and footer', () => {
  const h = {hidden: true} as const;
  // The touch sheet is loaded lazily; resolve it once so the sheets below
  // render synchronously.
  beforeAll(warmMenuBottomSheet, 20000);
  // The bottom sheet is a native dialog, which jsdom does not open.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
  });
  // Hidden by an attribute, or stepped aside by a style rule (the root's menu
  // while a view with regions shows). The walk stops at the popover, whose
  // own open state jsdom does not compute.
  const isShown = (el: HTMLElement) => {
    for (
      let node: HTMLElement | null = el;
      node != null && !node.hasAttribute('popover');
      node = node.parentElement
    ) {
      if (node.hidden || window.getComputedStyle(node).display === 'none') {
        return false;
      }
    }
    return true;
  };

  function LabelsMenu({
    onCreate,
    onPick,
    rootHeader,
    menuMaxHeight,
    header = <input aria-label="Filter labels" />,
  }: {
    onCreate?: () => void;
    onPick?: (label: string) => void;
    rootHeader?: React.ReactNode;
    menuMaxHeight?: number;
    header?: React.ReactNode;
  } = {}) {
    return (
      <DropdownMenu
        button={{label: 'Session'}}
        header={rootHeader}
        menuMaxHeight={menuMaxHeight}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu
          label="Labels"
          header={header}
          footer={
            <button type="button" onClick={onCreate}>
              Create label
            </button>
          }>
          <DropdownMenuItem label="Bug" onClick={() => onPick?.('Bug')} />
          <DropdownMenuSubMenu label="More">
            <DropdownMenuItem label="Later" onClick={() => onPick?.('Later')} />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
      </DropdownMenu>
    );
  }

  async function openLabels(props?: Parameters<typeof LabelsMenu>[0]) {
    const user = userEvent.setup();
    render(<LabelsMenu {...props} />);
    const trigger = screen.getByRole('button', {name: /Session/});
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    const rootMenu = screen.getByRole('menu', {name: 'Session', ...h});
    // A pointer open focuses the root menu itself; let that land first.
    await waitFor(() => expect(rootMenu).toHaveFocus());
    const row = screen.getByRole('menuitem', {name: /Labels/, ...h});
    fireEvent.click(row, {detail: 1});
    const dialog = await screen.findByRole('dialog', {name: /Labels/, ...h});
    return {user, trigger, rootMenu, row, dialog};
  }

  const field = () =>
    screen.getByRole('textbox', {name: 'Filter labels', ...h});
  const create = () => screen.getByRole('button', {name: 'Create label', ...h});
  const labelsMenu = () => screen.getByRole('menu', {name: /Labels/, ...h});

  it('holds the header, the rows and the footer in a dialog named by the row, outside every menu', async () => {
    const {rootMenu, row, dialog} = await openLabels();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    expect(row).toHaveAttribute('aria-controls', dialog.id);
    const menu = labelsMenu();
    for (const part of [field(), menu, create()]) {
      expect(dialog).toContainElement(part);
    }
    // The sub-menu's menu holds only its rows, and the dialog sits beside the
    // root's menu, not inside it.
    expect(menu).not.toContainElement(field());
    expect(menu).not.toContainElement(create());
    expect(rootMenu).not.toContainElement(dialog);
    expect(rootMenu.closest('[popover]')).toContainElement(dialog);
    expect(
      field().compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      menu.compareDocumentPosition(create()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('makes the rows one Tab stop, and Tab and Shift+Tab walk the regions and wrap', async () => {
    const {row} = await openLabels();
    const menu = labelsMenu();
    expect(menu).toHaveAttribute('tabindex', '0');
    // A pointer open lands on the first row.
    const bug = screen.getByRole('menuitem', {name: 'Bug', ...h});
    await waitFor(() => expect(bug).toHaveFocus());

    fireEvent.keyDown(bug, {key: 'Tab'});
    expect(create()).toHaveFocus();
    fireEvent.keyDown(create(), {key: 'Tab'});
    expect(field()).toHaveFocus();
    fireEvent.keyDown(field(), {key: 'Tab'});
    expect(menu).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'Tab', shiftKey: true});
    expect(field()).toHaveFocus();
    fireEvent.keyDown(field(), {key: 'Tab', shiftKey: true});
    expect(create()).toHaveFocus();
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps arrows and letters in the field; Escape there returns to the row and leaves the menu open', async () => {
    const {trigger, row} = await openLabels();
    act(() => field().focus());
    fireEvent.keyDown(field(), {key: 'ArrowLeft'});
    fireEvent.keyDown(field(), {key: 'b'});
    expect(field()).toHaveFocus();
    expect(row).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(field(), {key: 'Escape'});
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'));
    expect(row).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('an Escape a control in the region already handled closes only that control: a menu in the header, a field that clears itself', async () => {
    // A field that clears itself on Escape claims the key.
    function ClearingField() {
      const [query, setQuery] = useState('bu');
      return (
        <input
          aria-label="Filter labels"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && query !== '') {
              e.preventDefault();
              setQuery('');
            }
          }}
        />
      );
    }
    const {user, trigger, row} = await openLabels({
      header: (
        <>
          <ClearingField />
          <DropdownMenu button={{label: 'Sort'}}>
            <DropdownMenuItem label="By name" onClick={() => {}} />
          </DropdownMenu>
        </>
      ),
    });

    // The header's own menu takes the first Escape and closes; the sub-menu
    // and the root menu stay open.
    const sort = screen.getByRole('button', {name: /Sort/, ...h});
    await user.click(sort);
    await waitFor(() => expect(sort).toHaveAttribute('aria-expanded', 'true'));
    const sortMenu = screen.getByRole('menu', {name: /Sort/, ...h});
    await waitFor(() => expect(sortMenu).toHaveFocus());
    fireEvent.keyDown(sortMenu, {key: 'Escape'});
    await waitFor(() => expect(sort).toHaveAttribute('aria-expanded', 'false'));
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // A field that clears itself on Escape keeps that Escape too.
    act(() => field().focus());
    fireEvent.keyDown(field(), {key: 'Escape'});
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
    expect(row).toHaveAttribute('aria-expanded', 'true');

    // The next Escape, which nothing in the region claims, returns to the row.
    fireEvent.keyDown(field(), {key: 'Escape'});
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('an Escape that ends an IME composition in the field closes nothing', async () => {
    const {trigger, row} = await openLabels();
    act(() => field().focus());
    fireEvent.keyDown(field(), {key: 'Escape', isComposing: true});
    fireEvent.keyDown(field(), {key: 'Escape', keyCode: 229});
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveFocus();
    // The next Escape, outside the composition, returns to the row.
    fireEvent.keyDown(field(), {key: 'Escape'});
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('a keyboard open lands on the first row, not the field', async () => {
    const user = userEvent.setup();
    render(<LabelsMenu />);
    const trigger = screen.getByRole('button', {name: /Session/});
    await user.click(trigger);
    const row = screen.getByRole('menuitem', {name: /Labels/, ...h});
    act(() => row.focus());
    fireEvent.keyDown(row, {key: 'ArrowRight'});
    await waitFor(() =>
      expect(screen.getByRole('menuitem', {name: 'Bug', ...h})).toHaveFocus(),
    );
  });

  it('a press in a region acts on nothing in the menus and keeps both open', async () => {
    const onCreate = vi.fn();
    const onPick = vi.fn();
    const {trigger, row} = await openLabels({onCreate, onPick});
    fireEvent.pointerDown(field(), {pointerType: 'mouse', button: 0});
    fireEvent.pointerUp(field(), {pointerType: 'mouse', button: 0});
    fireEvent.click(field());
    fireEvent.click(create());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('Tab from a deeper flyout closes it and walks on from the rows', async () => {
    await openLabels();
    const more = screen.getByRole('menuitem', {name: /More/, ...h});
    act(() => more.focus());
    fireEvent.keyDown(more, {key: 'ArrowRight'});
    const later = await waitFor(() => {
      const el = screen.getByRole('menuitem', {name: 'Later', ...h});
      expect(el).toHaveFocus();
      return el;
    });
    fireEvent.keyDown(later, {key: 'Tab'});
    await waitFor(() => expect(more).toHaveAttribute('aria-expanded', 'false'));
    expect(create()).toHaveFocus();
  });

  // Opens the Labels flyout by hover (timers faked), puts focus on `focusIn`,
  // and moves the pointer off until the hide delay has run out: the flyout
  // stays open while focus is inside.
  function hoverOpenAndLeave(
    focusIn: () => HTMLElement,
    header?: React.ReactNode,
  ) {
    render(<LabelsMenu header={header} />);
    fireEvent.click(screen.getByRole('button', {name: /Session/}));
    const row = screen.getByRole('menuitem', {name: /Labels/, ...h});
    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => focusIn().focus());
    fireEvent.mouseLeave(screen.getByRole('dialog', {name: /Labels/, ...h}));
    fireEvent.mouseLeave(row);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(row).toHaveAttribute('aria-expanded', 'true');
    return row;
  }

  it('a flyout the pointer left stays open while focus moves inside it, and closes once focus leaves it', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const row = hoverOpenAndLeave(field);
      await act(async () => create().focus());
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(row).toHaveAttribute('aria-expanded', 'true');
      // Focus leaving closes it, with no further pointer movement, once the
      // move has completed.
      await act(async () =>
        screen.getByRole('menuitem', {name: 'Rename', ...h}).focus(),
      );
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(row).toHaveAttribute('aria-expanded', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a flyout the pointer left stays open while the browser moves focus between its header controls, as an arrow in a radio group does', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const radio = (name: string) => screen.getByRole('radio', {name, ...h});
      const row = hoverOpenAndLeave(
        () => radio('Any label'),
        <RadioList label="Match" value="any" onChange={() => {}}>
          <RadioListItem label="Any label" value="any" />
          <RadioListItem label="All labels" value="all" />
        </RadioList>,
      );
      // The browser's own move, in its order: the blur, a microtask
      // checkpoint, then the focus on the next radio.
      fireEvent.focusOut(radio('Any label'));
      await act(async () => {
        await Promise.resolve();
      });
      act(() => radio('All labels').focus());
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(row).toHaveAttribute('aria-expanded', 'true');
      expect(radio('All labels')).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a flyout with regions stays in the popover when the root header comes or goes, which moves the host', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<LabelsMenu />);
    const trigger = screen.getByRole('button', {name: /Session/});
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true'),
    );
    const rootMenu = screen.getByRole('menu', {name: 'Session', ...h});
    fireEvent.click(screen.getByRole('menuitem', {name: /Labels/, ...h}), {
      detail: 1,
    });
    await screen.findByRole('dialog', {name: /Labels/, ...h});
    const popover = rootMenu.closest<HTMLElement>('[popover]');
    // The host moves into the regions frame and back out; the flyout follows
    // the host that is mounted, never a detached one.
    for (const rootHeader of [
      <input key="search" aria-label="Search actions" />,
      undefined,
    ]) {
      rerender(<LabelsMenu rootHeader={rootHeader} />);
      const dialog = await screen.findByRole('dialog', {name: /Labels/, ...h});
      expect(popover).toContainElement(dialog);
    }
  });

  it('a nested flyout with regions closes with the flyout that holds its row', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu button={{label: 'Session'}}>
        <DropdownMenuSubMenu
          label="Labels"
          header={<input aria-label="Filter labels" />}>
          <DropdownMenuItem label="Bug" onClick={() => {}} />
          <DropdownMenuSubMenu
            label="More"
            header={<input aria-label="Filter more" />}>
            <DropdownMenuItem label="Later" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Session/}));
    const labelsRow = screen.getByRole('menuitem', {name: /Labels/, ...h});
    fireEvent.click(labelsRow, {detail: 1});
    await screen.findByRole('dialog', {name: /Labels/, ...h});
    const moreRow = screen.getByRole('menuitem', {name: /More/, ...h});
    fireEvent.click(moreRow, {detail: 1});
    const moreDialog = await screen.findByRole('dialog', {name: /More/, ...h});
    const morePopover = moreDialog.closest<HTMLElement>('[popover]');
    expect(morePopover).toHaveAttribute('popover-open', '');
    // Escape in the outer flyout's field closes that flyout, and the nested
    // one, which renders beside the root's menu, with it.
    act(() => field().focus());
    fireEvent.keyDown(field(), {key: 'Escape'});
    await waitFor(() =>
      expect(labelsRow).toHaveAttribute('aria-expanded', 'false'),
    );
    await waitFor(() =>
      expect(morePopover).not.toHaveAttribute('popover-open'),
    );
  });

  it('a menu placed in a region keeps its own press: a mouse release outside it closes it and acts on nothing', async () => {
    const user = userEvent.setup();
    const onBug = vi.fn();
    const onNewest = vi.fn();
    render(
      <DropdownMenu button={{label: 'Session'}}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu
          label="Labels"
          header={
            <DropdownMenu button={{label: 'Sort'}}>
              <DropdownMenuItem label="Newest" onClick={onNewest} />
            </DropdownMenu>
          }>
          <DropdownMenuItem label="Bug" onClick={onBug} />
        </DropdownMenuSubMenu>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', {name: /Session/}));
    fireEvent.click(screen.getByRole('menuitem', {name: /Labels/, ...h}), {
      detail: 1,
    });
    await screen.findByRole('dialog', {name: /Labels/, ...h});
    const sort = screen.getByRole('button', {name: /Sort/, ...h});
    await user.click(sort);
    await waitFor(() => expect(sort).toHaveAttribute('aria-expanded', 'true'));
    const newest = screen.getByRole('menuitem', {name: 'Newest', ...h});
    const bug = screen.getByRole('menuitem', {name: 'Bug', ...h});
    fireEvent.pointerDown(newest, {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(bug, {pointerType: 'mouse', pointerId: 1});
    fireEvent.pointerUp(bug, {pointerType: 'mouse', pointerId: 1, button: 0});
    expect(onBug).not.toHaveBeenCalled();
    expect(onNewest).not.toHaveBeenCalled();
    await waitFor(() => expect(sort).toHaveAttribute('aria-expanded', 'false'));
  });

  it('a press from a menu row released on a row of the flyout acts on it, as in any flyout', async () => {
    const onPick = vi.fn();
    const {trigger} = await openLabels({onPick});
    const rename = screen.getByRole('menuitem', {name: 'Rename', ...h});
    const bug = screen.getByRole('menuitem', {name: 'Bug', ...h});
    fireEvent.pointerDown(rename, {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(bug, {pointerType: 'mouse', pointerId: 1});
    fireEvent.pointerUp(bug, {pointerType: 'mouse', pointerId: 1, button: 0});
    expect(onPick).toHaveBeenCalledWith('Bug');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it("a mouse press from a menu row released on the flyout's field acts on nothing and closes, as outside the menu", async () => {
    const onPick = vi.fn();
    const {trigger} = await openLabels({onPick});
    const rename = screen.getByRole('menuitem', {name: 'Rename', ...h});
    fireEvent.pointerDown(rename, {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(field(), {pointerType: 'mouse', pointerId: 1});
    fireEvent.pointerUp(field(), {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('without a header or footer the sub-menu is a plain flyout menu', async () => {
    const user = userEvent.setup();
    render(<MoveMenu />);
    await user.click(screen.getByRole('button', {name: /Actions/}));
    const row = screen.getByRole('menuitem', {name: /Move to/, ...h});
    fireEvent.click(row, {detail: 1});
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
    expect(row).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('dialog', h)).toBeNull();
  });

  describe('on a phone', () => {
    const originalMatchMedia = window.matchMedia;
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query === COMPACT_TOUCH_PRESENTATION_QUERY,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );
    });
    afterEach(() => {
      vi.stubGlobal('matchMedia', originalMatchMedia);
    });

    it('the drilled-in view holds the regions beside its menu while the root steps aside, and Escape in its field returns', async () => {
      const {rootMenu, row, dialog} = await openLabels({
        rootHeader: <input aria-label="Search actions" />,
      });
      const rootField = screen.getByRole('textbox', {
        name: 'Search actions',
        ...h,
      });
      expect(isShown(dialog)).toBe(true);
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      // The view sits beside the root's menu, which steps aside with its own
      // header; the view leads with a Back row.
      expect(rootMenu).not.toContainElement(dialog);
      expect(isShown(rootMenu)).toBe(false);
      expect(isShown(rootField)).toBe(false);
      expect(dialog.closest('[popover]')).toBe(rootMenu.closest('[popover]'));
      const viewRows = Array.from(
        labelsMenu().querySelectorAll('[role="menuitem"]'),
      )
        .filter(el => isShown(el as HTMLElement))
        .map(el => el.textContent);
      expect(viewRows[0]).toBe('Back to Session');
      for (const part of [field(), labelsMenu(), create()]) {
        expect(dialog).toContainElement(part);
      }

      // Escape in the field returns to the row; the root comes back.
      act(() => field().focus());
      fireEvent.keyDown(field(), {key: 'Escape'});
      await waitFor(() => expect(row).toHaveFocus());
      expect(isShown(rootMenu)).toBe(true);
      expect(isShown(rootField)).toBe(true);
    });

    it('a shown view follows its header or footer as it comes and goes: beside the root menu with one, inside it without', async () => {
      function TogglingLabels() {
        const [hasHeader, setHasHeader] = useState(true);
        return (
          <>
            <button type="button" onClick={() => setHasHeader(v => !v)}>
              Toggle filter
            </button>
            <DropdownMenu button={{label: 'Session'}}>
              <DropdownMenuItem label="Rename" onClick={() => {}} />
              <DropdownMenuSubMenu
                label="Labels"
                header={
                  hasHeader ? <input aria-label="Filter labels" /> : undefined
                }>
                <DropdownMenuItem label="Bug" onClick={() => {}} />
              </DropdownMenuSubMenu>
            </DropdownMenu>
          </>
        );
      }
      const user = userEvent.setup();
      render(<TogglingLabels />);
      await user.click(screen.getByRole('button', {name: /Session/}));
      const rootMenu = screen.getByRole('menu', {name: 'Session', ...h});
      fireEvent.click(screen.getByRole('menuitem', {name: /Labels/, ...h}), {
        detail: 1,
      });
      await screen.findByRole('dialog', {name: /Labels/, ...h});
      expect(isShown(rootMenu)).toBe(false);
      const toggle = screen.getByRole('button', {name: 'Toggle filter'});
      const bugIsShown = () =>
        isShown(screen.getByRole('menuitem', {name: 'Bug', ...h}));

      // The header goes: the view drills in inside the root's menu, which
      // shows again with the view's rows.
      fireEvent.click(toggle);
      await waitFor(() =>
        expect(screen.queryByRole('dialog', {name: /Labels/, ...h})).toBeNull(),
      );
      expect(isShown(rootMenu)).toBe(true);
      expect(bugIsShown()).toBe(true);

      // It comes back: the view moves beside the root's menu, which steps
      // aside again.
      fireEvent.click(toggle);
      const dialog = await screen.findByRole('dialog', {
        name: /Labels/,
        ...h,
      });
      expect(isShown(dialog)).toBe(true);
      expect(isShown(rootMenu)).toBe(false);
      expect(bugIsShown()).toBe(true);
    });

    it("a drilled-in view with a header or footer caps at the root's menuMaxHeight, as the plain view does", async () => {
      const {dialog} = await openLabels({menuMaxHeight: 560});
      expect(dialog.getAttribute('style')).toContain('min(560px');
    });

    it('Tab in the drilled-in view wraps through its own regions', async () => {
      await openLabels();
      act(() => field().focus());
      fireEvent.keyDown(field(), {key: 'Tab'});
      expect(labelsMenu()).toHaveFocus();
      fireEvent.keyDown(labelsMenu(), {key: 'Tab'});
      expect(create()).toHaveFocus();
      fireEvent.keyDown(create(), {key: 'Tab'});
      expect(field()).toHaveFocus();
    });
  });
});
