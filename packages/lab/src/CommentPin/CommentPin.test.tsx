// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {CommentPin} from './CommentPin';

const ADA = {id: 'ada', name: 'Ada Lovelace'};
const LIN = {id: 'lin', name: 'Lin Chen'};
const MIRA = {id: 'mira', name: 'Mira Patel'};
const NOAH = {id: 'noah', name: 'Noah Williams'};
const SAM = {id: 'sam', name: 'Sam Rivera'};

describe('CommentPin', () => {
  it('renders one labelled button and one representative for a single thread', () => {
    const {container} = render(
      <CommentPin label="Open annotation from Ada" participants={[ADA]} />,
    );

    expect(
      screen.getByRole('button', {name: 'Open annotation from Ada'}),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(1);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows up to three distinct participants and the exact total for a group', () => {
    const {container} = render(
      <CommentPin
        label="Open 12 grouped annotations"
        participants={[ADA, ADA, LIN, MIRA]}
        threadCount={12}
      />,
    );

    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(3);
    expect(
      container.querySelector('.astryx-avatar-group-overflow'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Open 12 grouped annotations'}),
    ).toHaveAttribute('data-grouped', 'grouped');
  });

  it('caps a group at three circles with an ellipsis overflow beyond three people', () => {
    const {container} = render(
      <CommentPin
        label="Open 6 grouped annotations from Ada, Lin, and 3 others"
        participants={[ADA, LIN, MIRA, NOAH, SAM]}
        threadCount={6}
      />,
    );

    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(2);
    const overflow = container.querySelector('.astryx-avatar-group-overflow');
    // An ellipsis, not `+3`: the thread total stays the pin's only number.
    expect(overflow?.querySelector('svg')).not.toBeNull();
    expect(overflow).toHaveTextContent(/^$/);
    expect(overflow?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it.each([
    [undefined, 'sm', '22px'],
    ['sm', 'sm', '22px'],
    ['md', 'md', '24px'],
    ['lg', 'lg', '28px'],
  ] as const)(
    'size %s reflects %s and draws %s participant circles',
    (size, reflected, avatarPx) => {
      const {container} = render(
        <CommentPin
          label="Open 6 grouped annotations"
          participants={[ADA, LIN, MIRA, NOAH, SAM]}
          threadCount={6}
          size={size}
        />,
      );

      const pin = screen.getByRole('button', {
        name: 'Open 6 grouped annotations',
      });
      expect(pin).toHaveAttribute('data-size', reflected);
      const avatars = container.querySelectorAll('.astryx-avatar');
      expect(avatars).toHaveLength(2);
      for (const avatar of avatars) {
        expect(avatar.getAttribute('style') ?? '').toContain(avatarPx);
      }
    },
  );

  it('sizes a single participant with the pin', () => {
    const {container} = render(
      <CommentPin label="Open annotation" participants={[ADA]} size="lg" />,
    );

    expect(
      container.querySelector('.astryx-avatar')?.getAttribute('style') ?? '',
    ).toContain('28px');
  });

  it('marks unread threads with an accent dot after the total', () => {
    const {container} = render(
      <CommentPin
        label="Open 4 grouped annotations, 2 unread"
        participants={[ADA, LIN]}
        threadCount={4}
        unreadCount={2}
      />,
    );

    const pin = screen.getByRole('button', {
      name: 'Open 4 grouped annotations, 2 unread',
    });
    expect(pin).toHaveAttribute('data-unread', 'unread');
    const dot = container.querySelector('.astryx-status-dot');
    expect(dot).toHaveAttribute('data-variant', 'accent');
    expect(dot?.closest('[aria-hidden="true"]')).not.toBeNull();
    // The total stays; the unread count is the dot, not a second number.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(dot?.compareDocumentPosition(screen.getByText('4')) ?? 0).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(2);
  });

  it('marks an unread single-thread pin with a dot and no number', () => {
    const {container} = render(
      <CommentPin
        label="Open unread annotation from Ada"
        participants={[ADA]}
        unreadCount={1}
      />,
    );

    const pin = screen.getByRole('button', {
      name: 'Open unread annotation from Ada',
    });
    expect(pin).toHaveAttribute('data-unread', 'unread');
    expect(pin).not.toHaveAttribute('data-grouped');
    expect(container.querySelector('.astryx-status-dot')).not.toBeNull();
    expect(pin).toHaveTextContent(/^AL$/);
  });

  it.each([
    [-1, false],
    [1.5, false],
    [Number.NaN, false],
    [9, true],
  ])(
    'normalizes unreadCount %s and warns in development',
    async (unreadCount, isUnread) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container, unmount} = render(
        <CommentPin
          label="Open annotations"
          participants={[ADA, LIN]}
          threadCount={3}
          unreadCount={unreadCount}
        />,
      );

      const pin = container.querySelector('.astryx-comment-pin');
      if (isUnread) {
        expect(pin).toHaveAttribute('data-unread', 'unread');
        expect(container.querySelector('.astryx-status-dot')).not.toBeNull();
      } else {
        expect(pin).not.toHaveAttribute('data-unread');
        expect(container.querySelector('.astryx-status-dot')).toBeNull();
      }
      expect(screen.getByText('3')).toBeInTheDocument();
      await waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining('unreadCount` must be a finite non-negative'),
        ),
      );
      unmount();
      warning.mockRestore();
    },
  );

  it('does not expose visible Avatar or count semantics separately from the button', () => {
    const {container} = render(
      <CommentPin
        label="Open 4 annotations from Ada and Lin"
        participants={[ADA, LIN]}
        threadCount={4}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(
      container
        .querySelector('.astryx-avatar')
        ?.closest('[aria-hidden="true"]'),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByText('4').closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('keeps a single marker to one representative even when more are supplied', () => {
    const {container} = render(
      <CommentPin label="Open annotation" participants={[ADA, LIN, MIRA]} />,
    );

    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(1);
    expect(container.querySelector('.astryx-comment-pin')).not.toHaveAttribute(
      'data-grouped',
    );
  });

  it('reflects selected, resolved, and disabled state on the owning target', () => {
    render(
      <CommentPin
        label="Resolved selected annotation"
        participants={[ADA]}
        isSelected
        isResolved
        isDisabled
      />,
    );

    const marker = screen.getByRole('button', {
      name: 'Resolved selected annotation',
    });
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    expect(marker).not.toBeDisabled();
    expect(marker).toHaveAttribute('aria-disabled', 'true');
    expect(marker).toHaveAttribute('data-selected', 'selected');
    expect(marker).toHaveAttribute('data-resolved', 'resolved');
    expect(marker).toHaveAttribute('data-disabled', 'disabled');
  });

  it('renders nothing for a resolved pin unless it is selected', () => {
    const {container, rerender} = render(
      <CommentPin
        label="Open resolved annotation from Ada"
        participants={[ADA]}
        isResolved
      />,
    );

    expect(container.querySelector('.astryx-comment-pin')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <CommentPin
        label="Open resolved annotation from Ada"
        participants={[ADA]}
        isResolved
        isSelected
      />,
    );
    const pin = screen.getByRole('button', {
      name: 'Open resolved annotation from Ada',
    });
    expect(pin).toHaveAttribute('data-resolved', 'resolved');
    expect(pin).toHaveAttribute('data-selected', 'selected');
  });

  it('dims non-selected pins without disabling selection changes', () => {
    const onClick = vi.fn();
    render(
      <CommentPin
        label="Open another annotation"
        participants={[LIN]}
        isDimmed
        onClick={onClick}
      />,
    );

    const pin = screen.getByRole('button', {name: 'Open another annotation'});
    expect(pin).toHaveAttribute('data-dimmed', 'dimmed');
    expect(pin).not.toBeDisabled();
    fireEvent.click(pin);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls the forwarded click handler when enabled', () => {
    const onClick = vi.fn();
    render(
      <CommentPin
        label="Open annotation"
        participants={[ADA]}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open annotation'}));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates through the native button keyboard contract', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CommentPin
        label="Open annotation"
        participants={[ADA]}
        onClick={onClick}
      />,
    );

    const pin = screen.getByRole('button', {name: 'Open annotation'});
    pin.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes aria-disabled instead of the native attribute when disabled', () => {
    render(
      <CommentPin label="Pending annotation" participants={[ADA]} isDisabled />,
    );

    const pin = screen.getByRole('button', {name: 'Pending annotation'});
    expect(pin).not.toBeDisabled();
    expect(pin).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps a disabled pin in the tab order (spec:AST-085 FR1)', async () => {
    const user = userEvent.setup();
    render(<CommentPin label="Open annotation" participants={[ADA]} />);
    render(
      <CommentPin label="Pending annotation" participants={[LIN]} isDisabled />,
    );
    render(<CommentPin label="Another annotation" participants={[MIRA]} />);

    await user.tab();
    // The first tab stop is the enabled pin; the disabled one keeps its place
    // right after it rather than being skipped.
    await user.tab();
    expect(
      screen.getByRole('button', {name: 'Pending annotation'}),
    ).toHaveFocus();
  });

  it('does not call the click handler when disabled', () => {
    const onClick = vi.fn();
    render(
      <CommentPin
        label="Pending annotation"
        participants={[ADA]}
        isDisabled
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Pending annotation'}));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocks Enter and Space on a disabled pin (spec:AST-085 FR2)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CommentPin
        label="Pending annotation"
        participants={[ADA]}
        isDisabled
        onClick={onClick}
      />,
    );

    // user-event only synthesizes the button's Enter/Space click when the
    // keydown was not defaultPrevented, and a native listener on the pin sees
    // any click that does reach the DOM. No click at all is what proves the
    // keydown guard blocked activation itself, not just the click guard.
    const nativeClicks = vi.fn();
    const pin = screen.getByRole('button', {name: 'Pending annotation'});
    pin.addEventListener('click', nativeClicks);

    pin.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    pin.removeEventListener('click', nativeClicks);

    expect(onClick).not.toHaveBeenCalled();
    expect(nativeClicks).not.toHaveBeenCalled();
  });

  it('does not let a disabled pin activate a clickable ancestor (spec:AST-085 FR2)', () => {
    const surfaceClick = vi.fn();
    const onClick = vi.fn();
    render(
      <div role="button" onClick={surfaceClick} aria-label="Annotation surface">
        <CommentPin
          label="Pending annotation"
          participants={[ADA]}
          isDisabled
          onClick={onClick}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Pending annotation'}));
    expect(onClick).not.toHaveBeenCalled();
    expect(surfaceClick).not.toHaveBeenCalled();
  });

  it('keeps focus when the pin becomes disabled while focused (spec:AST-085 FR4)', () => {
    // jsdom keeps focus on a natively disabled button too, so on its own this
    // cannot tell the two apart; the FR1 tests above pin the mechanism (no
    // native `disabled`), which is what keeps focus here. A real-browser
    // probe would be needed to prove FR4 independently.
    const {rerender} = render(
      <CommentPin label="Open annotation" participants={[ADA]} />,
    );

    const pin = screen.getByRole('button', {name: 'Open annotation'});
    pin.focus();
    expect(pin).toHaveFocus();

    rerender(
      <CommentPin label="Open annotation" participants={[ADA]} isDisabled />,
    );
    expect(pin).toHaveFocus();
    expect(pin).toHaveAttribute('aria-disabled', 'true');
  });

  it('paints an unselected disabled pin GrayText in forced colors (AST-085 FR6)', () => {
    // The same declarations as the component's styles compile to the same
    // atomic classes. Null defaults emit no atom of their own, so these are
    // exactly the forced-colors arms — the shared default-mode atoms
    // (borderColor: transparent) cannot make this check pass vacuously.
    const atoms = (style: stylex.StyleXStyles) =>
      stylex
        .props(style)
        .className!.split(' ')
        .filter(name => name.includes('x') && !name.includes('__'));
    const forced = stylex.create({
      disabled: {
        borderColor: {
          default: null,
          '@media (forced-colors: active)': 'GrayText',
        },
        color: {default: null, '@media (forced-colors: active)': 'GrayText'},
      },
    });
    const forcedAtoms = atoms(forced.disabled);
    expect(forcedAtoms.length).toBeGreaterThan(0);

    const {rerender} = render(
      <CommentPin label="Pending annotation" participants={[ADA]} isDisabled />,
    );

    const pin = screen.getByRole('button', {name: 'Pending annotation'});
    for (const name of forcedAtoms) {
      expect(pin).toHaveClass(name);
    }

    // A selected pin keeps its forced-colors Highlight treatment instead; the
    // disabled affordance rides on the selected presentation staying intact.
    rerender(
      <CommentPin
        label="Pending annotation"
        participants={[ADA]}
        isDisabled
        isSelected
      />,
    );
    for (const name of forcedAtoms) {
      expect(pin).not.toHaveClass(name);
    }
  });

  it('keeps the root text colour on an unselected disabled pin outside forced colors', () => {
    // disabledUnselected must repeat the root's colour token as its default:
    // a null default would replace it under StyleX's per-property merge and
    // the count would fall back to the raw theme text colour.
    const atoms = (style: stylex.StyleXStyles) =>
      stylex
        .props(style)
        .className!.split(' ')
        .filter(name => name.includes('x') && !name.includes('__'));
    const rootColor = stylex.create({
      color: {color: colorVars['--color-text-secondary']},
    });
    const colorAtoms = atoms(rootColor.color);
    expect(colorAtoms.length).toBeGreaterThan(0);

    render(
      <CommentPin
        label="Open 3 grouped annotations"
        participants={[ADA]}
        threadCount={3}
        isDisabled
      />,
    );

    const pin = screen.getByRole('button', {
      name: 'Open 3 grouped annotations',
    });
    for (const name of colorAtoms) {
      expect(pin).toHaveClass(name);
    }
  });

  it('forwards the ref and neutral button props', () => {
    const ref = {current: null as HTMLButtonElement | null};
    render(
      <CommentPin
        ref={ref}
        label="Open annotation"
        participants={[ADA]}
        data-cluster-id="cluster-1"
        aria-controls="thread-panel"
      />,
    );

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toHaveAttribute('type', 'button');
    expect(ref.current).toHaveAttribute('data-cluster-id', 'cluster-1');
    expect(ref.current).toHaveAttribute('aria-controls', 'thread-panel');
  });

  it('combines the stable target with a caller class and style', () => {
    render(
      <CommentPin
        label="Open annotation"
        participants={[ADA]}
        className="host-position"
        style={{insetInlineStart: 24}}
      />,
    );

    const marker = screen.getByRole('button', {name: 'Open annotation'});
    expect(marker.className).toContain('astryx-comment-pin');
    expect(marker.className).toContain('host-position');
    expect(marker).toHaveStyle({insetInlineStart: '24px'});
  });

  it('falls back to a single anonymous Avatar and warns for no representatives', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <CommentPin
        label="Open annotation"
        participants={[] as unknown as [typeof ADA]}
      />,
    );

    expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(1);
    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('participants` should contain at least one'),
      ),
    );
    warning.mockRestore();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to a single-thread marker for invalid threadCount %s',
    async threadCount => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container, unmount} = render(
        <CommentPin
          label="Open annotation"
          participants={[ADA, LIN]}
          threadCount={threadCount}
        />,
      );

      expect(container.querySelectorAll('.astryx-avatar')).toHaveLength(1);
      expect(
        container.querySelector('.astryx-comment-pin'),
      ).not.toHaveAttribute('data-grouped');
      await waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining(
            'threadCount` must be a finite positive integer',
          ),
        ),
      );
      unmount();
      warning.mockRestore();
    },
  );

  it('shows its action label as a visual tooltip on hover', async () => {
    const showPopover = vi.spyOn(HTMLElement.prototype, 'showPopover');
    render(
      <CommentPin label="Open annotation from Ada" participants={[ADA]} />,
    );

    const marker = screen.getByRole('button', {
      name: 'Open annotation from Ada',
    });
    fireEvent.pointerEnter(marker, {pointerType: 'mouse'});
    fireEvent.mouseEnter(marker);

    await waitFor(() => expect(showPopover).toHaveBeenCalled());
    expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
      'Open annotation from Ada',
    );
    showPopover.mockRestore();
  });
});
