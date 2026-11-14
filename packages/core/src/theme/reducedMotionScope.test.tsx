// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionScope.test.tsx
 * @input vitest (jsdom), React Testing Library, react-dom/server, Theme,
 *   defineTheme, reducedMotionScope, reducesMotion and useReducesMotion
 * @output Checks that a theme's `reducedMotion: 'always'` mark carries the
 *   reducedMotionScope marker, so a style keyed on the mark matches: under the
 *   wrapper (in a server render too) and, for the root theme, in layers
 *   portaled to `<body>`, since `<html>` carries both; and that script readers
 *   see the mark with the person's setting off, through an element's ancestry
 *   or, in a hook that holds no element, through the theme tree
 *
 * @position Testing; validates Theme.tsx's marker, motion/reducedMotion.ts's
 *   reducesMotion and hooks/useReducesMotion.ts
 */

import * as stylex from '@stylexjs/stylex';
import type {ReactElement, ReactNode} from 'react';
import {cleanup, render, renderHook, screen} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {renderToString} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useReducesMotion} from '../hooks/useReducesMotion';
import {reducesMotion} from '../motion/reducedMotion';
import {defineTheme} from './defineTheme';
import {ALWAYS_TEMPO} from './reducedMotionAlways.testing';
import {reducedMotionScope} from './reducedMotion.markers.stylex';
import {Theme} from './Theme';

// No public theme can set reducedMotion yet: a theme with ALWAYS_TEMPO
// resolves to 'always' through this mock.
vi.mock('./themeMotion', async importOriginal => {
  const {resolvingAlways} = await import('./reducedMotionAlways.testing');
  return resolvingAlways(await importOriginal());
});

const MARK = 'data-astryx-reduced-motion';
const SCOPE = stylex.props(reducedMotionScope).className ?? '';

const always = defineTheme({
  name: 'ScopeAlways',
  motion: {tempo: ALWAYS_TEMPO},
});
const system = defineTheme({name: 'ScopeSystem', motion: {tempo: 1.2}});

/** A style keyed on the mark, as a component's Reduce Motion twin is. */
const probeStyles = stylex.create({
  value: {
    '--x1-probe': {
      default: 'off',
      [stylex.when.ancestor(
        '[data-astryx-reduced-motion]',
        reducedMotionScope,
      )]: 'on',
    },
  },
});

/** The person's Reduce Motion setting, through `matchMedia`. */
function setting(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
}

function Probe({testId}: {testId: string}) {
  return <span data-testid={testId} {...stylex.props(probeStyles.value)} />;
}

function PortaledProbe({testId}: {testId: string}) {
  return createPortal(<Probe testId={testId} />, document.body);
}

function probeValue(testId: string): string {
  return getComputedStyle(screen.getByTestId(testId))
    .getPropertyValue('--x1-probe')
    .trim();
}

function parse(markup: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = markup;
  return container;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(MARK);
  document.documentElement.classList.remove(
    ...SCOPE.split(' ').filter(Boolean),
  );
});

describe("the reduced-motion mark's marker", () => {
  it('is a class of its own', () => {
    expect(SCOPE).toMatch(/^\S+$/);
  });

  it('a server render puts it on the marked wrapper, beside the mark', () => {
    const marked = parse(
      renderToString(
        <Theme theme={always}>
          <p>content</p>
        </Theme>,
      ),
    ).querySelector(`[${MARK}]`);
    expect(marked?.classList.contains(SCOPE)).toBe(true);

    const plain = parse(
      renderToString(
        <Theme theme={system}>
          <p>content</p>
        </Theme>,
      ),
    );
    expect(plain.querySelector(`.${SCOPE}`)).toBeNull();
  });

  it('the root theme puts it on <html> with the mark, and takes both away with the theme', () => {
    const {unmount} = render(
      <Theme theme={always}>
        <p>content</p>
      </Theme>,
    );
    expect(document.documentElement.hasAttribute(MARK)).toBe(true);
    expect(document.documentElement.classList.contains(SCOPE)).toBe(true);

    unmount();
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
  });

  it("'system' puts it nowhere", () => {
    render(
      <Theme theme={system}>
        <p data-testid="inside">content</p>
      </Theme>,
    );
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
    expect(screen.getByTestId('inside').closest(`.${SCOPE}`)).toBeNull();
  });

  it('a nested theme puts it on its own wrapper, not on <html>', () => {
    render(
      <Theme theme={system}>
        <Theme theme={always}>
          <p data-testid="inside">content</p>
        </Theme>
      </Theme>,
    );
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
    expect(screen.getByTestId('inside').closest(`.${SCOPE}`)).not.toBeNull();
  });

  it('a style keyed on the mark applies in the tree and in a layer portaled to <body>, with the setting off', () => {
    setting(false);
    const {unmount} = render(
      <Theme theme={always}>
        <Probe testId="in-tree" />
        <PortaledProbe testId="portaled" />
      </Theme>,
    );
    expect(probeValue('in-tree')).toBe('on');
    expect(probeValue('portaled')).toBe('on');
    unmount();

    render(
      <Theme theme={system}>
        <Probe testId="in-tree" />
        <PortaledProbe testId="portaled" />
      </Theme>,
    );
    expect(probeValue('in-tree')).toBe('off');
    expect(probeValue('portaled')).toBe('off');
  });
});

describe('script readers see the mark', () => {
  it("reducesMotion reads an element's theme mark with the setting off", () => {
    setting(false);
    render(
      <Theme theme={system}>
        <p data-testid="plain">content</p>
        <Theme theme={always}>
          <p data-testid="marked">content</p>
        </Theme>
      </Theme>,
    );
    expect(reducesMotion(screen.getByTestId('marked'))).toBe(true);
    expect(reducesMotion(screen.getByTestId('plain'))).toBe(false);
  });

  it('reducesMotion reads the setting, with or without an element', () => {
    setting(true);
    expect(reducesMotion(null)).toBe(true);
    setting(false);
    expect(reducesMotion(null)).toBe(false);
  });

  it('useReducesMotion reads the theme tree: an always theme, or any theme inside one', () => {
    setting(false);
    const inAlways = ({children}: {children: ReactNode}): ReactElement => (
      <Theme theme={always}>{children}</Theme>
    );
    const inSystemInAlways = ({
      children,
    }: {
      children: ReactNode;
    }): ReactElement => (
      <Theme theme={always}>
        <Theme theme={system}>{children}</Theme>
      </Theme>
    );
    const inSystem = ({children}: {children: ReactNode}): ReactElement => (
      <Theme theme={system}>{children}</Theme>
    );
    expect(
      renderHook(() => useReducesMotion(), {wrapper: inAlways}).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useReducesMotion(), {wrapper: inSystemInAlways}).result
        .current,
    ).toBe(true);
    expect(
      renderHook(() => useReducesMotion(), {wrapper: inSystem}).result.current,
    ).toBe(false);
  });

  it('useReducesMotion reads the setting outside any theme', () => {
    setting(true);
    expect(renderHook(() => useReducesMotion()).result.current).toBe(true);
  });
});
