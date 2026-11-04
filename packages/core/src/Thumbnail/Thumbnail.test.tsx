// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Thumbnail} from './Thumbnail';
import {
  afterPaintsPress,
  hasReleaseFade,
  pressArmsShadowedByDefault,
  readsPressStrength,
} from '../__tests__/pressState';

describe('Thumbnail', () => {
  it('renders an image when src is provided', () => {
    render(<Thumbnail src="/photo.jpg" alt="Test photo" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/photo.jpg');
    expect(img).toHaveAttribute('alt', 'Test photo');
  });

  it('renders placeholder when no src is provided', () => {
    render(<Thumbnail data-testid="thumb" />);
    const root = screen.getByTestId('thumb');
    expect(root.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows skeleton when isLoading with no src', () => {
    const {container} = render(<Thumbnail isLoading data-testid="thumb" />);
    expect(container.querySelector('.astryx-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows image with upload overlay when isLoading with src', () => {
    render(
      <Thumbnail
        src="/local.jpg"
        alt="Uploading"
        isLoading
        data-testid="thumb"
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/local.jpg');
    // The upload Spinner is decorative; the thumbnail announces its busy
    // start instead (spec:AST-086 FR8).
    expect(document.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('exposes the label as an accessible name via a valid group role', () => {
    render(<Thumbnail label="photo.png" data-testid="thumb" />);
    // The accessible name must be carried by a valid named role (group),
    // not by a bare aria-label on a generic div (aria-prohibited-attr).
    const group = screen.getByRole('group', {name: 'photo.png'});
    expect(group).toBe(screen.getByTestId('thumb'));
  });

  it('does not put aria-label on a generic (roleless) element', () => {
    render(<Thumbnail label="photo.png" data-testid="thumb" />);
    const thumb = screen.getByTestId('thumb');
    // The labeled element must declare a role so the name is legitimate.
    expect(thumb).toHaveAttribute('role', 'group');
  });

  it('keeps interactive children accessible while exposing the group name', () => {
    const onRemove = vi.fn();
    render(
      <Thumbnail
        src="/img.jpg"
        alt="Clickable"
        label="file.png"
        onClick={vi.fn()}
        onRemove={onRemove}
      />,
    );
    // A group role (unlike img) must not hide descendant controls.
    expect(
      screen.getByRole('group', {name: 'file.png — Clickable'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Open file.png — Clickable'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Remove file.png — Clickable'}),
    ).toBeInTheDocument();
  });

  it('marks the image as explicitly decorative when no alt is provided', () => {
    render(
      <Thumbnail src="/photo.jpg" label="photo.png" data-testid="thumb" />,
    );
    const img = screen.getByTestId('thumb').querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('role', 'presentation');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    // The image must not be exposed to assistive technology as a nameless img.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exposes the image with normal img semantics when alt is provided', () => {
    render(<Thumbnail src="/photo.jpg" alt="Vacation photo" />);
    const img = screen.getByRole('img', {name: 'Vacation photo'});
    expect(img).not.toHaveAttribute('role');
    expect(img).not.toHaveAttribute('aria-hidden');
  });

  it('warns once when src is set with no alt and no label', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Thumbnail src="/photo.jpg" />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Thumbnail');
    warnSpy.mockRestore();
  });

  it('does not warn when the thumbnail is named via label or alt', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Thumbnail src="/a.jpg" label="a.png" />);
    render(<Thumbnail src="/b.jpg" alt="Photo b" />);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('label is shown via tooltip, not as inline text', () => {
    render(<Thumbnail label="photo.png" data-testid="thumb" />);
    // Label should exist in DOM (tooltip) but not as a direct child text node
    const thumb = screen.getByTestId('thumb');
    expect(thumb.textContent).not.toContain('photo.png');
  });

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Thumbnail label="file.png" onRemove={onRemove} />);
    const removeBtn = screen.getByRole('button', {name: 'Remove file.png'});
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('calls onClick when thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Thumbnail src="/img.jpg" alt="Clickable" onClick={onClick} />);
    const btn = screen.getByRole('button', {name: 'Open Clickable'});
    await user.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a disabled Remove mounted, focusable and announced as disabled, without calling onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Thumbnail label="file.png" onRemove={onRemove} isDisabled />);
    const remove = screen.getByRole('button', {name: /Remove/});
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).not.toBeDisabled();
    remove.focus();
    await user.keyboard('{Enter}');
    expect(onRemove).not.toHaveBeenCalled();
    // A click that reaches it (assistive technology dispatching one; the
    // disabled thumbnail takes no pointer events) calls nothing either.
    fireEvent.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('keeps a disabled Open mounted, focusable and announced as disabled, without calling onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Thumbnail src="/img.jpg" alt="Test" onClick={onClick} isDisabled />,
    );
    const open = screen.getByRole('button', {name: 'Open Test'});
    expect(open).toHaveAttribute('aria-disabled', 'true');
    open.focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps Open mounted but inert while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Thumbnail src="/img.jpg" alt="Test" onClick={onClick} isLoading />);
    const open = screen.getByRole('button', {name: 'Open Test'});
    expect(open).toHaveAttribute('aria-disabled', 'true');
    await user.click(open);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', {isDisabled: true}],
    ['loading', {isLoading: true}],
  ])(
    'stops a press on a %s Open before it reaches an ancestor (spec:AST-085 FR2)',
    async (_state, stateProps) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onAncestorClick = vi.fn();
      render(
        <div onClick={onAncestorClick}>
          <Thumbnail
            src="/img.jpg"
            alt="Test"
            onClick={onClick}
            {...stateProps}
          />
        </div>,
      );
      const open = screen.getByRole('button', {name: 'Open Test'});
      open.focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      // A disabled thumbnail takes no pointer events, so the click is
      // dispatched directly, as assistive technology may.
      fireEvent.click(open);
      expect(onClick).not.toHaveBeenCalled();
      expect(onAncestorClick).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a disabled Open', {isDisabled: true}, 'Open Test'],
    ['a loading Open', {isLoading: true}, 'Open Test'],
    ['a disabled Remove', {isDisabled: true}, /Remove/],
  ] as const)(
    'Enter and Space on %s dispatch no click to any listener (spec:AST-085 FR2)',
    async (_name, stateProps, buttonName) => {
      const user = userEvent.setup();
      const clicks = vi.fn();
      document.addEventListener('click', clicks, {capture: true});
      try {
        render(
          <Thumbnail
            src="/img.jpg"
            alt="Test"
            onClick={vi.fn()}
            onRemove={vi.fn()}
            {...stateProps}
          />,
        );
        screen.getByRole('button', {name: buttonName}).focus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(clicks).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('click', clicks, {capture: true});
      }
    },
  );

  it('keeps focus on Open and Remove when the thumbnail becomes loading or disabled (spec:AST-085 FR4)', () => {
    const props = {
      src: '/img.jpg',
      alt: 'Test',
      onClick: vi.fn(),
      onRemove: vi.fn(),
    };
    const {rerender} = render(<Thumbnail {...props} />);
    const open = screen.getByRole('button', {name: 'Open Test'});
    open.focus();
    rerender(<Thumbnail {...props} isLoading />);
    expect(document.activeElement).toBe(open);
    rerender(<Thumbnail {...props} isDisabled />);
    expect(document.activeElement).toBe(open);

    rerender(<Thumbnail {...props} />);
    const remove = screen.getByRole('button', {name: /Remove/});
    remove.focus();
    rerender(<Thumbnail {...props} isDisabled />);
    expect(document.activeElement).toBe(remove);
    expect(remove).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards ref to root element', () => {
    const ref = vi.fn();
    render(<Thumbnail ref={ref} data-testid="thumb" />);
    expect(ref).toHaveBeenCalled();
  });

  describe('showRemoveOn', () => {
    // The reveal style lives on the slot <div> that wraps the remove button
    // (ancestor-marker styles can't ride on a child component's xstyle prop),
    // so assert on the button's parent element.
    const removeSlotClass = (
      showRemoveOn?: 'always' | 'hover',
    ): {className: string; unmount: () => void} => {
      const view = render(
        <Thumbnail
          label="file.png"
          onRemove={vi.fn()}
          showRemoveOn={showRemoveOn}
        />,
      );
      const slot = screen.getByRole('button', {
        name: 'Remove file.png',
      }).parentElement!;
      return {className: slot.className, unmount: view.unmount};
    };

    it('renders the remove button in the DOM even when showRemoveOn="hover"', () => {
      // Hover reveal is CSS-only (opacity) — the button must stay mounted so
      // it remains reachable by keyboard and assistive tech.
      render(
        <Thumbnail label="file.png" onRemove={vi.fn()} showRemoveOn="hover" />,
      );
      expect(
        screen.getByRole('button', {name: 'Remove file.png'}),
      ).toBeInTheDocument();
    });

    it('applies a distinct slot class when showRemoveOn="hover" vs "always"', () => {
      const always = removeSlotClass('always');
      always.unmount();
      const hover = removeSlotClass('hover');
      expect(hover.className).not.toBe(always.className);
    });

    it('defaults to "hover" (same slot class as an explicit hover)', () => {
      const def = removeSlotClass(undefined);
      def.unmount();
      const hover = removeSlotClass('hover');
      expect(def.className).toBe(hover.className);
    });

    it('still fires onRemove when revealed on hover', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(
        <Thumbnail label="file.png" onRemove={onRemove} showRemoveOn="hover" />,
      );
      await user.click(screen.getByRole('button', {name: 'Remove file.png'}));
      expect(onRemove).toHaveBeenCalledOnce();
    });
  });

  it('shows the placeholder when the image fails to load', () => {
    render(<Thumbnail src="/broken.jpg" alt="Broken" data-testid="thumb" />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.queryByRole('img')).toBeNull();
    const root = screen.getByTestId('thumb');
    expect(root.querySelector('svg')).toBeInTheDocument();
  });

  it('retries a changed src after a load error', () => {
    const {rerender} = render(
      <Thumbnail src="/broken.jpg" alt="Photo" data-testid="thumb" />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();

    rerender(<Thumbnail src="/fixed.jpg" alt="Photo" data-testid="thumb" />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/fixed.jpg');
  });
});

describe('Thumbnail pressed state (touch)', () => {
  it('fades the touch press out on the interactive container, whose overlay layer reads its strength', () => {
    const {container} = render(
      <Thumbnail src="/img.jpg" alt="Clickable" onClick={vi.fn()} />,
    );
    const surface = container.querySelector('[data-astryx-pressable]');
    if (surface == null) {
      throw new Error('the interactive thumbnail carries no pressable marker');
    }
    expect(hasReleaseFade(surface)).toBe(true);
    expect(readsPressStrength(surface, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(surface)).toBe(true);
    expect(afterPaintsPress(surface, '[data-astryx-press="on"]')).toBe(true);
    expect(afterPaintsPress(surface)).toBe(true);
    // In a layered stylesheet a press arm on a custom property the container
    // also declares without it never applies.
    expect(pressArmsShadowedByDefault(surface)).toEqual([]);
  });

  it('carries none of it when not interactive', () => {
    const {container} = render(<Thumbnail src="/img.jpg" alt="Static" />);
    expect(container.querySelector('[data-astryx-pressable]')).toBeNull();
  });
});
