// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteEmpty.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for CommandPaletteEmpty
 * @position Colocated unit test; covers children rendering, the stable theme
 *   class surface, and className/style/ref/prop forwarding through mergeProps
 */

import {describe, it, expect} from 'vitest';
import {createRef, type ReactElement} from 'react';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {CommandPaletteEmpty} from './CommandPaletteEmpty';
import {declaredValue} from '../__tests__/stylexDeclarations';

const testStyles = stylex.create({
  wide: {width: '999px'},
});

/** The component renders exactly one element, so the root is the first child. */
function renderRoot(ui: ReactElement): HTMLElement {
  const {container} = render(ui);
  return container.firstElementChild as HTMLElement;
}

describe('CommandPaletteEmpty', () => {
  it('renders its children as the element content', () => {
    const root = renderRoot(
      <CommandPaletteEmpty>No results found</CommandPaletteEmpty>,
    );
    expect(root.tagName).toBe('DIV');
    expect(root.textContent).toBe('No results found');
  });

  it('renders element children, not just text', () => {
    render(
      <CommandPaletteEmpty>
        <span data-testid="empty-illustration" />
        Start typing to search
      </CommandPaletteEmpty>,
    );
    expect(screen.getByTestId('empty-illustration')).toBeInTheDocument();
    expect(screen.getByText('Start typing to search')).toBeInTheDocument();
  });

  it('carries the stable astryx class for theme targeting', () => {
    const root = renderRoot(<CommandPaletteEmpty>Empty</CommandPaletteEmpty>);
    expect(root.className.split(' ')).toContain('astryx-command-palette-empty');
  });

  it('appends a consumer className after the generated classes', () => {
    const base = renderRoot(
      <CommandPaletteEmpty>Empty</CommandPaletteEmpty>,
    ).className.split(' ');
    const withCustom = renderRoot(
      <CommandPaletteEmpty className="my-empty">Empty</CommandPaletteEmpty>,
    ).className.split(' ');
    // Every generated class survives and the consumer class is added last.
    expect(withCustom).toEqual([...base, 'my-empty']);
  });

  it('merges an xstyle into the element styles', () => {
    const root = renderRoot(
      <CommandPaletteEmpty xstyle={testStyles.wide}>Empty</CommandPaletteEmpty>,
    );
    expect(declaredValue(root, 'width')).toBe('999px');
  });

  it('applies a consumer style to the element', () => {
    const root = renderRoot(
      <CommandPaletteEmpty style={{marginBlockStart: '8px'}}>
        Empty
      </CommandPaletteEmpty>,
    );
    expect(root).toHaveStyle({marginBlockStart: '8px'});
  });

  it('forwards ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    const root = renderRoot(
      <CommandPaletteEmpty ref={ref}>Empty</CommandPaletteEmpty>,
    );
    expect(ref.current).toBe(root);
  });

  it('forwards arbitrary DOM props (id, data-*, role) to the element', () => {
    const root = renderRoot(
      <CommandPaletteEmpty
        id="palette-empty"
        data-kind="bootstrap"
        role="status">
        Empty
      </CommandPaletteEmpty>,
    );
    expect(root.id).toBe('palette-empty');
    expect(root).toHaveAttribute('data-kind', 'bootstrap');
    expect(screen.getByRole('status')).toBe(root);
  });
});
