// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VegaChart.test.tsx
 * @input Uses vitest, @testing-library/react, VegaChart, mocked vega + vega-lite
 * @output Functional tests for the VegaChart View lifecycle and error contract
 * @position Colocated test for VegaChart.tsx (issue #4295 vega coverage)
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, act} from '@testing-library/react';
import React from 'react';
import {VegaChart} from './VegaChart';
import type {AnySpec} from './types';

const {parseMock, compileMock, views, FakeView} = vi.hoisted(() => {
  /**
   * Stand-in for vega's View. Records constructor args and lifecycle calls,
   * and exposes a manually controlled runAsync() promise so tests decide
   * when (and how) each run settles.
   */
  class FakeView {
    runtime: unknown;
    options: Record<string, unknown>;
    runPromise: Promise<void>;
    resolveRun!: () => void;
    rejectRun!: (err: unknown) => void;
    data = vi.fn().mockReturnThis();
    finalize = vi.fn();
    runAsync = vi.fn(() => this.runPromise);

    constructor(runtime: unknown, options: Record<string, unknown>) {
      this.runtime = runtime;
      this.options = options;
      this.runPromise = new Promise<void>((resolve, reject) => {
        this.resolveRun = resolve;
        this.rejectRun = reject;
      });
      views.push(this);
    }
  }

  const views: FakeView[] = [];
  const parseMock = vi.fn((spec: unknown) => ({runtimeFor: spec}));
  const compileMock = vi.fn((spec: unknown) => ({spec: {compiledFrom: spec}}));
  return {parseMock, compileMock, views, FakeView};
});

vi.mock('vega', () => ({parse: parseMock, View: FakeView}));
vi.mock('vega-lite', () => ({compile: compileMock}));

const VEGA_LITE_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  mark: 'bar',
} as unknown as AnySpec;

const VEGA_SPEC = {
  $schema: 'https://vega.github.io/schema/vega/v6.json',
  marks: [],
} as unknown as AnySpec;

beforeEach(() => {
  vi.clearAllMocks();
  views.length = 0;
});

describe('VegaChart', () => {
  describe('spec handling', () => {
    it('compiles vega-lite specs with compileOptions and parses the compiled output', () => {
      const compileOptions = {config: {background: 'red'}};
      render(
        <VegaChart spec={VEGA_LITE_SPEC} compileOptions={compileOptions} />,
      );

      expect(compileMock).toHaveBeenCalledTimes(1);
      expect(compileMock).toHaveBeenCalledWith(VEGA_LITE_SPEC, compileOptions);
      const compiled = compileMock.mock.results[0].value.spec;
      expect(parseMock).toHaveBeenCalledTimes(1);
      expect(parseMock.mock.calls[0][0]).toBe(compiled);
    });

    it('renders plain vega specs directly without invoking the vega-lite compiler', () => {
      render(<VegaChart spec={VEGA_SPEC} />);

      expect(compileMock).not.toHaveBeenCalled();
      expect(parseMock).toHaveBeenCalledTimes(1);
      expect(parseMock.mock.calls[0][0]).toBe(VEGA_SPEC);
      // No data prop -> no dataset loading either.
      expect(views).toHaveLength(1);
      expect(views[0].data).not.toHaveBeenCalled();
    });

    it('forwards parseConfig and parseOptions to vega.parse', () => {
      const parseConfig = {background: '#1a1a1a'};
      const parseOptions = {ast: true};
      render(
        <VegaChart
          spec={VEGA_SPEC}
          parseConfig={parseConfig}
          parseOptions={parseOptions}
        />,
      );

      expect(parseMock).toHaveBeenCalledWith(
        VEGA_SPEC,
        parseConfig,
        parseOptions,
      );
    });
  });

  describe('View construction', () => {
    it('constructs the View from the parsed runtime with hover on and the rendered div as container', () => {
      const {container} = render(<VegaChart spec={VEGA_SPEC} />);

      expect(views).toHaveLength(1);
      expect(views[0].runtime).toBe(parseMock.mock.results[0].value);
      expect(views[0].options).toEqual({
        hover: true,
        container: container.firstElementChild,
      });
    });

    it('lets viewOptions override the hover default while the container stays injected', () => {
      const {container} = render(
        <VegaChart
          spec={VEGA_SPEC}
          viewOptions={{hover: false, logLevel: 2}}
        />,
      );

      expect(views).toHaveLength(1);
      expect(views[0].options).toEqual({
        hover: false,
        logLevel: 2,
        container: container.firstElementChild,
      });
    });

    it('loads each named dataset via view.data before the first run', () => {
      const table = [{a: 'A', b: 28}];
      const other = [{x: 1}];
      render(<VegaChart spec={VEGA_SPEC} data={{table, other}} />);

      expect(views).toHaveLength(1);
      const view = views[0];
      expect(view.data).toHaveBeenCalledTimes(2);
      expect(view.data).toHaveBeenCalledWith('table', table);
      expect(view.data).toHaveBeenCalledWith('other', other);
      // Datasets are loaded before the run kicks off.
      expect(Math.max(...view.data.mock.invocationCallOrder)).toBeLessThan(
        view.runAsync.mock.invocationCallOrder[0],
      );
    });

    it('tears down the old View and builds a new one when the spec changes', () => {
      const {rerender} = render(<VegaChart spec={VEGA_SPEC} />);
      expect(views).toHaveLength(1);

      rerender(
        <VegaChart
          spec={{...VEGA_SPEC, background: 'red'} as unknown as AnySpec}
        />,
      );

      expect(views).toHaveLength(2);
      expect(views[0].finalize).toHaveBeenCalledTimes(1);
      expect(views[1].finalize).not.toHaveBeenCalled();
      expect(parseMock).toHaveBeenCalledTimes(2);
    });
  });

  // The View is the expensive thing this component owns, and rebuilding it
  // throws away the chart's zoom, hover, and signal state. So a rebuild
  // follows a change of value, not a change of object identity -- the
  // documented usage passes spec, options, and data as inline literals.
  describe('View rebuild policy', () => {
    it('keeps the View when a re-render passes an equal spec object', () => {
      const {rerender} = render(<VegaChart spec={VEGA_SPEC} />);
      expect(views).toHaveLength(1);

      rerender(<VegaChart spec={{...VEGA_SPEC}} />);

      expect(views).toHaveLength(1);
      expect(views[0].finalize).not.toHaveBeenCalled();
      expect(parseMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the View when a re-render passes an equal options object', () => {
      const {rerender} = render(
        <VegaChart spec={VEGA_SPEC} viewOptions={{renderer: 'canvas'}} />,
      );

      rerender(
        <VegaChart spec={VEGA_SPEC} viewOptions={{renderer: 'canvas'}} />,
      );

      expect(views).toHaveLength(1);
    });

    it('rebuilds when an options value actually changes', () => {
      const {rerender} = render(
        <VegaChart spec={VEGA_SPEC} viewOptions={{renderer: 'canvas'}} />,
      );

      rerender(<VegaChart spec={VEGA_SPEC} viewOptions={{renderer: 'svg'}} />);

      expect(views).toHaveLength(2);
      expect(views[1].options).toMatchObject({renderer: 'svg'});
    });

    it('rebuilds when a function inside the options changes identity', () => {
      // Two tooltip handlers can look alike and behave differently, so
      // functions are compared by reference, not walked.
      const {rerender} = render(
        <VegaChart spec={VEGA_SPEC} viewOptions={{tooltip: () => {}}} />,
      );

      rerender(
        <VegaChart spec={VEGA_SPEC} viewOptions={{tooltip: () => {}}} />,
      );

      expect(views).toHaveLength(2);
    });

    // A caller that holds its spec in a ref or a module constant and edits it
    // in place leaves both renders pointing at the same object. Comparing
    // props to props sees nothing; the chart would keep rendering old data.
    it('rebuilds when a nested object shared across renders is mutated', () => {
      const encoding = {x: {field: 'a', type: 'ordinal'}};
      const specWith = () =>
        ({
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          mark: 'bar',
          encoding,
        }) as unknown as AnySpec;
      const {rerender} = render(<VegaChart spec={specWith()} />);
      expect(views).toHaveLength(1);

      encoding.x.field = 'b';
      rerender(<VegaChart spec={specWith()} />);

      expect(views).toHaveLength(2);
      expect(views[0].finalize).toHaveBeenCalledTimes(1);
      expect(compileMock.mock.calls[1][0]).toMatchObject({
        encoding: {x: {field: 'b'}},
      });
    });

    it('rebuilds when the very same spec object is mutated in place', () => {
      const spec = {
        $schema: 'https://vega.github.io/schema/vega/v6.json',
        marks: [] as unknown[],
      } as unknown as AnySpec;
      const {rerender} = render(<VegaChart spec={spec} />);

      (spec as unknown as {marks: unknown[]}).marks.push({type: 'rect'});
      rerender(<VegaChart spec={spec} />);

      expect(views).toHaveLength(2);
    });

    it('hands Vega the caller’s own spec object, not a copy', () => {
      render(<VegaChart spec={VEGA_SPEC} />);

      expect(parseMock.mock.calls[0][0]).toBe(VEGA_SPEC);
    });

    // A spec the comparison cannot copy — a reference cycle, or nesting past
    // its depth bound — is compared by reference instead. That verdict runs
    // during render, so an "always changed" answer would re-render forever
    // ("Too many re-renders") and never paint a chart at all.
    describe('inputs the comparison cannot copy', () => {
      function nest(depth: number): Record<string, unknown> {
        let node: Record<string, unknown> = {leaf: 'a'};
        for (let index = 0; index < depth; index++) {
          node = {node};
        }
        return node;
      }

      function cyclicSpec(): AnySpec {
        const spec: Record<string, unknown> = {
          $schema: 'https://vega.github.io/schema/vega/v6.json',
          marks: [],
        };
        spec.self = spec;
        return spec as unknown as AnySpec;
      }

      it('mounts a cyclic spec and builds exactly one View', () => {
        expect(() => render(<VegaChart spec={cyclicSpec()} />)).not.toThrow();

        expect(views).toHaveLength(1);
      });

      it('keeps the View across re-renders of the same cyclic spec', () => {
        const spec = cyclicSpec();
        const {rerender} = render(<VegaChart spec={spec} />);

        rerender(<VegaChart spec={spec} />);
        rerender(<VegaChart spec={spec} />);

        expect(views).toHaveLength(1);
        expect(views[0].finalize).not.toHaveBeenCalled();
      });

      it('rebuilds exactly once when the cyclic spec is replaced', () => {
        const {rerender} = render(<VegaChart spec={cyclicSpec()} />);
        const replacement = cyclicSpec();

        rerender(<VegaChart spec={replacement} />);
        rerender(<VegaChart spec={replacement} />);

        expect(views).toHaveLength(2);
        expect(views[0].finalize).toHaveBeenCalledTimes(1);
      });

      it('mounts a spec nested past the depth bound and keeps its View', () => {
        const spec = {
          $schema: 'https://vega.github.io/schema/vega/v6.json',
          deep: nest(150),
        } as unknown as AnySpec;

        const {rerender} = render(<VegaChart spec={spec} />);
        rerender(<VegaChart spec={spec} />);

        expect(views).toHaveLength(1);
      });

      it('still rebuilds on a shallow change beside a cycle', () => {
        const spec: Record<string, unknown> = {
          $schema: 'https://vega.github.io/schema/vega/v6.json',
          background: 'red',
        };
        spec.self = spec;
        const {rerender} = render(
          <VegaChart spec={spec as unknown as AnySpec} />,
        );

        spec.background = 'blue';
        rerender(<VegaChart spec={spec as unknown as AnySpec} />);

        expect(views).toHaveLength(2);
      });
    });

    // `data` is documented as initial values, read once per View. It used to
    // sit in the Effect's dependencies, so the documented usage -- an inline
    // `data={{table: rows}}` -- tore the View down on every parent render.
    it('keeps the View when only data changes', () => {
      const {rerender} = render(
        <VegaChart spec={VEGA_SPEC} data={{table: [{a: 1}]}} />,
      );
      expect(views).toHaveLength(1);
      expect(views[0].data).toHaveBeenCalledTimes(1);

      rerender(<VegaChart spec={VEGA_SPEC} data={{table: [{a: 2}]}} />);

      expect(views).toHaveLength(1);
      expect(views[0].finalize).not.toHaveBeenCalled();
      // Not reactive: the live View is left exactly as it was.
      expect(views[0].data).toHaveBeenCalledTimes(1);
      expect(views[0].data).toHaveBeenCalledWith('table', [{a: 1}]);
    });

    it('loads the current data when something else rebuilds the View', () => {
      const {rerender} = render(
        <VegaChart spec={VEGA_SPEC} data={{table: [{a: 1}]}} />,
      );

      rerender(
        <VegaChart
          spec={{...VEGA_SPEC, background: 'red'} as unknown as AnySpec}
          data={{table: [{a: 2}]}}
        />,
      );

      expect(views).toHaveLength(2);
      expect(views[1].data).toHaveBeenCalledWith('table', [{a: 2}]);
    });
  });

  describe('error contract', () => {
    it('reports an unrecognized $schema through onError without constructing a View', () => {
      const onError = vi.fn();
      const badSpec = {$schema: 'https://example.com/nope.json'} as AnySpec;
      const {container} = render(
        <VegaChart spec={badSpec} onError={onError} />,
      );

      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Unrecognized $schema URL');
      expect(compileMock).not.toHaveBeenCalled();
      expect(parseMock).not.toHaveBeenCalled();
      expect(views).toHaveLength(0);
      // The container div still renders; it just stays empty.
      expect(container.firstElementChild?.tagName).toBe('DIV');
    });

    it('routes a synchronous compile failure to onError without constructing a View', () => {
      const onError = vi.fn();
      const boom = new Error('compile exploded');
      compileMock.mockImplementationOnce(() => {
        throw boom;
      });
      render(<VegaChart spec={VEGA_LITE_SPEC} onError={onError} />);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(boom);
      expect(views).toHaveLength(0);
    });

    it('routes a rejected runAsync to onError and suppresses onReady', async () => {
      const onReady = vi.fn();
      const onError = vi.fn();
      render(
        <VegaChart spec={VEGA_SPEC} onReady={onReady} onError={onError} />,
      );

      const failure = new Error('render failed');
      await act(async () => {
        views[0].rejectRun(failure);
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(failure);
      expect(onReady).not.toHaveBeenCalled();
    });

    it('wraps non-Error rejection values in an Error before calling onError', async () => {
      const onError = vi.fn();
      render(<VegaChart spec={VEGA_SPEC} onError={onError} />);

      await act(async () => {
        views[0].rejectRun('oops');
      });

      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('oops');
    });

    it('suppresses onError for rejections that settle after unmount', async () => {
      const onError = vi.fn();
      const {unmount} = render(
        <VegaChart spec={VEGA_SPEC} onError={onError} />,
      );

      unmount();
      await act(async () => {
        views[0].rejectRun(new Error('too late'));
      });

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('ready + teardown lifecycle', () => {
    it('calls onReady with the live View once runAsync resolves', async () => {
      const onReady = vi.fn();
      render(<VegaChart spec={VEGA_SPEC} onReady={onReady} />);

      expect(onReady).not.toHaveBeenCalled();
      await act(async () => {
        views[0].resolveRun();
      });

      expect(onReady).toHaveBeenCalledTimes(1);
      expect(onReady).toHaveBeenCalledWith(views[0]);
    });

    it('invokes the latest onReady identity without rebuilding the View', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const {rerender} = render(<VegaChart spec={VEGA_SPEC} onReady={first} />);
      rerender(<VegaChart spec={VEGA_SPEC} onReady={second} />);

      // Same spec identity -> the Effect must not re-run.
      expect(views).toHaveLength(1);
      await act(async () => {
        views[0].resolveRun();
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith(views[0]);
    });

    it('finalizes the View on unmount after a completed run', async () => {
      const {unmount} = render(<VegaChart spec={VEGA_SPEC} />);
      await act(async () => {
        views[0].resolveRun();
      });
      expect(views[0].finalize).not.toHaveBeenCalled();

      unmount();

      expect(views[0].finalize).toHaveBeenCalledTimes(1);
    });

    it('finalizes again when a cancelled run settles, and never fires onReady', async () => {
      const onReady = vi.fn();
      const {unmount} = render(
        <VegaChart spec={VEGA_SPEC} onReady={onReady} />,
      );

      unmount();
      // Cleanup finalizes immediately, before the pending run settles.
      expect(views[0].finalize).toHaveBeenCalledTimes(1);

      await act(async () => {
        views[0].resolveRun();
      });

      // The cancelled-run branch finalizes a second time -- current behavior.
      expect(views[0].finalize).toHaveBeenCalledTimes(2);
      expect(onReady).not.toHaveBeenCalled();
    });
  });

  describe('container div', () => {
    it('renders a single div and lands className, style, and rest props on it', () => {
      const {container} = render(
        <VegaChart
          spec={VEGA_SPEC}
          className="chart"
          style={{width: 100}}
          id="viz"
          aria-label="Sales chart"
        />,
      );

      expect(container.children).toHaveLength(1);
      const div = container.firstElementChild as HTMLElement;
      expect(div.tagName).toBe('DIV');
      expect(div).toHaveClass('chart');
      expect(div).toHaveStyle({width: '100px'});
      expect(div).toHaveAttribute('id', 'viz');
      expect(div).toHaveAttribute('aria-label', 'Sales chart');
    });

    it('forwards both function and object refs to the container div', () => {
      const seen: Array<HTMLDivElement | null> = [];
      const {container: c1} = render(
        <VegaChart spec={VEGA_SPEC} ref={node => void seen.push(node)} />,
      );
      expect(seen).toEqual([c1.firstElementChild]);

      const objectRef = React.createRef<HTMLDivElement>();
      const {container: c2} = render(
        <VegaChart spec={VEGA_SPEC} ref={objectRef} />,
      );
      expect(objectRef.current).toBe(c2.firstElementChild);
    });
  });
});
