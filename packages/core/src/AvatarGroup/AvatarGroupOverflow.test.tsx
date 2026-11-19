// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AvatarGroup} from './AvatarGroup';
import {AvatarGroupOverflow} from './AvatarGroupOverflow';
import {Avatar} from '../Avatar';
import {InternationalizationProvider} from '../i18n';

describe('AvatarGroupOverflow', () => {
  it('renders overflow count as span by default', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} />
      </AvatarGroup>,
    );

    const overflow = screen.getByLabelText('5 more');
    expect(overflow.tagName).toBe('SPAN');
    expect(overflow).toHaveTextContent('+5');
  });

  it('exposes the static overflow as a named image', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} />
      </AvatarGroup>,
    );

    const overflow = screen.getByRole('img', {name: '5 more'});
    expect(overflow).toHaveAttribute('role', 'img');
  });

  it('keeps a caller-supplied role on the static overflow', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} role="note" />
      </AvatarGroup>,
    );

    expect(screen.getByLabelText('5 more')).toHaveAttribute('role', 'note');
  });

  it('reflects the group size on the overflow chip', () => {
    render(
      <AvatarGroup size="lg">
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} />
      </AvatarGroup>,
    );

    const overflow = screen.getByLabelText('5 more');
    expect(overflow.className).toContain('astryx-avatar-group-overflow');
    expect(overflow).toHaveAttribute('data-size', 'lg');
  });

  it('applies the group shape to the overflow chip, matching its avatars', () => {
    render(
      <AvatarGroup shape="square">
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} />
      </AvatarGroup>,
    );

    const overflow = screen.getByLabelText('5 more');
    expect(overflow).toHaveAttribute('data-shape', 'square');
  });

  it('defaults the overflow chip to circle shape with no explicit AvatarGroup shape', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5} />
      </AvatarGroup>,
    );

    const overflow = screen.getByLabelText('5 more');
    expect(overflow).toHaveAttribute('data-shape', 'circle');
  });

  it('renders as button when onClick is provided', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={3} onClick={() => {}} />
      </AvatarGroup>,
    );

    const overflow = screen.getByRole('button', {name: '3 more'});
    expect(overflow.tagName).toBe('BUTTON');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={3} onClick={handleClick} />
      </AvatarGroup>,
    );

    await user.click(screen.getByLabelText('3 more'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders custom children instead of default label', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={5}>
          <span data-testid="custom">more</span>
        </AvatarGroupOverflow>
      </AvatarGroup>,
    );

    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('works with sliced avatar list and server-side count', () => {
    const users = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    const serverTotal = 47;
    const visibleCount = 3;

    render(
      <AvatarGroup size="lg">
        {users.slice(0, visibleCount).map(name => (
          <Avatar key={name} name={name} />
        ))}
        <AvatarGroupOverflow count={serverTotal - visibleCount} />
      </AvatarGroup>,
    );

    expect(screen.getByLabelText('Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Charlie')).toBeInTheDocument();
    expect(screen.getByLabelText('44 more')).toBeInTheDocument();
    expect(screen.getByText('+44')).toBeInTheDocument();
  });

  it('forwards ref to the span element', () => {
    const ref = {current: null} as React.RefObject<HTMLElement | null>;

    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={3} ref={ref} />
      </AvatarGroup>,
    );

    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('forwards ref to the button element when onClick provided', () => {
    const ref = {current: null} as React.RefObject<HTMLElement | null>;

    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={3} onClick={() => {}} ref={ref} />
      </AvatarGroup>,
    );

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('applies className prop', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={3} className="custom-class" />
      </AvatarGroup>,
    );

    const overflow = screen.getByLabelText('3 more');
    expect(overflow.className).toContain('custom-class');
  });

  it('handles count of zero gracefully', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={0} />
      </AvatarGroup>,
    );

    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByLabelText('0 more')).toBeInTheDocument();
  });

  it('clamps a negative count rather than rendering "+-3"', () => {
    // `count={total - visibleCount}` is the documented shape, and it goes
    // negative whenever the list is shorter than the slice.
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={-3} />
      </AvatarGroup>,
    );

    expect(screen.queryByText('+-3')).not.toBeInTheDocument();
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByLabelText('0 more')).toBeInTheDocument();
  });

  it('renders outside an AvatarGroup at the md fallback size', () => {
    render(<AvatarGroupOverflow count={3} data-testid="loose" />);

    const overflow = screen.getByTestId('loose');
    expect(overflow).toHaveTextContent('+3');
    // inline-flex, so a standalone indicator stays a circle instead of
    // stretching to its parent's width.
    expect(overflow.tagName).toBe('SPAN');
  });

  it('handles very large count', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={999} />
      </AvatarGroup>,
    );

    expect(screen.getByText('+999')).toBeInTheDocument();
  });

  it('renders the full "+N" text for wide multi-digit counts', () => {
    // The indicator grows into a pill for long counts, so the entire number
    // must remain present (nothing clipped away in the DOM).
    render(
      <AvatarGroup>
        <Avatar name="Alice" />
        <AvatarGroupOverflow count={4912} />
      </AvatarGroup>,
    );

    expect(screen.getByText('+4912')).toBeInTheDocument();
    // The aria-label routes through the catalog's `{count, number}` ICU
    // argument, so the en locale adds a grouping separator.
    expect(screen.getByLabelText('4,912 more')).toBeInTheDocument();
  });

  it('localizes the overflow label through the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {'@astryx.avatarGroup.overflow': '{count, number} de plus'},
        }}>
        <AvatarGroup>
          <Avatar name="Alice" />
          <AvatarGroupOverflow count={3} />
        </AvatarGroup>
      </InternationalizationProvider>,
    );

    expect(screen.getByLabelText('3 de plus')).toBeInTheDocument();
  });
});
