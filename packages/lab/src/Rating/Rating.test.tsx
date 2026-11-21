// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Rating} from './Rating';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

function Controlled({
  initial = null,
  ...props
}: {
  initial?: number | null;
  allowClear?: boolean;
  isDisabled?: boolean;
  max?: number;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <Rating label="Your rating" value={value} onChange={setValue} {...props} />
  );
}

const stars = () => screen.getAllByRole('radio');

describe('Rating', () => {
  it('is a named radio group with one radio per star', () => {
    render(<Controlled initial={3} />);
    expect(
      screen.getByRole('radiogroup', {name: 'Your rating'}),
    ).toBeInTheDocument();
    expect(stars()).toHaveLength(5);
    expect(screen.getByRole('radio', {name: '3 of 5 stars'})).toBeChecked();
    expect(screen.getByRole('radio', {name: '4 of 5 stars'})).not.toBeChecked();
  });

  it('has one tab stop: the chosen star, or the first when none is chosen', () => {
    const {rerender} = render(
      <Rating label="r" value={null} onChange={() => {}} />,
    );
    expect(stars().map(s => s.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    rerender(<Rating label="r" value={4} onChange={() => {}} />);
    expect(stars().map(s => s.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
  });

  it('returns Tab focus to the checked star when a caller ignores onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <Rating label="r" value={3} onChange={onChange} />
        <button>After rating</button>
      </>,
    );
    const checked = screen.getByRole('radio', {name: '3 of 5 stars'});
    const previous = screen.getByRole('radio', {name: '2 of 5 stars'});
    await user.tab();
    expect(checked).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(previous).toHaveFocus();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
    expect(checked).toBeChecked();
    expect(previous).not.toBeChecked();
    expect(stars().map(s => s.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    await user.tab();
    expect(checked).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After rating'})).toHaveFocus();
    await user.tab({shift: true});
    expect(checked).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('chooses a star on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating label="r" value={null} onChange={onChange} />);
    await user.click(screen.getByRole('radio', {name: '4 of 5 stars'}));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('moves the choice and focus with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={2} />);
    await user.tab();
    expect(screen.getByRole('radio', {name: '2 of 5 stars'})).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', {name: '3 of 5 stars'})).toBeChecked();
    expect(screen.getByRole('radio', {name: '3 of 5 stars'})).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', {name: '4 of 5 stars'})).toBeChecked();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(screen.getByRole('radio', {name: '2 of 5 stars'})).toBeChecked();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', {name: '5 of 5 stars'})).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', {name: '5 of 5 stars'})).toBeChecked();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', {name: '1 of 5 stars'})).toBeChecked();
  });

  it('swaps ArrowLeft and ArrowRight in a right-to-left context', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Rating dir="rtl" label="r" value={2} onChange={onChange} />);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('chooses the focused star with Space and Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating label="r" value={null} onChange={onChange} />);
    await user.tab();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenNthCalledWith(1, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('clears the rating on a second choice only with allowClear', async () => {
    const user = userEvent.setup();
    const {unmount} = render(<Controlled initial={3} />);
    await user.click(screen.getByRole('radio', {name: '3 of 5 stars'}));
    expect(screen.getByRole('radio', {name: '3 of 5 stars'})).toBeChecked();
    unmount();
    render(<Controlled initial={3} allowClear />);
    await user.click(screen.getByRole('radio', {name: '3 of 5 stars'}));
    expect(stars().every(s => s.getAttribute('aria-checked') === 'false')).toBe(
      true,
    );
  });

  it('stays focusable and announces disabled, and changes nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating label="r" value={2} onChange={onChange} isDisabled />);
    await user.tab();
    expect(screen.getByRole('radio', {name: '2 of 5 stars'})).toHaveFocus();
    expect(screen.getByRole('radio', {name: '2 of 5 stars'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('radio', {name: '4 of 5 stars'}));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a read-only rating as one image with a text name and no tab stop', async () => {
    const user = userEvent.setup();
    render(<Rating label="Average" value={4.3} isReadOnly />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getByRole('img', {name: 'Average: 4.3 of 5 stars'}),
    ).toBeInTheDocument();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('names a whole read-only rating with getStarLabel', () => {
    render(
      <Rating
        label="Note"
        value={3}
        isReadOnly
        getStarLabel={(n, max) => `${n} sur ${max}`}
      />,
    );
    expect(
      screen.getByRole('img', {name: 'Note: 3 sur 5'}),
    ).toBeInTheDocument();
  });

  it('respects max and clamps an out-of-range value', () => {
    render(<Rating label="r" value={9} max={3} onChange={() => {}} />);
    expect(stars()).toHaveLength(3);
    expect(screen.getByRole('radio', {name: '3 of 3 stars'})).toBeChecked();
  });

  it('treats a non-finite or negative value as not rated', () => {
    render(<Rating label="r" value={Number.NaN} onChange={() => {}} />);
    expect(stars().every(s => s.getAttribute('aria-checked') === 'false')).toBe(
      true,
    );
  });

  it('reflects the size as a data attribute', () => {
    render(
      <Rating
        label="r"
        value={1}
        size="lg"
        data-testid="r"
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('r').getAttribute('data-size')).toBe('lg');
  });

  it('fills a fractional star partway from the inline start', () => {
    render(<Rating label="Average" value={3.5} isReadOnly />);
    const img = screen.getByRole('img');
    const svgs = img.querySelectorAll('svg');
    expect(svgs).toHaveLength(5);
    expect([...svgs].map(svg => svg.querySelectorAll('path').length)).toEqual([
      1, 1, 1, 2, 1,
    ]);
    const partial = svgs[3].querySelectorAll('path')[1];
    expect(partial.getAttribute('style')).toContain('50%');
    expect(getComputedStyle(partial).clipPath).toContain('var(');
  });

  it('uses one SVG and one path for each whole input star', () => {
    render(<Controlled initial={2} />);
    expect(stars().map(star => star.querySelectorAll('svg').length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(stars().map(star => star.querySelectorAll('path').length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(stars().some(star => star.querySelector('[style]'))).toBe(false);
  });
});

it('translates a fractional read-only value through the same label callback', () => {
  render(
    <Rating
      label="Note"
      value={4.3}
      isReadOnly
      getStarLabel={(n, max) => `${n} sur ${max}`}
    />,
  );
  expect(
    screen.getByRole('img', {name: 'Note: 4.3 sur 5'}),
  ).toBeInTheDocument();
});

it('keeps a valid number of stars for a non-finite max', () => {
  render(<Rating label="r" value={2} max={Infinity} />);
  expect(stars()).toHaveLength(5);
});

it('preserves its role and label while forwarding host props and refs', () => {
  const ref = {current: null};
  render(<Rating label="Rating" value={2} ref={ref} id="score" />);
  const group = screen.getByRole('radiogroup', {name: 'Rating'});
  expect(group.id).toBe('score');
  expect(ref.current).toBe(group);
});

it.each([
  [5, '{ArrowRight}'],
  [5, '{End}'],
  [1, '{ArrowLeft}'],
  [1, '{Home}'],
])('does not clear selected boundary %s with %s', async (value, key) => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Rating label="r" value={value} onChange={onChange} allowClear />);
  await user.tab();
  await user.keyboard(key);
  expect(onChange).not.toHaveBeenCalled();
  expect(stars()[value - 1]).toBeChecked();
});

it('preserves the caller pointer-leave handler', async () => {
  const user = userEvent.setup();
  const onPointerLeave = vi.fn();
  render(<Rating label="r" value={2} onPointerLeave={onPointerLeave} />);
  await user.hover(stars()[3]);
  await user.unhover(stars()[3]);
  expect(onPointerLeave).toHaveBeenCalled();
});

it('does not select or clear on Tab entry or programmatic focus', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Rating label="r" value={null} onChange={onChange} allowClear />);
  await user.tab();
  stars()[3].focus();
  expect(onChange).not.toHaveBeenCalled();
});

it.each([' ', '{Enter}'])(
  'clears the checked star with explicit activation %s',
  async key => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating label="r" value={3} onChange={onChange} allowClear />);
    await user.tab();
    await user.keyboard(key);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  },
);

it('does not commit at pointer focus before the click', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Rating label="r" value={3} onChange={onChange} allowClear />);
  await user.tab();
  await user.pointer({target: stars()[3], keys: '[MouseLeft>]'});
  expect(onChange).not.toHaveBeenCalled();
  await user.pointer({keys: '[/MouseLeft]'});
  expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
});

it('lets the caller cancel keyboard navigation', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onKeyDown = vi.fn(event => event.preventDefault());
  render(
    <Rating label="r" value={2} onChange={onChange} onKeyDown={onKeyDown} />,
  );
  await user.tab();
  await user.keyboard('{ArrowRight}');
  expect(onKeyDown).toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('translates star and complete read-only names from provider messages', () => {
  const messages = {
    fr: {
      '@astryx.rating.starLabel': '{value, number} sur {max, number} étoiles',
      '@astryx.rating.readOnlyLabel': '{rating} pour {label}',
    },
  };
  render(
    <InternationalizationProvider locale="fr" messages={messages}>
      <Rating label="Note" value={2} />
      <Rating label="Moyenne" value={3.5} isReadOnly />
    </InternationalizationProvider>,
  );
  expect(screen.getByRole('radio', {name: '2 sur 5 étoiles'})).toBeChecked();
  expect(
    screen.getByRole('img', {name: '3,5 sur 5 étoiles pour Moyenne'}),
  ).toBeInTheDocument();
});

it('uses the catalog order with a custom read-only rating label', () => {
  render(
    <InternationalizationProvider
      locale="fr"
      messages={{
        fr: {
          '@astryx.rating.readOnlyLabel': '{rating} pour {label}',
        },
      }}>
      <Rating
        label="Moyenne"
        value={3.5}
        isReadOnly
        getStarLabel={value => `${value} étoiles`}
      />
    </InternationalizationProvider>,
  );
  expect(
    screen.getByRole('img', {name: '3.5 étoiles pour Moyenne'}),
  ).toBeInTheDocument();
});

// Review round 2 regressions.
describe('Rating read-only handler forwarding', () => {
  it('forwards caller key and focus handlers in read-only mode', () => {
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    render(
      <Rating
        label="Average"
        value={3.5}
        isReadOnly
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      />,
    );
    const image = screen.getByRole('img');
    fireEvent.keyDown(image, {key: 'x'});
    fireEvent.focus(image);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
  it('does not expose internal per-star data attributes', () => {
    render(<Controlled initial={3} />);
    expect(stars().some(star => star.hasAttribute('data-star'))).toBe(false);
  });
  it('renders read-only SVGs without style-only spans', () => {
    render(<Rating label="Average" value={3.5} isReadOnly />);
    const image = screen.getByRole('img');
    expect(image.querySelectorAll(':scope > svg')).toHaveLength(5);
    expect(image.querySelectorAll('span')).toHaveLength(0);
  });
});

describe('Rating native activation and caller focus cancellation', () => {
  it('lets a caller cancel selection from navigation focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Rating
        label="r"
        value={2}
        onChange={onChange}
        onFocus={event => event.preventDefault()}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each([' ', '{Enter}'])('activates only once with native %s', async key => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating label="r" value={2} allowClear onChange={onChange} />);
    await user.tab();
    await user.keyboard(key);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });
});
