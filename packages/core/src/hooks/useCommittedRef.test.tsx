// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCommittedRef.test.tsx
 * @input React, react-dom, React Testing Library, useCommittedRef
 * @output Proves, for both call shapes, that the ref keeps the committed value
 *   when React drops a render, that every layout Effect in the same commit
 *   reads the new value, that a listener installed once calls a changed
 *   callback, and that server rendering gives no warning; and that a callback
 *   declared before the value reads the latest committed value
 * @position Unit tests for the internal useCommittedRef hook
 */

import {
  StrictMode,
  Suspense,
  act,
  startTransition,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {renderToString} from 'react-dom/server';
import {fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useCommittedRef, useCommittedRefInto} from './useCommittedRef';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The two call shapes, each as a hook that returns the ref. */
function useIntoShape<T>(value: T): {readonly current: T} {
  const ref = useRef(value);
  useCommittedRefInto(ref, value);
  return ref;
}
const SHAPES = [
  ['useCommittedRef', useCommittedRef],
  ['useCommittedRefInto', useIntoShape],
] as const;

/** A promise that never settles, so a render that reads it never commits. */
const never = new Promise<string>(() => {});

function renderSuspendingHolder(
  useShape: (value: string) => {readonly current: string},
) {
  const seen: {ref: {readonly current: string} | null} = {ref: null};
  let setValue: (value: string) => void = () => {};
  function Child({value}: {value: string}) {
    return <span>{value === 'B' ? use(never) : value}</span>;
  }
  function Holder({value}: {value: string}) {
    seen.ref = useShape(value);
    return <Child value={value} />;
  }
  function App() {
    const [value, set] = useState('A');
    setValue = set;
    return (
      <Suspense fallback={<i>loading</i>}>
        <Holder value={value} />
      </Suspense>
    );
  }
  const view = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return {view, seen, setValue: (value: string) => setValue(value)};
}

describe.each(SHAPES)('%s', (_name, useShape) => {
  it('lets a listener installed once call a changed callback', () => {
    let installs = 0;
    function Listener({
      id,
      onPing,
    }: {
      id: string;
      onPing: (id: string) => void;
    }) {
      const onPingRef = useShape(onPing);
      const idRef = useShape(id);
      useEffect(() => {
        // Subscribes to the window's `ping` event.
        installs += 1;
        const listener = () => onPingRef.current(idRef.current);
        window.addEventListener('ping', listener);
        return () => window.removeEventListener('ping', listener);
      }, [onPingRef, idRef]);
      return null;
    }
    const first = vi.fn();
    const second = vi.fn();
    const {rerender} = render(<Listener id="row-1" onPing={first} />);
    rerender(<Listener id="row-1" onPing={second} />);

    fireEvent(window, new Event('ping'));

    expect(installs).toBe(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('row-1');
  });

  it('keeps the committed value when a transition suspends and React drops the render', async () => {
    const {view, seen, setValue} = renderSuspendingHolder(useShape);

    await act(async () => {
      startTransition(() => setValue('B'));
    });

    expect(view.container.textContent).toBe('A');
    expect(seen.ref?.current).toBe('A');
  });

  it('keeps the committed value when an urgent update suspends in a shown boundary', async () => {
    const {view, seen, setValue} = renderSuspendingHolder(useShape);

    await act(async () => {
      setValue('B');
    });

    expect(view.container.textContent).toContain('loading');
    expect(seen.ref?.current).toBe('A');
  });

  it('gives every layout Effect in the same commit the new value', async () => {
    const reads: Record<string, string> = {};
    const shared: {ref: {readonly current: string} | null} = {ref: null};
    let setValue: (value: string) => void = () => {};
    function Reader({name}: {name: string}) {
      useLayoutEffect(() => {
        reads[name] = shared.ref?.current ?? '';
      });
      return null;
    }
    function Holder({value}: {value: string}) {
      shared.ref = useShape(value);
      return <Reader name="child" />;
    }
    function Parent() {
      const [value, set] = useState('A');
      setValue = set;
      useLayoutEffect(() => {
        reads.parent = shared.ref?.current ?? '';
      });
      return (
        <>
          <Reader name="earlierSibling" />
          <Holder value={value} />
          <Reader name="laterSibling" />
        </>
      );
    }
    render(<Parent />);

    await act(async () => {
      setValue('B');
    });

    expect(reads).toEqual({
      earlierSibling: 'B',
      child: 'B',
      laterSibling: 'B',
      parent: 'B',
    });
  });

  it('renders on the server without a warning and keeps the initial value', () => {
    const consoleError = vi.spyOn(console, 'error');
    const consoleWarn = vi.spyOn(console, 'warn');
    let seen: {readonly current: string} | null = null;
    function Holder() {
      seen = useShape('initial');
      return <span>ok</span>;
    }

    const html = renderToString(<Holder />);

    expect(html).toContain('ok');
    expect(seen).toEqual({current: 'initial'});
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});

describe('useCommittedRef', () => {
  it('keeps the same ref object across renders', () => {
    const refs: {readonly current: string}[] = [];
    function Probe({value}: {value: string}) {
      refs.push(useCommittedRef(value));
      return null;
    }
    const {rerender} = render(<Probe value="a" />);
    rerender(<Probe value="b" />);

    expect(refs[0]).toBe(refs[refs.length - 1]);
  });
});

describe('useCommittedRefInto', () => {
  it('lets a callback declared before the value read the latest committed value', () => {
    const read = vi.fn();
    function Holder({label}: {label: string}) {
      const labelRef = useRef(label);
      // Declared before the value it reads, as in a forward closure.
      const announce = () => {
        read(labelRef.current);
      };
      const upper = label.toUpperCase();
      useCommittedRefInto(labelRef, upper);
      return (
        <button type="button" onClick={announce}>
          Announce
        </button>
      );
    }
    const {getByRole, rerender} = render(<Holder label="first" />);
    rerender(<Holder label="second" />);

    fireEvent.click(getByRole('button', {name: 'Announce'}));

    expect(read).toHaveBeenCalledWith('SECOND');
  });
});
