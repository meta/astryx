// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableRef.test.tsx
 * @input vitest (jsdom), Testing Library, the configuration-object
 *   useResizable over a stand-in createResizable
 * @output Checks that useResizable(config) builds on createResizable
 *   (architecture:public-component-api INV22): it creates one factory with no
 *   handle, so the region's state has one copy, passes later options through
 *   update(), destroys it on unmount, and returns what the factory reports
 * @position Unit tests for the configuration-object signature of
 *   useResizable.ts
 */

import {act, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type * as CreateResizableModule from './createResizable';
import type {
  CreateResizableOptions,
  ResizableController,
} from './createResizable';
import type {ResizableRegion, UseResizableSingleConfig} from './useResizable';

interface FakeController extends ResizableController {
  emit(): void;
  setState(next: {size?: number; isCollapsed?: boolean}): void;
}

const created: {
  element: HTMLElement | null;
  options: CreateResizableOptions;
}[] = [];
let fake: FakeController;

vi.mock('./createResizable', async importOriginal => {
  const original = await importOriginal<typeof CreateResizableModule>();
  return {
    ...original,
    createResizable: vi.fn(
      (element: HTMLElement | null, options: CreateResizableOptions = {}) => {
        created.push({element, options});
        const listeners = new Set<() => void>();
        let state = {size: 123, isCollapsed: false};
        fake = {
          get size() {
            return state.size;
          },
          get isCollapsed() {
            return state.isCollapsed;
          },
          collapse: vi.fn(),
          expand: vi.fn(),
          resize: vi.fn(),
          update: vi.fn(),
          destroy: vi.fn(),
          subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          emit: () => {
            for (const listener of listeners) {
              listener();
            }
          },
          setState: next => {
            state = {...state, ...next};
          },
        };
        return fake;
      },
    ),
  };
});

const {useResizable} = await import('./useResizable');

afterEach(() => {
  created.length = 0;
});

function ConfigSplit({
  config,
  onRegion,
}: {
  config: UseResizableSingleConfig;
  onRegion: (region: ResizableRegion) => void;
}) {
  const region = useResizable(config);
  onRegion(region);
  return <div data-testid="pane" style={{width: region.size}} />;
}

describe('useResizable(config) builds on createResizable too, so the region state has one copy (spec:AST-107 FR6; architecture:public-component-api INV22)', () => {
  it('creates one factory, with no handle, from the configuration, updates it, and destroys it on unmount', () => {
    const first: UseResizableSingleConfig = {
      defaultSize: 200,
      minSize: 100,
      collapsible: true,
    };
    const view = render(<ConfigSplit config={first} onRegion={() => {}} />);
    expect(created).toHaveLength(1);
    expect(created[0].element).toBeNull();
    expect(created[0].options).toMatchObject(first);

    const second: UseResizableSingleConfig = {
      defaultSize: 200,
      minSize: 150,
      collapsible: true,
    };
    view.rerender(<ConfigSplit config={second} onRegion={() => {}} />);
    expect(created).toHaveLength(1);
    expect(fake.update).toHaveBeenLastCalledWith(
      expect.objectContaining(second),
    );

    view.unmount();
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns what the factory reports, in its size, collapse state and props, and its methods call the factory', () => {
    let region: ResizableRegion | undefined;
    render(
      <ConfigSplit
        config={{defaultSize: 200, collapsible: true}}
        onRegion={next => {
          region = next;
        }}
      />,
    );
    expect(region?.size).toBe(123);
    expect(region?.props._size).toBe(123);
    act(() => {
      fake.setState({size: 0, isCollapsed: true});
      fake.emit();
    });
    expect(region?.isCollapsed).toBe(true);
    expect(region?.props._isCollapsed).toBe(true);
    expect(region?.props._size).toBe(0);
    region?.collapse();
    region?.expand();
    region?.resize(250);
    expect(fake.collapse).toHaveBeenCalledTimes(1);
    expect(fake.expand).toHaveBeenCalledTimes(1);
    expect(fake.resize).toHaveBeenCalledWith(250);
  });
});
