// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {EmptyState} from './EmptyState';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

const testStyles = stylex.create({
  root: {
    minWidth: '123px',
  },
});

describe('EmptyState', () => {
  it('renders with title', () => {
    render(<EmptyState title="No results found" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders title as h3 by default', () => {
    render(<EmptyState title="No data" />);
    const heading = screen.getByRole('heading', {name: 'No data'});
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H3');
  });

  it('renders custom heading level', () => {
    render(<EmptyState title="No data" headingLevel={2} />);
    const heading = screen.getByRole('heading', {name: 'No data'});
    expect(heading.tagName).toBe('H2');
  });

  it('renders all heading levels', () => {
    const levels = [1, 2, 3, 4, 5, 6] as const;
    for (const level of levels) {
      const {unmount} = render(
        <EmptyState title={`Level ${level}`} headingLevel={level} />,
      );
      const heading = screen.getByRole('heading', {
        name: `Level ${level}`,
      });
      expect(heading.tagName).toBe(`H${level}`);
      unmount();
    }
  });

  it('renders with description', () => {
    render(
      <EmptyState
        title="No results"
        description="Try adjusting your search."
      />,
    );
    expect(screen.getByText('Try adjusting your search.')).toBeInTheDocument();
    // Description keeps its stable target element instead of paragraph semantics.
    expect(screen.getByText('Try adjusting your search.').tagName).toBe('DIV');
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="No results" />);
    expect(screen.queryByText('Try adjusting your search.')).toBeNull();
  });

  it('renders with icon', () => {
    render(
      <EmptyState
        title="No results"
        icon={<span data-testid="empty-icon">📭</span>}
      />,
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('marks icon as decorative with aria-hidden', () => {
    render(
      <EmptyState
        title="No results"
        icon={<span data-testid="empty-icon">📭</span>}
      />,
    );
    const iconWrapper = screen.getByTestId('empty-icon').parentElement;
    expect(iconWrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not render icon wrapper when icon is not provided', () => {
    const {container} = render(<EmptyState title="No results" />);
    expect(
      container.querySelector('[aria-hidden="true"]'),
    ).not.toBeInTheDocument();
  });

  it('renders with actions', () => {
    render(
      <EmptyState
        title="No results"
        actions={
          <button type="button" data-testid="action-btn">
            Retry
          </button>
        }
      />,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });

  it('does not render actions wrapper when actions is not provided', () => {
    const {container} = render(<EmptyState title="No results" />);
    // Container div + text group div, but no actions wrapper
    const divs = container.querySelectorAll('div');
    expect(divs).toHaveLength(2); // container + text group
  });

  it('does not make the root a live region', () => {
    const {container} = render(<EmptyState title="No results" />);
    expect(container.querySelector('[role], [aria-live]')).toBeNull();
  });

  it('renders compact variant', () => {
    render(<EmptyState title="No results" isCompact />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<EmptyState ref={ref} title="No results" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('spreads data-testid', () => {
    render(<EmptyState title="No results" data-testid="empty-state" />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('does not render empty optional slot wrappers', () => {
    const {container} = render(
      <EmptyState title="No results" description="" icon={false} actions="" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveTextContent('No results');
    expect(root).toHaveTextContent(/^No results$/);
    expect(root.children).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(
      container.querySelector('.astryx-empty-state-description'),
    ).toBeNull();
  });

  it('composes root props, including a caller role', () => {
    const onClick = vi.fn();
    const expectedXstyleClass = stylex.props(testStyles.root).className;
    if (expectedXstyleClass == null) {
      throw new Error('Expected the test xstyle to produce a class name.');
    }
    render(
      <EmptyState
        title="No results"
        role="region"
        data-owner="consumer"
        className="consumer-class"
        style={{width: '321px'}}
        xstyle={testStyles.root}
        onClick={onClick}
      />,
    );

    const root = screen.getByRole('region');
    expect(root).toHaveClass('astryx-empty-state', 'consumer-class');
    expect(root).toHaveClass(expectedXstyleClass);
    expect(root).toHaveAttribute('data-owner', 'consumer');
    expect(root).toHaveStyle({width: '321px'});
    fireEvent.click(root);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects compact layout on the root and preserves slot order', () => {
    render(
      <EmptyState
        title="No results"
        description="Try again."
        icon={<span data-testid="icon">Icon</span>}
        actions={<button type="button">Retry</button>}
        isCompact
        data-testid="empty-state"
      />,
    );

    const root = screen.getByTestId('empty-state');
    expect(root).toHaveAttribute('data-variant', 'compact');
    expect(root.children).toHaveLength(3);
    expect(root.children[0]).toContainElement(screen.getByTestId('icon'));
    expect(root.children[1]).toContainElement(
      screen.getByRole('heading', {name: 'No results'}),
    );
    expect(root.children[2]).toContainElement(
      screen.getByRole('button', {name: 'Retry'}),
    );
  });

  it('renders all slots together', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">🔍</span>}
        title="No results found"
        description="Try a different search term."
        actions={
          <>
            <button type="button">Clear filters</button>
            <button type="button">Go back</button>
          </>
        }
        data-testid="full-empty-state"
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(
      screen.getByText('Try a different search term.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
    expect(screen.getByText('Go back')).toBeInTheDocument();
  });

  describe('theming targets', () => {
    it('puts astryx-empty-state-title on the title heading', () => {
      render(<EmptyState title="No results" />);
      const heading = screen.getByRole('heading', {name: 'No results'});
      expect(heading).toHaveClass('astryx-empty-state-title');
    });

    it('puts astryx-empty-state-description on the description', () => {
      render(
        <EmptyState title="No results" description="Try another search." />,
      );
      const description = screen.getByText('Try another search.');
      expect(description).toHaveClass('astryx-empty-state-description');
    });

    it('reflects the compact variant on the title and description targets', () => {
      render(
        <EmptyState
          title="No results"
          description="Try another search."
          isCompact
        />,
      );
      expect(screen.getByRole('heading', {name: 'No results'})).toHaveAttribute(
        'data-variant',
        'compact',
      );
      expect(screen.getByText('Try another search.')).toHaveAttribute(
        'data-variant',
        'compact',
      );
    });

    it('exposes the title and description as themeable defineTheme targets', () => {
      // jsdom can't resolve the @layer cascade, so this asserts the targets are
      // reachable by a theme via the sanctioned defineTheme channel — replacing
      // the structural `> div:has(> :is(h1..h6))` heading-detection selectors a
      // consumer would otherwise need to restyle the title and description.
      const theme = defineTheme({
        name: 'empty-state-target-test',
        components: {
          'empty-state-title': {
            base: {fontSize: 'var(--text-large-size)'},
          },
          'empty-state-description': {
            base: {color: 'var(--color-text-secondary)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-empty-state-title');
      expect(css).toContain('.astryx-empty-state-description');
    });
  });
});
