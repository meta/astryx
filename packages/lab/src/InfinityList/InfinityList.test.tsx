// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
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
    const ref = createRef<InfinityListHandle>();
    render(<InfinityList {...props} ref={ref} />);
    expectItem(0);

    act(() => ref.current?.scrollToIndex(750_000_003));
    expectItem(750_000_003);
    expect(screen.queryByText('Record 1')).not.toBeInTheDocument();

    act(() => ref.current?.scrollToIndex(itemCount - 1));
    expectItem(itemCount - 1);
  });

  it('keeps nearby records available across two native scroll band changes', () => {
    const {container} = render(<InfinityList {...props} />);
    const viewport = container.firstElementChild as HTMLElement;
    fireEvent.scroll(viewport, {target: {scrollTop: 999_000}});
    expectItem(31_218);
    expect(viewport.scrollTop).toBeLessThan(750_000);

    const nextTop = viewport.scrollTop + 320;
    fireEvent.scroll(viewport, {target: {scrollTop: nextTop}});
    expectItem(31_228);
    fireEvent.scroll(viewport, {target: {scrollTop: 128}});
    expectItem(15_597);
    expect(viewport.scrollTop).toBeGreaterThan(250_000);
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
