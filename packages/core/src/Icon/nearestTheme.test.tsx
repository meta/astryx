// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nearestTheme.test.tsx
 * @input Theme providers, icon reads, slot rendering, and React server rendering
 * @output Regression coverage for provider-bound icon and slot resolution
 * @position Testing; checks theme identity across nesting and descendant updates
 */

import {useState} from 'react';
import {renderToString} from 'react-dom/server';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {resetThemes} from '../theme/themeRegistry';
import {useTheme} from '../theme/useTheme';
import {ComponentIcon} from './ComponentIcon';
import {Icon} from './Icon';
import {useIcon} from './useIcon';

function makeTheme(marker: 'outer' | 'inner') {
  return defineTheme({
    name: 'nearest-icons',
    tokens: {'--color-accent': marker === 'outer' ? '#123456' : '#654321'},
    icons: {
      info: ({size}) => `${marker}-info-${size}`,
      copy: ({size}) => `${marker}-copy-${size}`,
      clock: ({size}) => `${marker}-clock-${size}`,
    },
    componentIcons: {
      'code-block-copy': ({copied}) => ({
        icon: copied && marker === 'inner' ? 'clock' : 'copy',
      }),
    },
  });
}

function Readers() {
  return (
    <>
      <span data-reader="icon">
        <Icon icon="info" size="lg" />
      </span>
      <span data-reader="hook">{useIcon('info')}</span>
      <span data-reader="slot">
        <ComponentIcon
          slot="code-block-copy"
          state={{copied: true}}
          fallback={{icon: 'copy', size: 'sm'}}
        />
      </span>
    </>
  );
}

function readerValues(container: ParentNode) {
  return [...container.querySelectorAll('[data-reader]')].map(
    element => element.textContent,
  );
}

const outerValues = ['outer-info-lg', 'outer-info-md', 'outer-copy-sm'];
const innerValues = ['inner-info-lg', 'inner-info-md', 'inner-clock-sm'];

afterEach(() => {
  cleanup();
  resetThemes();
  document.documentElement.removeAttribute('data-astryx-theme');
});

describe('nearest theme icon resolution', () => {
  it('keeps same-name nested provider icons on their nearest theme through server rendering and hydration', async () => {
    const outer = makeTheme('outer');
    const inner = makeTheme('inner');
    const tree = (
      <Theme theme={outer} mode="light">
        <Readers />
        <Theme theme={inner} mode="light">
          <Readers />
        </Theme>
        <Readers />
      </Theme>
    );
    const server = new DOMParser().parseFromString(
      renderToString(tree),
      'text/html',
    );
    const container = document.createElement('div');
    container.append(...server.body.childNodes);
    const expected = [...outerValues, ...innerValues, ...outerValues];
    expect(readerValues(container)).toEqual(expected);

    const onRecoverableError = vi.fn();
    await act(async () => {
      render(tree, {container, hydrate: true, onRecoverableError});
    });
    expect(readerValues(container)).toEqual(expected);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it('keeps provider icons when an unused same-name theme is registered and only a descendant updates', () => {
    const outer = makeTheme('outer');
    function Descendant() {
      const [count, setCount] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setCount(count + 1)}>
            Update {count}
          </button>
          <span data-testid="token">{useTheme().token('--color-accent')}</span>
          <Readers />
        </>
      );
    }
    const {container} = render(
      <Theme theme={outer} mode="light">
        <Descendant />
      </Theme>,
    );
    expect(readerValues(container)).toEqual(outerValues);

    makeTheme('inner');
    fireEvent.click(screen.getByRole('button', {name: 'Update 0'}));

    expect(screen.getByRole('button', {name: 'Update 1'})).toBeInTheDocument();
    expect(screen.getByTestId('token')).toHaveTextContent('#123456');
    expect(readerValues(container)).toEqual(outerValues);
  });
});
