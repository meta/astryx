// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AvatarGroup} from './AvatarGroup';
import {AvatarGroupOverflow} from './AvatarGroupOverflow';
import {Avatar, AvatarStatusDot} from '../Avatar';
import {HoverCard} from '../HoverCard';
import {Tooltip} from '../Tooltip';

describe('AvatarGroup', () => {
  it('renders all avatar children', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <Avatar name="Bob" />
        <Avatar name="Charlie" />
      </AvatarGroup>,
    );

    expect(screen.getByLabelText('Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Charlie')).toBeInTheDocument();
  });

  it('composes a labelled status into a grouped avatar accessible name (WCAG 4.1.2)', () => {
    render(
      <AvatarGroup>
        <Avatar
          name="Alice"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar name="Bob" />
      </AvatarGroup>,
    );

    expect(screen.getByLabelText('Alice, Online')).toBeInTheDocument();
    expect(screen.getByLabelText('Bob')).toBeInTheDocument();
  });

  it('renders with role="group" and default aria-label', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
      </AvatarGroup>,
    );

    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Avatars');
  });

  it('accepts a custom aria-label', () => {
    render(
      <AvatarGroup aria-label="Team members">
        <Avatar name="Alice" />
      </AvatarGroup>,
    );

    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Team members',
    );
  });

  it('applies data-testid', () => {
    render(
      <AvatarGroup data-testid="avatar-group">
        <Avatar name="Alice" />
      </AvatarGroup>,
    );

    expect(screen.getByTestId('avatar-group')).toBeInTheDocument();
  });

  it('reflects size on the group', () => {
    render(
      <AvatarGroup size="lg">
        <Avatar name="Alice" />
      </AvatarGroup>,
    );

    const group = screen.getByRole('group');
    expect(group.className).toContain('astryx-avatar-group');
    expect(group).toHaveAttribute('data-size', 'lg');
  });

  it('renders empty group when no children', () => {
    render(<AvatarGroup data-testid="empty">{[]}</AvatarGroup>);

    expect(screen.getByTestId('empty')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('AvatarGroup — roving focus + keyboard hint', () => {
  it('is a single tab stop over interactive avatars (one tabindex=0, rest -1)', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" href="/alice" />
        <Avatar name="Bob" href="/bob" />
        <Avatar name="Charlie" href="/charlie" />
      </AvatarGroup>,
    );

    const alice = screen.getByRole('link', {name: 'Alice'});
    const bob = screen.getByRole('link', {name: 'Bob'});
    const charlie = screen.getByRole('link', {name: 'Charlie'});

    expect(alice).toHaveAttribute('tabindex', '0');
    expect(bob).toHaveAttribute('tabindex', '-1');
    expect(charlie).toHaveAttribute('tabindex', '-1');
  });

  it('roves focus with ArrowRight/ArrowLeft across interactive avatars', async () => {
    const user = userEvent.setup();
    render(
      <AvatarGroup>
        <Avatar name="Alice" href="/alice" />
        <Avatar name="Bob" onClick={() => {}} />
        <Avatar name="Charlie" href="/charlie" />
      </AvatarGroup>,
    );

    const alice = screen.getByRole('link', {name: 'Alice'});
    const bob = screen.getByRole('button', {name: 'Bob'});
    const charlie = screen.getByRole('link', {name: 'Charlie'});

    alice.focus();
    expect(alice).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(bob).toHaveFocus();
    expect(bob).toHaveAttribute('tabindex', '0');
    expect(alice).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowRight}');
    expect(charlie).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(bob).toHaveFocus();
  });

  it('includes the overflow button as the last roving item', async () => {
    const user = userEvent.setup();
    render(
      <AvatarGroup>
        <Avatar name="Alice" href="/alice" />
        <AvatarGroupOverflow count={3} onClick={() => {}} />
      </AvatarGroup>,
    );

    const alice = screen.getByRole('link', {name: 'Alice'});
    const overflow = screen.getByRole('button', {name: '3 more'});
    expect(overflow).toHaveAttribute('data-avatar-item');

    alice.focus();
    await user.keyboard('{ArrowRight}');
    expect(overflow).toHaveFocus();
  });

  it('does NOT rove over a non-avatar button in a status slot', async () => {
    const user = userEvent.setup();
    render(
      <AvatarGroup>
        <Avatar
          name="Alice"
          href="/alice"
          status={<button type="button">badge</button>}
        />
        <Avatar name="Bob" href="/bob" />
      </AvatarGroup>,
    );

    const alice = screen.getByRole('link', {name: 'Alice'});
    const bob = screen.getByRole('link', {name: 'Bob'});
    const statusButton = screen.getByRole('button', {name: 'badge'});

    // The status button carries no data-avatar-item marker.
    expect(statusButton).not.toHaveAttribute('data-avatar-item');

    alice.focus();
    await user.keyboard('{ArrowRight}');
    // Arrow moves to the next avatar, skipping the nested status button.
    expect(bob).toHaveFocus();
    expect(statusButton).not.toHaveFocus();
  });

  it('attaches an aria-describedby keyboard hint when interactive children exist', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" href="/alice" />
        <Avatar name="Bob" href="/bob" />
      </AvatarGroup>,
    );

    const group = screen.getByRole('group');
    const describedBy = group.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent('Use arrow keys to move between avatars');
  });

  it('a purely static group has no tab stop and no keyboard hint', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" data-testid="alice" />
        <Avatar name="Bob" data-testid="bob" />
      </AvatarGroup>,
    );

    const group = screen.getByRole('group');
    expect(group).not.toHaveAttribute('aria-describedby');
    // Static avatars are not focusable — no roving tabindex stamped.
    expect(screen.getByTestId('alice')).not.toHaveAttribute('tabindex');
    expect(screen.getByTestId('bob')).not.toHaveAttribute('tabindex');
  });
});

describe('AvatarGroup — overlap', () => {
  // jsdom cannot lay the row out, so these check the declarations that make
  // it overlap: every item takes the negative overlap margin, and the group's
  // start padding gives the first item that space back.
  const overlapMargin = (el: HTMLElement) =>
    getComputedStyle(el).getPropertyValue('margin-inline-start');

  it('overlaps every avatar, including the first', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" data-testid="alice" />
        <Avatar name="Bob" data-testid="bob" />
        <AvatarGroupOverflow count={2} data-testid="overflow" />
      </AvatarGroup>,
    );

    for (const id of ['alice', 'bob', 'overflow']) {
      expect(overlapMargin(screen.getByTestId(id))).toBe(
        'var(--_avatar-group-overlap)',
      );
    }
    const group = screen.getByRole('group');
    expect(
      getComputedStyle(group).getPropertyValue('padding-inline-start'),
    ).toBe('calc(-1 * var(--_avatar-group-overlap))');
    // md = 36px; the overlap is a quarter of that, negated.
    expect(group.getAttribute('style')).toContain('-9px');
  });

  it('keeps the overlap when avatars are wrapped in a HoverCard or Tooltip', () => {
    // Both wrap their trigger in a `display: contents` element, so each avatar
    // is the first child of its own wrapper. A `:not(:first-child)` rule
    // would never match.
    render(
      <AvatarGroup>
        <HoverCard content="Alice's card">
          <Avatar name="Alice" data-testid="alice" />
        </HoverCard>
        <HoverCard content="Bob's card">
          <Avatar name="Bob" data-testid="bob" />
        </HoverCard>
        <Tooltip content="Charlie">
          <Avatar name="Charlie" data-testid="charlie" />
        </Tooltip>
      </AvatarGroup>,
    );

    for (const id of ['alice', 'bob', 'charlie']) {
      const avatar = screen.getByTestId(id);
      expect(avatar.parentElement).not.toBe(screen.getByRole('group'));
      expect(overlapMargin(avatar)).toBe('var(--_avatar-group-overlap)');
    }
  });

  it('adds no start padding to an empty group', () => {
    render(<AvatarGroup data-testid="empty">{[]}</AvatarGroup>);

    expect(
      getComputedStyle(screen.getByTestId('empty')).getPropertyValue(
        'padding-inline-start',
      ),
    ).toMatch(/^0(px)?$/);
  });
});

describe('AvatarGroup — size cascade', () => {
  it("the group's size overrides a child's own size prop", () => {
    render(
      <AvatarGroup size="lg">
        <Avatar name="Alice" size="xsm" data-testid="alice" />
      </AvatarGroup>,
    );

    expect(screen.getByTestId('alice')).toHaveAttribute('data-size', 'lg');
  });

  it("the group's default size also overrides a child's own size prop", () => {
    // Known open finding: the group always publishes a size on its context, so
    // a group that never set one still imposes md on children that did set one.
    // Pinned here so the behaviour cannot change without a deliberate edit.
    render(
      <AvatarGroup>
        <Avatar name="Alice" size="xl" data-testid="alice" />
      </AvatarGroup>,
    );

    expect(screen.getByTestId('alice')).toHaveAttribute('data-size', 'md');
  });

  it("outside a group the avatar's own size applies", () => {
    render(<Avatar name="Alice" size="xl" data-testid="alice" />);

    expect(screen.getByTestId('alice')).toHaveAttribute('data-size', 'xl');
  });
});
