// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableRef.test.tsx
 * @input vitest (jsdom), Testing Library, useResizable in both forms over a
 *   stand-in createResizable
 * @output Checks that useResizable only delegates to createResizable
 *   (spec:AST-107 FR6; architecture:public-component-api INV22): the
 *   ref-taking form creates the factory on the element, and the
 *   configuration-object form creates one with no handle, so the region's
 *   state has one copy; each passes later options through update(), destroys
 *   it on unmount, and returns what the factory reports
 * @position Unit tests for both signatures of useResizable.ts
 */

import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type * as CreateResizableModule from './createResizable';
import type {
  CreateResizableOptions,
  ResizableController,
} from './createResizable';
import type {
  ResizableRegion,
  UseResizableResult,
  UseResizableSingleConfig,
} from './useResizable';

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
type Region = UseResizableResult;

afterEach(() => {
  created.length = 0;
});

function Split({
  options,
  onRegion,
}: {
  options: CreateResizableOptions;
  onRegion: (region: Region) => void;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const region = useResizable(handleRef, options);
  onRegion(region);
  return <div ref={handleRef} data-testid="handle" />;
}

describe('useResizable(ref, options) only delegates to createResizable (spec:AST-107 FR6)', () => {
  it('creates the factory on the element with the options it was given, updates it, and destroys it on unmount', () => {
    const first: CreateResizableOptions = {defaultSize: 200, minSize: 100};
    const view = render(<Split options={first} onRegion={() => {}} />);
    expect(created).toHaveLength(1);
    expect(created[0].element).toBe(view.getByTestId('handle'));
    expect(created[0].options).toBe(first);

    const second: CreateResizableOptions = {defaultSize: 200, minSize: 150};
    view.rerender(<Split options={second} onRegion={() => {}} />);
    expect(created).toHaveLength(1);
    expect(fake.update).toHaveBeenLastCalledWith(second);

    view.unmount();
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns what the factory reports, and its methods call the factory', () => {
    let region: Region | undefined;
    render(
      <Split
        options={{defaultSize: 200}}
        onRegion={next => {
          region = next;
        }}
      />,
    );
    expect(region?.size).toBe(123);
    act(() => {
      fake.setState({size: 321, isCollapsed: true});
      fake.emit();
    });
    expect(region?.size).toBe(321);
    expect(region?.isCollapsed).toBe(true);
    region?.collapse();
    region?.expand();
    region?.resize(250);
    expect(fake.collapse).toHaveBeenCalledTimes(1);
    expect(fake.expand).toHaveBeenCalledTimes(1);
    expect(fake.resize).toHaveBeenCalledWith(250);
  });
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
