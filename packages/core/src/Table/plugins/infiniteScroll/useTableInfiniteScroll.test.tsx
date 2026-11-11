// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableInfiniteScroll.test.tsx
 * @input The public hook, wrapper context, real Button and observer boundary
 * @output Deterministic request, completion, resource and focus regressions
 * @position Colocated infinite-scroll functional tests
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StrictMode, useLayoutEffect, useRef, useSyncExternalStore} from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {renderToString} from 'react-dom/server';
import {Table} from '../../Table';
import * as focusReturn from '../../../utils/focusReturn';
import {
  useTableInfiniteScroll,
  type UseTableInfiniteScrollConfig,
} from './useTableInfiniteScroll';
import type {
  ScrollWrapperRenderProps,
  TablePlugin,
  TableRenderContext,
} from '../../types';

class Observer {
  static instances: Observer[] = [];
  static visibility = new WeakMap<Element, boolean>();
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit;
  target: Element | null = null;
  observe = vi.fn((target: Element) => {
    this.target = target;
    // Native IO emits an initial record on acquisition even without exit/re-entry.
    const visibility = Observer.visibility.get(target);
    if (visibility !== undefined) {
      setTimeout(() => this.enter(visibility), 0);
    }
  });
  disconnect = vi.fn();
  constructor(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.callback = callback;
    this.options = options;
    Observer.instances.push(this);
  }
  enter(isIntersecting = true) {
    if (this.target) {
      Observer.visibility.set(this.target, isIntersecting);
    }
    this.callback(
      [{target: this.target, isIntersecting} as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
function latestObserver() {
  return Observer.instances[Observer.instances.length - 1];
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
const emptySnapshot = Object.freeze({isLoading: false});
const noopSubscribe = () => () => {};
function Surface({
  plugin,
  mode = 'data',
  rowModel = 'flat',
  prior,
}: {
  plugin: TablePlugin<Record<string, unknown>>;
  mode?: 'data' | 'children';
  rowModel?: TableRenderContext['rowModel'];
  prior?: ScrollWrapperRenderProps;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const context: TableRenderContext = {
    mode,
    rowModel,
    viewport: viewportRef,
    logicalRowCount: 1,
    headerRowCount: 1,
  };
  const source = plugin.renderState;
  const snapshot = useSyncExternalStore(
    source?.subscribe ?? noopSubscribe,
    source?.getSnapshot ?? (() => emptySnapshot),
    source?.getServerSnapshot ?? (() => emptySnapshot),
  );
  const props = plugin.transformScrollWrapper?.(
    prior ?? {htmlProps: {}, xstyle: []},
    context,
  ) ??
    prior ?? {htmlProps: {}, xstyle: []};
  return (
    <div
      {...props.htmlProps}
      ref={node => {
        viewportRef.current = node;
        const ref = props.htmlProps.ref;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      aria-label="Scroll region">
      {props.beforeTable}
      <table>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </table>
      <output aria-label="Loading snapshot">
        {String(snapshot.isLoading)}
      </output>
      {props.afterTable}
    </div>
  );
}
function Example({
  mode,
  rowModel,
  prior,
  onPlugin,
  ...config
}: UseTableInfiniteScrollConfig & {
  mode?: 'data' | 'children';
  rowModel?: TableRenderContext['rowModel'];
  prior?: ScrollWrapperRenderProps;
  onPlugin?: (plugin: TablePlugin<Record<string, unknown>>) => void;
}) {
  const plugin = useTableInfiniteScroll(config);
  useLayoutEffect(() => {
    onPlugin?.(plugin);
  });
  return (
    <Surface plugin={plugin} mode={mode} rowModel={rowModel} prior={prior} />
  );
}
const ready = {hasMore: true, isLoading: false};

beforeEach(() => {
  Observer.instances = [];
  Observer.visibility = new WeakMap();
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(resolve: () => void) {
  await act(async () => {
    resolve();
    await Promise.resolve();
  });
}
async function nextBatch() {
  await act(async () => {
    vi.advanceTimersByTime(1);
    await Promise.resolve();
  });
}

describe('useTableInfiniteScroll', () => {
  it('appends one real manual command outside the table and preserves prior wrapper contributions', () => {
    const prior = {
      htmlProps: {'data-prior': 'kept', ref: vi.fn()},
      xstyle: [],
      beforeTable: <span>Before</span>,
      afterTable: <span>After</span>,
    } as ScrollWrapperRenderProps;
    render(
      <Example
        {...ready}
        onLoadMore={vi.fn(async () => new Promise<void>(() => {}))}
        prior={prior}
      />,
    );
    const button = screen.getByRole('button', {name: 'Load more'});
    expect(button.closest('table')).toBeNull();
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(button.closest('[data-prior]')).toHaveAttribute(
      'data-prior',
      'kept',
    );
    expect(prior.htmlProps.ref).toHaveBeenCalled();
    expect(screen.getAllByRole('row')).toHaveLength(1);
    // The harness output has its own implicit status role; count module chrome only.
    const regions = within(button.parentElement!).getAllByRole('status');
    expect(regions).toHaveLength(1);
    expect(button).toContainElement(regions[0]);
  });
  it('shares a pre-invocation latch across observer, click and synchronous reentry', () => {
    const request = deferred();
    const load = vi.fn(async () => {
      latestObserver().enter();
      fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
      return request.promise;
    });
    render(<Example {...ready} onLoadMore={load} />);
    act(() => latestObserver().enter());
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name: 'Load more'})).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', {name: 'Load more'})).not.toHaveAttribute(
      'disabled',
    );
    expect(latestObserver().disconnect).toHaveBeenCalled();
  });
  it('completes without a true loading phase and rearms a visible short batch only in a later task', async () => {
    const first = deferred();
    const second = deferred();
    const load = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(second.promise);
    render(<Example {...ready} onLoadMore={load} />);
    act(() => latestObserver().enter());
    await settle(first.resolve);
    expect(screen.getByLabelText('Loading snapshot')).toHaveTextContent(
      'false',
    );
    expect(load).toHaveBeenCalledTimes(1);
    await nextBatch();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('does not synchronously spin on Promise.resolve without DOM growth', async () => {
    const load = vi.fn(async () => Promise.resolve());
    render(<Example {...ready} onLoadMore={load} />);
    await act(async () => {
      latestObserver().enter();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await nextBatch();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('waits for both Promise settlement and a subsequent false commit', async () => {
    const request = deferred();
    const load = vi.fn(async () => request.promise);
    const view = render(<Example {...ready} onLoadMore={load} />);
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    view.rerender(<Example hasMore isLoading onLoadMore={load} />);
    await settle(request.resolve);
    expect(screen.getByLabelText('Loading snapshot')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(<Example {...ready} onLoadMore={load} />);
    expect(screen.getByLabelText('Loading snapshot')).toHaveTextContent(
      'false',
    );
  });
  it.each(['throw', 'reject', 'void'] as const)(
    'pauses automatic %s failure and permits a manual retry without remount',
    async kind => {
      const request = deferred();
      const retry = deferred();
      // eslint-disable-next-line @typescript-eslint/promise-function-async -- This fault fixture must throw or return literal void synchronously, not normalize either into a Promise.
      const load = vi.fn((): Promise<void> => {
        if (load.mock.calls.length > 1) {
          return retry.promise;
        }
        if (kind === 'throw') {
          throw new Error('failure');
        }
        if (kind === 'void') {
          return undefined as unknown as Promise<void>;
        }
        return request.promise;
      });
      const view = render(<Example {...ready} onLoadMore={load} />);
      await act(async () => {
        latestObserver().enter();
        if (kind === 'reject') {
          request.reject(new Error('failure'));
        }
        await Promise.resolve();
      });
      await nextBatch();
      view.rerender(<Example {...ready} onLoadMore={async () => load()} />);
      view.rerender(
        <Example hasMore={false} isLoading={false} onLoadMore={load} />,
      );
      view.rerender(<Example {...ready} onLoadMore={load} />);
      act(() => latestObserver().enter());
      expect(load).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
      expect(load).toHaveBeenCalledTimes(2);
      if (kind === 'void') {
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('Promise'),
        );
      }
      await settle(retry.resolve);
      // Exhaustion discarded the old geometry; a new native entry must establish visibility.
      act(() => latestObserver().enter());
      expect(load).toHaveBeenCalledTimes(3);
    },
  );
  it('observes against the browser viewport', () => {
    const load = vi.fn(async () => new Promise<void>(() => {}));
    render(<Example {...ready} onLoadMore={load} />);
    expect(latestObserver().options.root).toBeNull();
  });
  it('keeps identities and unchanged geometry stable when callbacks change', () => {
    const {result, rerender} = renderHook(
      ({onLoadMore}) => useTableInfiniteScroll({...ready, onLoadMore}),
      {initialProps: {onLoadMore: async () => Promise.resolve()}},
    );
    const plugin = result.current;
    const source = plugin.renderState;
    rerender({onLoadMore: async () => {}});
    expect(result.current).toBe(plugin);
    expect(result.current.renderState).toBe(source);
    expect(source?.getSnapshot()).toBe(source?.getSnapshot());
    expect(Object.isFrozen(source?.getSnapshot())).toBe(true);
  });
  it('does not reconnect or unlock a pending request on callback replacement', () => {
    const request = deferred();
    const load = vi.fn(async () => request.promise);
    const replacement = vi.fn(async () => Promise.resolve());
    const view = render(<Example {...ready} onLoadMore={load} />);
    const observer = latestObserver();
    view.rerender(<Example {...ready} onLoadMore={replacement} />);
    expect(latestObserver()).toBe(observer);
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    view.rerender(<Example {...ready} onLoadMore={load} />);
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });
  it('has a manual fallback without IO and blocks busy keyboard activation without losing focus', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    // No observation/rearm clock exists in this case. Match Button's canonical
    // real-timer keyboard harness instead of freezing userEvent's async wrapper.
    vi.useRealTimers();
    const user = userEvent.setup();
    const request = deferred();
    const load = vi.fn(async () => request.promise);
    render(<Example {...ready} onLoadMore={load} />);
    const button = screen.getByRole('button', {name: 'Load more'});
    button.focus();
    await user.keyboard('{Enter}');
    expect(load).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(load).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    expect(Observer.instances).toHaveLength(0);
    await settle(request.resolve);
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', {name: 'Load more'})).toBe(button);
  });
  it.each([false, true])(
    'uses the shared focus-loss owner on command exhaustion (StrictMode=%s)',
    isStrict => {
      const move = vi.spyOn(focusReturn, 'moveFocusLeftBehind');
      const load = async () => Promise.resolve();
      const contents = (hasMore: boolean) => (
        <Example hasMore={hasMore} isLoading={false} onLoadMore={load} />
      );
      const wrapped = (hasMore: boolean) =>
        isStrict ? (
          <StrictMode>{contents(hasMore)}</StrictMode>
        ) : (
          contents(hasMore)
        );
      const view = render(wrapped(true));
      const button = screen.getByRole('button', {name: 'Load more'});
      button.focus();
      const viewport = screen.getByLabelText('Scroll region');
      view.rerender(wrapped(false));
      expect(viewport).toHaveFocus();
      expect(move).toHaveBeenCalledTimes(1);
      expect(move).toHaveBeenCalledWith(
        expect.objectContaining({element: button}),
        viewport,
        null,
        {preventScroll: true},
      );
      viewport.blur();
      expect(viewport).not.toHaveAttribute('tabindex');
    },
  );
  it('does not bypass a shared focus-loss decision that preserves the current focus', () => {
    const move = vi
      .spyOn(focusReturn, 'moveFocusLeftBehind')
      .mockReturnValue(false);
    const load = async () => Promise.resolve();
    const view = render(<Example {...ready} onLoadMore={load} />);
    screen.getByRole('button', {name: 'Load more'}).focus();
    const viewport = screen.getByLabelText('Scroll region');
    view.rerender(
      <Example hasMore={false} isLoading={false} onLoadMore={load} />,
    );
    expect(move).toHaveBeenCalledTimes(1);
    expect(viewport).not.toHaveFocus();
    expect(viewport).not.toHaveAttribute('tabindex');
  });
  it('hands focused-command exhaustion to the shared viewport and removes only temporary tabindex on blur', () => {
    const load = async () => Promise.resolve();
    const view = render(<Example {...ready} onLoadMore={load} />);
    screen.getByRole('button', {name: 'Load more'}).focus();
    const viewport = screen.getByLabelText('Scroll region');
    const focus = vi.spyOn(viewport, 'focus');
    view.rerender(
      <Example hasMore={false} isLoading={false} onLoadMore={load} />,
    );
    expect(viewport).toHaveFocus();
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({preventScroll: true}),
    );
    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(
      screen.queryByRole('button', {name: 'Load more'}),
    ).not.toBeInTheDocument();
    fireEvent.blur(viewport);
    expect(viewport).not.toHaveAttribute('tabindex');
  });
  it('preserves authored viewport tabindex and unrelated focus on exhaustion', () => {
    const load = async () => Promise.resolve();
    const prior = {htmlProps: {tabIndex: 0}, xstyle: []};
    const view = render(
      <>
        <button type="button">Other</button>
        <Example {...ready} onLoadMore={load} prior={prior} />
      </>,
    );
    screen.getByRole('button', {name: 'Other'}).focus();
    view.rerender(
      <>
        <button type="button">Other</button>
        <Example
          hasMore={false}
          isLoading={false}
          onLoadMore={load}
          prior={prior}
        />
      </>,
    );
    expect(screen.getByRole('button', {name: 'Other'})).toHaveFocus();
    expect(screen.getByLabelText('Scroll region')).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
  it('cleans exhaustion, reacquires on more data and ignores detached observer entries', () => {
    const load = vi.fn(async () => new Promise<void>(() => {}));
    const view = render(<Example {...ready} onLoadMore={load} />);
    const observer = latestObserver();
    view.rerender(
      <Example hasMore={false} isLoading={false} onLoadMore={load} />,
    );
    expect(observer.disconnect).toHaveBeenCalled();
    act(() => observer.enter());
    expect(load).not.toHaveBeenCalled();
    view.rerender(<Example {...ready} onLoadMore={load} />);
    act(() => latestObserver().enter());
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('isolates owning-hook remount settlements and survives StrictMode resource replay', async () => {
    const request = deferred();
    const load = vi.fn(async () => request.promise);
    const view = render(
      <StrictMode>
        <Example key="first" {...ready} onLoadMore={load} />
      </StrictMode>,
    );
    act(() => latestObserver().enter());
    expect(load).toHaveBeenCalledTimes(1);
    const obsolete = latestObserver();
    view.rerender(
      <StrictMode>
        <Example key="second" {...ready} onLoadMore={load} />
      </StrictMode>,
    );
    await settle(request.resolve);
    await nextBatch();
    act(() => obsolete.enter());
    expect(load).toHaveBeenCalledTimes(1);
    act(() => latestObserver().enter());
    expect(load).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(latestObserver().disconnect).toHaveBeenCalled();
  });
  it.each(['children', 'tree', 'grouped', 'undeclared'] as const)(
    'diagnoses unsupported %s Table admission once without adding loading behavior',
    mode => {
      const load = vi.fn(async () => {});
      const modifier: TablePlugin<Record<string, unknown>> = {
        ...(mode === 'tree' || mode === 'grouped' ? {rowModel: mode} : {}),
        transformBodyRow: props => props,
      };
      function Fixture() {
        const loading = useTableInfiniteScroll({...ready, onLoadMore: load});
        const plugins: Record<
          string,
          TablePlugin<Record<string, unknown>>
        > = mode === 'children' ? {loading} : {loading, modifier};
        return mode === 'children' ? (
          <Table plugins={plugins}>
            <tbody>
              <tr>
                <td>Row</td>
              </tr>
            </tbody>
          </Table>
        ) : (
          <Table
            data={[{id: 'one', name: 'Row'}]}
            columns={[{key: 'name', header: 'Name'}]}
            idKey="id"
            plugins={plugins}
          />
        );
      }
      const view = render(
        <StrictMode>
          <Fixture />
        </StrictMode>,
      );
      view.rerender(
        <StrictMode>
          <Fixture />
        </StrictMode>,
      );
      expect(screen.getByText('Row')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: 'Load more'}),
      ).not.toBeInTheDocument();
      expect(load).not.toHaveBeenCalled();
      expect(Observer.instances).toHaveLength(0);
      const warnings = vi
        .mocked(console.warn)
        .mock.calls.filter(([message]) =>
          String(message).startsWith('useTableInfiniteScroll:'),
        );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.[0]).toContain(
        mode === 'children' ? 'data-driven Table' : "rowModel: 'flat'",
      );
    },
  );
  it('diagnoses a missing render context once and preserves wrapper props', () => {
    const {result} = renderHook(() =>
      useTableInfiniteScroll({...ready, onLoadMore: async () => {}}),
    );
    const prior: ScrollWrapperRenderProps = {
      htmlProps: {title: 'kept'},
      xstyle: [],
    };
    expect(result.current.transformScrollWrapper?.(prior)).toBe(prior);
    expect(result.current.transformScrollWrapper?.(prior)).toBe(prior);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Table render context'),
    );
    expect(Observer.instances).toHaveLength(0);
  });
  it.each([{mode: 'children' as const}, {rowModel: 'custom' as const}])(
    'adds no chrome or requests outside parent admission: %j',
    props => {
      const load = vi.fn(async () => Promise.resolve());
      const view = render(<Example {...ready} onLoadMore={load} {...props} />);
      view.rerender(<Example {...ready} onLoadMore={load} {...props} />);
      expect(
        screen.queryByRole('button', {name: 'Load more'}),
      ).not.toBeInTheDocument();
      expect(Observer.instances).toHaveLength(0);
      expect(load).not.toHaveBeenCalled();
    },
  );
  it('is a no-op without an explicit render context', () => {
    const {result} = renderHook(() =>
      useTableInfiniteScroll({...ready, onLoadMore: async () => {}}),
    );
    const prior = {htmlProps: {}, xstyle: []};
    expect(result.current.transformScrollWrapper?.(prior)).toBe(prior);
  });
  it('publishes controlled initial loading to SSR before any DOM admission', () => {
    let snapshot: unknown;
    function Server() {
      const plugin = useTableInfiniteScroll({
        hasMore: true,
        isLoading: true,
        onLoadMore: async () => {},
      });
      snapshot = plugin.renderState?.getServerSnapshot();
      return null;
    }
    renderToString(<Server />);
    expect(snapshot).toEqual({isLoading: true, hasMore: true});
  });
});
