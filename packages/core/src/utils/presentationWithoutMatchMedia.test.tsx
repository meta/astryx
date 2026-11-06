// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentationWithoutMatchMedia.test.tsx
 * @input vitest, React Testing Library, ContextMenu, DropdownMenu and
 *   Popover, and a window with no matchMedia, as in a plain test DOM
 * @output Components that resolve a presentation render their default
 *   surface where the window has no matchMedia, and do not throw
 * @position Unit tests of utils/presentation.ts,
 *   hooks/useAdaptivePresentation.ts and Popover's own resolver
 */

import {render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ContextMenu} from '../ContextMenu/ContextMenu';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {Popover} from '../Popover/Popover';

beforeEach(() => {
  // The shared test setup gives jsdom a matchMedia. An app's test DOM may
  // have none.
  vi.stubGlobal('matchMedia', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a window with no matchMedia', () => {
  it('renders an adaptive ContextMenu around its target', () => {
    render(
      <ContextMenu presentation="adaptive" items={[{label: 'Item 1'}]}>
        <div>Target</div>
      </ContextMenu>,
    );
    expect(screen.getByText('Target')).toBeTruthy();
  });

  it('renders an adaptive DropdownMenu with its button', () => {
    render(
      <DropdownMenu
        presentation="adaptive"
        button={{label: 'Actions'}}
        items={[{label: 'Item 1'}]}
      />,
    );
    expect(screen.getByRole('button', {name: 'Actions'})).toBeTruthy();
  });

  it('renders an adaptive Popover with its trigger', () => {
    render(
      <Popover
        presentation="adaptive"
        content={<span>Content</span>}
        label="Details">
        <button type="button">Open</button>
      </Popover>,
    );
    expect(screen.getByRole('button', {name: 'Open'})).toBeTruthy();
  });
});
