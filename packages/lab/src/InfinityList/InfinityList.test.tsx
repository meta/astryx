// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {InfinityList, type InfinityListHandle} from './InfinityList';

const label = 'Archive';
const itemCount = 1_000_000_000;
const props = {
  label,
  itemCount,
  itemHeight: 32,
  viewportHeight: 320,
  getItemLabel: (index: number) => `Record ${index + 1}`,
};

function expectItem(index: number, count = itemCount) {
  const list = screen.getByRole('list', {name: label});
  const item = within(list).getByText(`Record ${index + 1}`);
  expect(item).toHaveAttribute('aria-posinset', String(index + 1));
  expect(item).toHaveAttribute('aria-setsize', String(count));
  expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(19);
}

describe('InfinityList', () => {
  it('reaches an exact distant item and the last item without mounting the archive', () => {
    const handleRef = createRef<InfinityListHandle>();
    vi.useFakeTimers();
    try {
      render(<InfinityList {...props} handleRef={handleRef} />);
      expectItem(0);

      act(() => handleRef.current?.scrollToIndex(750_000_003));
      act(() => vi.advanceTimersToNextFrame());
      expectItem(750_000_003);
      expect(screen.queryByText('Record 1')).not.toBeInTheDocument();

      act(() => handleRef.current?.scrollToIndex(itemCount - 1));
      act(() => vi.advanceTimersToNextFrame());
      expectItem(itemCount - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('batches wheel deltas and moves the list without writing native scrollTop', () => {
    const getItemLabel = vi.fn(props.getItemLabel);
    vi.useFakeTimers();
    try {
      const {container} = render(
        <InfinityList {...props} getItemLabel={getItemLabel} />,
      );
      const list = screen.getByRole('list', {name: label});
      const viewport = list.parentElement as HTMLElement;
      const initialCalls = getItemLabel.mock.calls.length;
      const initialItem = within(list).getByText('Record 1');
      expect(fireEvent.wheel(viewport, {deltaY: 2.5})).toBe(false);
      expect(fireEvent.wheel(viewport, {deltaY: 3.25})).toBe(false);
      expect(list.style.getPropertyValue('--infinity-translate')).toBe('0px');
      act(() => vi.advanceTimersToNextFrame());
      expect(list.style.getPropertyValue('--infinity-translate')).toBe(
        '-5.75px',
      );
      expect(within(list).getByText('Record 1')).toBe(initialItem);
      expect(getItemLabel).toHaveBeenCalledTimes(initialCalls);
      expect(viewport.scrollTop).toBe(0);
      fireEvent.wheel(viewport, {deltaMode: 1, deltaY: 80});
      act(() => vi.advanceTimersToNextFrame());
      expectItem(80);
      expect(viewport.scrollTop).toBe(0);
      expect(container.querySelector('[role="scrollbar"]')).toHaveAttribute(
        'aria-valuenow',
        '80',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps every item in a short list available', () => {
    render(<InfinityList {...props} itemCount={3} />);
    expectItem(2, 3);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders an empty list without invoking its label source', () => {
    render(
      <InfinityList
        {...props}
        itemCount={0}
        getItemLabel={() => {
          throw new Error('Empty lists have no items');
        }}
      />,
    );
    expect(screen.getByRole('list', {name: label})).toBeEmptyDOMElement();
  });
});
