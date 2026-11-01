// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ResizeHandleOnFactory.test.tsx
 * @input vitest (jsdom), Testing Library, ResizeHandle and a plain element
 *   driven by the ref-taking useResizable over the real createResizable
 * @output Checks that ResizeHandle goes through createResizable
 *   (component:Resizable FR3; spec:AST-107 FR6): it renders the separator of
 *   the region useResizable(handleRef, options) attached to it and forwards
 *   its pointer, keyboard and double-click input to the factory, a caller's
 *   onKeyDown still runs first (FR7), an unmount mid-drag ends the drag, it
 *   works under StrictMode, a plain element gets the factory's own
 *   attributes, and a `resizable` prop with a bound region warns. A handle a
 *   child mounts, or hides and shows in its own `<Activity>`, is bound at
 *   once, and the region keeps its size across an `<Activity>` that hides the
 *   hook's own component
 * @position Integration tests for ResizeHandle.tsx, useResizable.ts and
 *   createResizable.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Activity, StrictMode, useRef, useState, type RefObject} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createResizable,
  type CreateResizableOptions,
  type ResizableController,
} from './createResizable';
import {ResizeHandle} from './ResizeHandle';
import {useResizable, type UseResizableResult} from './useResizable';

function Split({
  options,
  onKeyDown,
  showHandle = true,
}: {
  options: CreateResizableOptions;
  onKeyDown?: (size: number) => void;
  showHandle?: boolean;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const region = useResizable(handleRef, options);
  return (
    <>
      <output data-testid="size">{region.size}</output>
      <output data-testid="collapsed">{String(region.isCollapsed)}</output>
      {showHandle && (
        <ResizeHandle
          ref={handleRef}
          label="Sidebar width"
          onKeyDown={() => onKeyDown?.(region.size)}
        />
      )}
    </>
  );
}

const size = () => Number(screen.getByTestId('size').textContent);
const separator = () => screen.getByRole('separator');
/** The grab zone, which takes the pointer. */
const grabZone = () => separator().firstElementChild as HTMLElement;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  vi.restoreAllMocks();
});

describe('ResizeHandle on a useResizable(handleRef) region (component:Resizable FR3)', () => {
  it('renders the separator of the region and resizes it from the keyboard', () => {
    render(<Split options={{defaultSize: 200, minSize: 100, maxSize: 400}} />);
    expect(separator()).toHaveAttribute('aria-label', 'Sidebar width');
    expect(separator()).toHaveAttribute('aria-valuenow', '200');
    expect(separator()).toHaveAttribute('aria-valuemin', '100');
    expect(separator()).toHaveAttribute('aria-valuemax', '400');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(210);
    expect(separator()).toHaveAttribute('aria-valuenow', '210');
    fireEvent.keyDown(separator(), {key: 'End'});
    expect(size()).toBe(400);
  });

  it('resizes on a drag of its grab zone, and shows the drag while it lasts', () => {
    render(<Split options={{defaultSize: 200, maxSize: 400}} />);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 0});
    expect(separator()).toHaveAttribute('data-resizing');
    expect(document.body.style.cursor).toBe('col-resize');
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 40});
    expect(size()).toBe(240);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 40});
    expect(separator()).not.toHaveAttribute('data-resizing');
    expect(document.body.style.cursor).toBe('');
  });

  it('applies its own isReversed to the region it renders', () => {
    function Reversed() {
      const handleRef = useRef<HTMLDivElement>(null);
      const region = useResizable(handleRef, {defaultSize: 200});
      return (
        <>
          <output data-testid="size">{region.size}</output>
          <ResizeHandle ref={handleRef} isReversed />
        </>
      );
    }
    render(<Reversed />);
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(190);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 100});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 80});
    expect(size()).toBe(210);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 80});
  });

  it('is disabled by its own isDisabled or by the region option', () => {
    function Disabled({
      handleIsDisabled,
      optionIsDisabled,
    }: {
      handleIsDisabled: boolean;
      optionIsDisabled: boolean;
    }) {
      const handleRef = useRef<HTMLDivElement>(null);
      const region = useResizable(handleRef, {
        defaultSize: 200,
        isDisabled: optionIsDisabled,
      });
      return (
        <>
          <output data-testid="size">{region.size}</output>
          <ResizeHandle ref={handleRef} isDisabled={handleIsDisabled} />
        </>
      );
    }
    const view = render(<Disabled handleIsDisabled optionIsDisabled={false} />);
    expect(separator()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(200);
    view.rerender(<Disabled handleIsDisabled={false} optionIsDisabled />);
    expect(separator()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(200);
    view.rerender(
      <Disabled handleIsDisabled={false} optionIsDisabled={false} />,
    );
    expect(separator()).not.toHaveAttribute('aria-disabled');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(210);
  });

  it('runs a caller onKeyDown before its own key handling (FR7)', () => {
    const onKeyDown = vi.fn();
    render(<Split options={{defaultSize: 200}} onKeyDown={onKeyDown} />);
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(onKeyDown).toHaveBeenCalledWith(200);
    expect(size()).toBe(210);
  });

  it('collapses on Enter and on a double-click, and says so', () => {
    render(<Split options={{defaultSize: 200, collapsible: true}} />);
    fireEvent.keyDown(separator(), {key: 'Enter'});
    expect(screen.getByTestId('collapsed')).toHaveTextContent('true');
    expect(separator()).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.doubleClick(separator());
    expect(screen.getByTestId('collapsed')).toHaveTextContent('false');
    expect(size()).toBe(200);
  });

  it('adds no listener of the factory to the element it renders', () => {
    const added = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    render(<Split options={{defaultSize: 200}} />);
    const separatorCalls = added.mock.contexts.filter(
      context => context === separator() || context === grabZone(),
    );
    expect(separatorCalls).toEqual([]);
  });

  it('ends a drag when the handle unmounts mid-drag: the cursor is released, the size it reached is kept, and a new handle starts there', () => {
    function Toggle() {
      const [isShown, setIsShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsShown(false)}>
            hide
          </button>
          <button type="button" onClick={() => setIsShown(true)}>
            show
          </button>
          <Split
            options={{defaultSize: 200, autoSaveId: 'mid-drag'}}
            showHandle={isShown}
          />
        </>
      );
    }
    render(<Toggle />);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 0});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 30});
    act(() => {
      screen.getByRole('button', {name: 'hide'}).click();
    });
    expect(document.body.style.cursor).toBe('');
    expect(size()).toBe(230);
    expect(
      JSON.parse(localStorage.getItem('astryx-resizable:mid-drag') ?? ''),
    ).toEqual({size: 230, isCollapsed: false});
    act(() => {
      screen.getByRole('button', {name: 'show'}).click();
    });
    expect(separator()).toHaveAttribute('aria-valuenow', '230');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(240);
  });

  it('keeps a region without a handle answering collapse, and a new handle starts collapsed', () => {
    let region: ReturnType<typeof useResizableRegion> | undefined;
    function useResizableRegion(handleRef: {current: HTMLDivElement | null}) {
      return useResizable(handleRef, {defaultSize: 200, collapsible: true});
    }
    function Toggle() {
      const handleRef = useRef<HTMLDivElement>(null);
      const [isShown, setIsShown] = useState(true);
      region = useResizableRegion(handleRef);
      return (
        <>
          <button type="button" onClick={() => setIsShown(!isShown)}>
            toggle
          </button>
          {isShown && <ResizeHandle ref={handleRef} />}
        </>
      );
    }
    render(<Toggle />);
    act(() => {
      screen.getByRole('button', {name: 'toggle'}).click();
    });
    act(() => {
      region?.collapse();
    });
    expect(region?.isCollapsed).toBe(true);
    act(() => {
      screen.getByRole('button', {name: 'toggle'}).click();
    });
    expect(separator()).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator(), {key: 'Enter'});
    expect(region?.isCollapsed).toBe(false);
    expect(region?.size).toBe(200);
  });

  it('works under StrictMode, and an unmount leaves no drag behind', () => {
    const view = render(
      <StrictMode>
        <Split options={{defaultSize: 200}} />
      </StrictMode>,
    );
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(210);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 0});
    view.unmount();
    expect(document.body.style.cursor).toBe('');
  });

  it('warns when it has a `resizable` prop and a useResizable(handleRef) region at once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Both() {
      const handleRef = useRef<HTMLDivElement>(null);
      useResizable(handleRef, {defaultSize: 200});
      const legacy = useResizable({defaultSize: 300});
      return <ResizeHandle ref={handleRef} resizable={legacy.props} />;
    }
    render(<Both />);
    expect(warn).toHaveBeenCalledWith(
      'ResizeHandle: has a `resizable` prop and a useResizable(handleRef) ' +
        'region at once. The `resizable` prop wins; pass one of them.',
    );
    // The prop's region is the one it renders.
    expect(separator()).toHaveAttribute('aria-valuenow', '300');
  });
});

describe('useResizable(handleRef) before its handle renders', () => {
  it('answers collapse, and the handle that renders later starts collapsed', () => {
    let region: UseResizableResult | undefined;
    function Late() {
      const handleRef = useRef<HTMLDivElement>(null);
      const [isShown, setIsShown] = useState(false);
      region = useResizable(handleRef, {defaultSize: 200, collapsible: true});
      return (
        <>
          <button type="button" onClick={() => setIsShown(true)}>
            show
          </button>
          {isShown && <ResizeHandle ref={handleRef} />}
        </>
      );
    }
    render(<Late />);
    expect(screen.queryByRole('separator')).toBeNull();
    act(() => {
      region?.collapse();
    });
    expect(region?.isCollapsed).toBe(true);
    act(() => {
      screen.getByRole('button', {name: 'show'}).click();
    });
    expect(separator()).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator(), {key: 'Enter'});
    expect(region?.isCollapsed).toBe(false);
    expect(region?.size).toBe(200);
  });
});

describe('useResizable(handleRef) on a plain element', () => {
  it('gives the element the factory own attributes and input', () => {
    function Plain() {
      const handleRef = useRef<HTMLDivElement>(null);
      const region = useResizable(handleRef, {defaultSize: 200});
      return (
        <>
          <output data-testid="size">{region.size}</output>
          <div ref={handleRef} data-testid="plain" />
        </>
      );
    }
    render(<Plain />);
    const plain = screen.getByTestId('plain');
    expect(plain).toHaveAttribute('role', 'separator');
    expect(plain).toHaveAttribute('aria-valuenow', '200');
    fireEvent.keyDown(plain, {key: 'ArrowLeft'});
    expect(size()).toBe(190);
  });
});

describe('a ResizeHandle that its owner does not render (component:Resizable FR3)', () => {
  /** A child that mounts the handle from its own state, in an Activity or not. */
  function Child({
    handleRef,
    inActivity,
  }: {
    handleRef: RefObject<HTMLDivElement | null>;
    inActivity: boolean;
  }) {
    const [isShown, setIsShown] = useState(inActivity);
    const [isVisible, setIsVisible] = useState(true);
    const handle = <ResizeHandle ref={handleRef} label="Sidebar width" />;
    return (
      <>
        <button type="button" onClick={() => setIsShown(!isShown)}>
          mount
        </button>
        <button type="button" onClick={() => setIsVisible(!isVisible)}>
          visibility
        </button>
        {inActivity ? (
          <Activity mode={isVisible ? 'visible' : 'hidden'}>{handle}</Activity>
        ) : (
          isShown && handle
        )}
      </>
    );
  }
  function Owner({inActivity = false}: {inActivity?: boolean}) {
    const handleRef = useRef<HTMLDivElement>(null);
    const region = useResizable(handleRef, {defaultSize: 200});
    return (
      <>
        <output data-testid="size">{region.size}</output>
        <Child handleRef={handleRef} inActivity={inActivity} />
      </>
    );
  }
  const click = (name: string) => {
    act(() => {
      screen.getByRole('button', {name}).click();
    });
  };

  it('binds a handle a child mounts from its own state, and unbinds it as the child unmounts it', () => {
    render(<Owner />);
    click('mount');
    expect(separator()).toHaveAttribute('aria-valuenow', '200');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(210);
    click('mount');
    expect(screen.queryByRole('separator')).toBeNull();
    click('mount');
    expect(separator()).toHaveAttribute('aria-valuenow', '210');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(220);
  });

  it('keeps a handle bound when its own Activity hides and shows it', () => {
    render(<Owner inActivity />);
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(210);
    click('visibility');
    click('visibility');
    expect(separator()).toHaveAttribute('aria-valuenow', '210');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(size()).toBe(220);
    expect(separator()).toHaveAttribute('aria-valuenow', '220');
  });

  it('renders a factory made on its element again after an Activity hides and shows it', () => {
    function Direct() {
      const [isVisible, setIsVisible] = useState(true);
      const handleRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <button type="button" onClick={() => setIsVisible(!isVisible)}>
            visibility
          </button>
          <Activity mode={isVisible ? 'visible' : 'hidden'}>
            <ResizeHandle ref={handleRef} label="Sidebar width" />
          </Activity>
        </>
      );
    }
    render(<Direct />);
    const made: {resizable?: ResizableController} = {};
    act(() => {
      made.resizable = createResizable(separator(), {defaultSize: 200});
    });
    const {resizable} = made;
    if (resizable == null) {
      throw new Error('createResizable returned nothing');
    }
    act(() => {
      resizable.resize(240);
    });
    expect(separator()).toHaveAttribute('aria-valuenow', '240');
    click('visibility');
    click('visibility');
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(resizable.size).toBe(250);
    expect(separator()).toHaveAttribute('aria-valuenow', '250');
    resizable.destroy();
  });
});

describe('useResizable(handleRef) under an Activity that hides its component', () => {
  it('keeps the region size and collapse state across a hide and a show', () => {
    let region: UseResizableResult | undefined;
    function Panel() {
      const handleRef = useRef<HTMLDivElement>(null);
      region = useResizable(handleRef, {defaultSize: 250, collapsible: true});
      return (
        <>
          <output data-testid="size">{region.size}</output>
          <ResizeHandle ref={handleRef} />
        </>
      );
    }
    function Host() {
      const [isVisible, setIsVisible] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsVisible(!isVisible)}>
            visibility
          </button>
          <Activity mode={isVisible ? 'visible' : 'hidden'}>
            <Panel />
          </Activity>
        </>
      );
    }
    render(<Host />);
    act(() => {
      region?.resize(300);
    });
    expect(size()).toBe(300);
    act(() => {
      screen.getByRole('button', {name: 'visibility'}).click();
    });
    act(() => {
      screen.getByRole('button', {name: 'visibility'}).click();
    });
    expect(region?.size).toBe(300);
    expect(separator()).toHaveAttribute('aria-valuenow', '300');
    act(() => {
      region?.collapse();
    });
    act(() => {
      screen.getByRole('button', {name: 'visibility'}).click();
    });
    act(() => {
      screen.getByRole('button', {name: 'visibility'}).click();
    });
    expect(region?.isCollapsed).toBe(true);
    act(() => {
      region?.expand();
    });
    expect(region?.size).toBe(300);
  });
});
