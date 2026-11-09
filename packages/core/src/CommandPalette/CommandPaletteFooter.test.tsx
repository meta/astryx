// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteFooter.test.tsx
 * @input Uses Vitest, Testing Library, StyleX declaration helpers
 * @output Mutation-sensitive tests for default/custom content and BaseProps
 * @position Colocated unit coverage for the CommandPalette footer contract
 */

import {createRef, type ReactElement} from 'react';
import * as stylex from '@stylexjs/stylex';
import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {declaredValue} from '../__tests__/stylexDeclarations';
import {CommandPaletteFooter} from './CommandPaletteFooter';

const testStyles = stylex.create({
  wide: {width: '999px'},
});

/** CommandPaletteFooter renders exactly one root element. */
function renderRoot(ui: ReactElement): HTMLElement {
  const {container} = render(ui);
  return container.firstElementChild as HTMLElement;
}

describe('CommandPaletteFooter', () => {
  it('renders the default labels through four accessible Kbd targets', () => {
    const root = renderRoot(<CommandPaletteFooter />);
    const shortcuts = screen.getAllByRole('img');

    expect(root.textContent).toContain('Navigate');
    expect(root.textContent).toContain('Select');
    expect(root.textContent).toContain('Close');
    expect(shortcuts.map(node => node.getAttribute('aria-label'))).toEqual([
      'Up arrow',
      'Down arrow',
      'Enter',
      'Escape',
    ]);
    expect(shortcuts).toHaveLength(4);
    expect(shortcuts.every(node => node.classList.contains('astryx-kbd'))).toBe(
      true,
    );
    expect(root.querySelectorAll('kbd')).toHaveLength(4);
  });

  it('renders custom children instead of the default hints', () => {
    const root = renderRoot(
      <CommandPaletteFooter>
        <span>Custom footer content</span>
      </CommandPaletteFooter>,
    );

    expect(root.textContent).toBe('Custom footer content');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(root.textContent).not.toContain('Navigate');
  });

  it('carries the stable theme target on its single root', () => {
    const root = renderRoot(<CommandPaletteFooter />);

    expect(root.tagName).toBe('DIV');
    expect(root.className.split(' ')).toContain(
      'astryx-command-palette-footer',
    );
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('allows translated guidance groups to wrap on narrow surfaces', () => {
    const root = renderRoot(<CommandPaletteFooter />);

    expect(declaredValue(root, 'flex-wrap')).toBe('wrap');
  });

  it('appends a consumer className after generated classes', () => {
    const base = renderRoot(<CommandPaletteFooter />).className.split(' ');
    const withCustom = renderRoot(
      <CommandPaletteFooter className="my-footer" />,
    ).className.split(' ');

    expect(withCustom).toEqual([...base, 'my-footer']);
  });

  it('merges xstyle into the root styles', () => {
    const root = renderRoot(<CommandPaletteFooter xstyle={testStyles.wide} />);

    expect(declaredValue(root, 'width')).toBe('999px');
  });

  it('applies a consumer style to the root', () => {
    const root = renderRoot(
      <CommandPaletteFooter style={{marginBlockStart: '8px'}} />,
    );

    expect(root).toHaveStyle({marginBlockStart: '8px'});
  });

  it('forwards ref to the root', () => {
    const ref = createRef<HTMLDivElement>();
    const root = renderRoot(<CommandPaletteFooter ref={ref} />);

    expect(ref.current).toBe(root);
  });

  it('forwards arbitrary DOM props to the root', () => {
    const root = renderRoot(
      <CommandPaletteFooter
        id="palette-footer"
        data-kind="default"
        role="contentinfo"
        aria-label="Command shortcuts"
      />,
    );

    expect(root.id).toBe('palette-footer');
    expect(root).toHaveAttribute('data-kind', 'default');
    expect(screen.getByRole('contentinfo', {name: 'Command shortcuts'})).toBe(
      root,
    );
  });
});
