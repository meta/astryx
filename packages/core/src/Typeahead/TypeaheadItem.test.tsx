// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TypeaheadItem.test.tsx
 * @input Uses vitest, @testing-library/react, TypeaheadItem, the shared
 *   declaredValue StyleX read-back helper
 * @output Unit tests for TypeaheadItem
 * @position Testing; validates TypeaheadItem.tsx implementation — pass-through
 *   props, the label/icon/description layout, disabled dimming, ref forwarding,
 *   and the pre-rendered `item.element` short-circuit
 */

import {describe, it, expect} from 'vitest';
import {createRef, type ReactElement} from 'react';
import {render, screen} from '@testing-library/react';
import {TypeaheadItem} from './TypeaheadItem';
import type {SearchableItem} from './types';
import {declaredValue} from '../__tests__/stylexDeclarations';

const item: SearchableItem = {id: '1', label: 'Alice'};

/** Renders the item and returns its root row element. */
function renderItem(ui: ReactElement): HTMLElement {
  const {container} = render(ui);
  return container.firstElementChild as HTMLElement;
}

describe('TypeaheadItem', () => {
  it('forwards pass-through props to the item element', () => {
    render(
      <TypeaheadItem
        item={{id: '1', label: 'Alice'}}
        aria-label="Alice, engineer"
        id="result-1"
        data-source="directory"
        data-testid="item"
      />,
    );
    const item = screen.getByTestId('item');
    expect(item).toHaveAttribute('aria-label', 'Alice, engineer');
    expect(item).toHaveAttribute('id', 'result-1');
    expect(item).toHaveAttribute('data-source', 'directory');
  });

  it('merges a caller className with its own classes', () => {
    render(
      <TypeaheadItem
        item={{id: '1', label: 'Alice'}}
        className="caller-class"
        data-testid="item"
      />,
    );
    const item = screen.getByTestId('item');
    expect(item.className).toContain('caller-class');
    expect(item.className).toContain('astryx-typeahead-item');
  });

  it('renders the item label', () => {
    render(<TypeaheadItem item={item} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders the description below the label when provided', () => {
    const root = renderItem(
      <TypeaheadItem item={item} description="Engineer" />,
    );
    const content = root.lastElementChild!;
    expect(Array.from(content.children).map(c => c.textContent)).toEqual([
      'Alice',
      'Engineer',
    ]);
  });

  it('renders no description element when none is provided', () => {
    const root = renderItem(<TypeaheadItem item={item} />);
    const content = root.lastElementChild!;
    expect(content.children.length).toBe(1);
    expect(content.textContent).toBe('Alice');
  });

  it('renders the icon before the label content', () => {
    const root = renderItem(
      <TypeaheadItem item={item} icon={<svg data-testid="avatar" />} />,
    );
    expect(root.children.length).toBe(2);
    expect(root.firstElementChild).toBe(screen.getByTestId('avatar'));
  });

  it('dims the row when isDisabled is set', () => {
    const root = renderItem(<TypeaheadItem item={item} isDisabled />);
    expect(declaredValue(root, 'opacity')).toBe('0.5');
  });

  it('does not dim the row by default', () => {
    const root = renderItem(<TypeaheadItem item={item} />);
    expect(declaredValue(root, 'opacity')).toBeNull();
  });

  it('forwards ref to the row element', () => {
    const ref = createRef<HTMLDivElement>();
    const root = renderItem(<TypeaheadItem item={item} ref={ref} />);
    expect(ref.current).toBe(root);
  });
});

describe('TypeaheadItem with a pre-rendered item.element', () => {
  it('renders item.element raw in place of the label layout', () => {
    // The caller's element is the whole output — not wrapped in the styled
    // row — so the label, icon, description and isDisabled dimming have
    // nowhere to land.
    const {container} = render(
      <TypeaheadItem
        item={{
          id: '1',
          label: 'Never shown',
          element: <div data-testid="prerendered">Pre-rendered row</div>,
        }}
        icon={<svg data-testid="avatar" />}
        description="Engineer"
        isDisabled
      />,
    );
    const root = container.firstElementChild!;
    expect(root).toBe(screen.getByTestId('prerendered'));
    expect(container.children.length).toBe(1);
    expect(root.className).toBe('');
    expect(
      container.querySelector('.astryx-typeahead-item'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Never shown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('avatar')).not.toBeInTheDocument();
    expect(screen.queryByText('Engineer')).not.toBeInTheDocument();
  });
});
