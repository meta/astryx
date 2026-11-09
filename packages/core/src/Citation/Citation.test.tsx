// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Citation.test.tsx
 * @input Uses React Testing Library, Citation, theme tokens
 * @output Tests for Citation component
 */

import {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import {describe, it, expect} from 'vitest';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {Citation} from './Citation';

// StyleX emits one deterministic atomic class per property/value pair, so an
// element carries a probe's class exactly when it has the same declaration.
// The dev-mode debug class (contains "__") varies by source location and is
// excluded from the comparison.
const probe = stylex.create({
  secondaryText: {color: colorVars['--color-text-secondary']},
  accentText: {color: colorVars['--color-text-accent']},
  badgeBackground: {backgroundColor: colorVars['--color-accent-muted']},
  consumerOverride: {color: colorVars['--color-text-accent']},
  pointerCursor: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

function atomicClasses(style: (typeof probe)[keyof typeof probe]): string[] {
  const {className = ''} = stylex.props(style);
  return className.split(' ').filter(c => c !== '' && !c.includes('__'));
}

describe('Citation', () => {
  const source = {title: 'Example Source', url: 'https://example.com'};

  it.each([
    'javascript:alert(1)',
    'vbscript:MsgBox(1)',
    'data:text/html,<b>x</b>',
    'java\nscript:alert(1)',
  ])('renders rejected citation URL %s without navigation', url => {
    const {container} = render(
      <>
        <Citation source={{title: 'Source', url}} number={1} />
        <Citation source={{title: 'Source', url}} number={1} variant="number" />
      </>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.textContent).toBe('Source1');
  });

  it('renders the source title as a link in the label variant', () => {
    render(<Citation source={source} number={1} data-testid="citation" />);
    const el = screen.getByTestId('citation');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', 'https://example.com');
    expect(el).toHaveAttribute('target', '_blank');
    expect(el).toHaveAttribute('rel', 'noopener noreferrer');
    expect(el).toHaveAttribute('role', 'doc-noteref');
    expect(el).toHaveAttribute('aria-label', 'Citation 1: Example Source');
    expect(el).toHaveTextContent('Example Source');
  });

  it('renders the index as a badge in the number variant', () => {
    render(
      <Citation
        source={source}
        number={3}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    expect(el).toHaveTextContent('3');
    expect(el).toHaveAttribute('role', 'doc-noteref');
    expect(el).toHaveAttribute('aria-label', 'Citation 3: Example Source');
  });

  it('renders as a span when the source has no url', () => {
    render(
      <Citation
        source={{title: 'No link'}}
        number={1}
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    expect(el.tagName).toBe('SPAN');
    // `doc-noteref` is a link role and must be omitted on an inert span. A
    // supported naming role still lets the component-authored aria-label name
    // the inert citation, including the number-only variant.
    expect(el).toHaveAttribute('role', 'group');
    expect(el).toHaveAccessibleName('Citation 1: No link');
    expect(el).not.toHaveAttribute('href');
    expect(el).not.toHaveAttribute('target');
    expect(el).not.toHaveAttribute('rel');
  });

  it('names an inert number-only citation', () => {
    render(
      <Citation
        source={{title: 'No link'}}
        number={5}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    expect(el).toHaveAttribute('role', 'group');
    expect(el).toHaveAccessibleName('Citation 5: No link');
    expect(el).not.toHaveAttribute('href');
  });

  it('forwards the ref and supported root props across linked and inert roots', () => {
    const ref = createRef<HTMLElement>();
    const rootProps = {
      ref,
      className: 'consumer-class',
      style: {opacity: 0.5},
      xstyle: probe.consumerOverride,
      role: 'button',
      'aria-label': 'Caller label',
      'data-owner': 'citation-consumer',
      'data-testid': 'citation',
    } as const;
    const {rerender} = render(
      <Citation source={source} number={1} {...rootProps} />,
    );

    let el = screen.getByTestId('citation');
    expect(el.tagName).toBe('A');
    expect(ref.current).toBe(el);
    expect(el).toHaveAttribute('role', 'doc-noteref');
    expect(el).toHaveAccessibleName('Citation 1: Example Source');
    expect(el).toHaveClass('consumer-class');
    expect(el).toHaveStyle({opacity: 0.5});
    expect(el).toHaveAttribute('data-owner', 'citation-consumer');
    for (const cls of atomicClasses(probe.consumerOverride)) {
      expect(el.classList.contains(cls)).toBe(true);
    }

    rerender(
      <Citation source={{title: 'No link'}} number={1} {...rootProps} />,
    );
    el = screen.getByTestId('citation');
    expect(el.tagName).toBe('SPAN');
    expect(ref.current).toBe(el);
    expect(el).toHaveAttribute('role', 'group');
    expect(el).toHaveAccessibleName('Citation 1: No link');
    expect(el).toHaveClass('consumer-class');
    expect(el).toHaveStyle({opacity: 0.5});
    expect(el).toHaveAttribute('data-owner', 'citation-consumer');
    for (const cls of atomicClasses(probe.consumerOverride)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('renders astryx-* class names for theme targeting', () => {
    render(<Citation source={source} number={1} data-testid="citation" />);
    expect(screen.getByTestId('citation').className).toContain(
      'astryx-citation',
    );
  });

  it('uses the secondary text color in the label variant', () => {
    render(<Citation source={source} number={1} data-testid="citation" />);
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.secondaryText)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('uses the secondary text color, not accent, in the number variant', () => {
    render(
      <Citation
        source={source}
        number={1}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.secondaryText)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
    for (const cls of atomicClasses(probe.accentText)) {
      expect(el.classList.contains(cls)).toBe(false);
    }
  });

  it('keeps the accent-muted badge background when the source has a url', () => {
    // `numberHover` must not clobber the base background: a hover-only
    // conditional without a default replaces the whole property on merge,
    // leaving linked badges with a transparent pill.
    render(
      <Citation
        source={source}
        number={1}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.badgeBackground)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  // The interactive (pointer) treatment is keyed on `source.url`: a citation
  // with no url is non-interactive and must keep the default cursor.
  const noUrlSource = {title: 'No link'};

  it('does not use the pointer cursor without a url in the label variant', () => {
    render(<Citation source={noUrlSource} number={1} data-testid="citation" />);
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.pointerCursor)) {
      expect(el.classList.contains(cls)).toBe(false);
    }
  });

  it('uses the pointer cursor with a url in the label variant', () => {
    render(<Citation source={source} number={1} data-testid="citation" />);
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.pointerCursor)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('does not use the pointer cursor without a url in the number variant', () => {
    render(
      <Citation
        source={noUrlSource}
        number={1}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.pointerCursor)) {
      expect(el.classList.contains(cls)).toBe(false);
    }
  });

  it('uses the pointer cursor with a url in the number variant', () => {
    render(
      <Citation
        source={source}
        number={1}
        variant="number"
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    for (const cls of atomicClasses(probe.pointerCursor)) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  // --- Source icon: image URL (back-compat) vs ReactNode ---------------------

  it('renders a legacy string icon as a decorative image (back-compat)', () => {
    // Existing callers pass a favicon URL to `source.icon`. A bare string must
    // still render as <img src>, unchanged from the original behavior.
    const {container} = render(
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          icon: 'https://example.com/favicon.png',
        }}
        number={1}
        data-testid="citation"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/favicon.png');
    // Decorative: empty alt, and the wrapper is aria-hidden.
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('[aria-hidden="true"] img')).toBe(img);
  });

  it('renders source.src as a decorative image', () => {
    const {container} = render(
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          src: 'https://example.com/logo.png',
        }}
        number={1}
        data-testid="citation"
      />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png');
    expect(img).toHaveAttribute('alt', '');
  });

  it('renders a ReactNode icon as-is (not an <img>)', () => {
    const {container} = render(
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          icon: <svg data-testid="custom-icon" />,
        }}
        number={1}
        data-testid="citation"
      />,
    );
    // The node renders directly; no <img> is produced for a node icon.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    // Still decorative — wrapped in an aria-hidden container.
    expect(
      container.querySelector(
        '[aria-hidden="true"] [data-testid="custom-icon"]',
      ),
    ).not.toBeNull();
  });

  it('prefers a node icon over src when both are provided', () => {
    const {container} = render(
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          src: 'https://example.com/logo.png',
          icon: <svg data-testid="custom-icon" />,
        }}
        number={1}
        data-testid="citation"
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps aria-label as the sole accessible name when an icon is present', () => {
    render(
      <Citation
        source={{
          title: 'GitHub',
          url: 'https://github.com',
          icon: 'https://example.com/favicon.png',
        }}
        number={2}
        data-testid="citation"
      />,
    );
    const el = screen.getByTestId('citation');
    expect(el).toHaveAttribute('aria-label', 'Citation 2: GitHub');
  });
});
