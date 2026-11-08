// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VegaChart.tsx
 * @input A Vega or Vega-Lite spec (distinguished by $schema), parse config/options, view options, and data
 * @output A React component that renders the spec via the Vega runtime
 * @position Primary component in @astryxdesign/vega; owns the Vega View lifecycle
 *
 * SYNC: When modified, update:
 * - /packages/vega/src/VegaChart.doc.mjs
 * - /packages/vega/README.md
 */

import React, {useEffect, useEffectEvent, useRef, useState} from 'react';
import {parse, View} from 'vega';
import {compile} from 'vega-lite';
import {parseSchema} from './schema';
import {latchViewInputs, latchIsCurrent} from './viewInputs';
import type {ViewInputs} from './viewInputs';
import type {VegaChartProps, VegaSpec, VegaLiteSpec} from './types';

/**
 * `VegaChart` renders a Vega or Vega-Lite specification using the Vega runtime.
 *
 * The component inspects `spec.$schema` to determine how to handle the spec:
 * - `vega-lite` schema -> compiled to Vega via `vega-lite`'s `compile()`, then rendered
 * - `vega` schema -> rendered directly without compilation
 * - Invalid / missing `$schema` -> calls `onError` and renders nothing
 *
 * Parse and view construction are fully configurable via `parseConfig`,
 * `parseOptions`, and `viewOptions`, which map directly to the Vega API:
 *
 *   vega.parse(spec, parseConfig, parseOptions)
 *   new vega.View(runtime, { ...viewOptions, container })
 *
 * Initial dataset values can be provided via `data`. They are loaded once
 * during View initialization, before the first render, and are not reactive:
 * a change to `data` alone never rebuilds the View, and is not applied to the
 * live one. Use `onReady` to drive data after mount.
 *
 * It owns the full `View` lifecycle: creates the view on mount, re-creates
 * it when `spec`, `compileOptions`, `parseConfig`, `parseOptions`, or
 * `viewOptions` changes, and calls `view.finalize()` on cleanup to release
 * all runtime resources.
 *
 * "Changes" means the value changed, not the reference: those props are
 * compared by value against a copy taken when the live View was built, so an
 * inline spec or options object rebuilt on every render keeps the live View
 * (and its zoom, hover, and signal state), while a spec mutated in place is
 * still picked up. Nothing needs to be memoized for either to hold.
 *
 * Callbacks (`onReady`, `onError`) are non-reactive Effect Events -- they
 * always see the latest props and never re-run the View lifecycle, so you
 * don't need to memoize them.
 *
 * Note: this component does not accept `xstyle` because `@astryxdesign/vega` does not
 * depend on StyleX. Use `className` or `style` for layout overrides.
 *
 * @example
 * ```
 * import {VegaChart} from '@astryxdesign/vega';
 *
 * // Vega-Lite spec -- compiled automatically
 * <VegaChart
 *   spec={{
 *     $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
 *     mark: 'bar',
 *     data: {name: 'table'},
 *     encoding: {
 *       x: {field: 'a', type: 'ordinal'},
 *       y: {field: 'b', type: 'quantitative'},
 *     },
 *   }}
 *   data={{table: [{a: 'A', b: 28}, {a: 'B', b: 55}]}}
 * />
 *
 * // Vega spec -- rendered directly
 * <VegaChart
 *   spec={{$schema: 'https://vega.github.io/schema/vega/v5.json', marks: []}}
 *   parseConfig={{background: '#1a1a1a'}}
 *   viewOptions={{logLevel: 1, tooltip: myTooltipHandler}}
 * />
 * ```
 */
export function VegaChart({
  spec,
  data,
  compileOptions,
  parseConfig,
  parseOptions,
  viewOptions,
  className,
  style,
  ref,
  onReady: onReadyProp,
  onError: onErrorProp,
  ...props
}: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Rebuild only when a value the runtime is built from actually differs.
  // The latch holds both the props the live View was built from and a copy of
  // their values, so a spec mutated in place is caught too -- comparing
  // against the previous props could not see that, because a mutation leaves
  // both sides pointing at the same object. Updating state during render is
  // React's own way to derive state from props; the check is reflexive, so it
  // settles in one extra pass.
  const inputs: ViewInputs = {
    spec,
    compileOptions,
    parseConfig,
    parseOptions,
    viewOptions,
  };
  const [latch, setLatch] = useState(() => latchViewInputs(inputs));
  if (!latchIsCurrent(latch, inputs)) {
    setLatch(latchViewInputs(inputs));
  }

  // The Effect fires these callbacks without treating them as reactive
  // dependencies, so the View isn't torn down and rebuilt when a parent
  // passes fresh inline callbacks on every render.
  const onReady = useEffectEvent((view: View) => {
    onReadyProp?.(view);
  });
  const onError = useEffectEvent((error: Error) => {
    onErrorProp?.(error);
  });

  // Same treatment for `data`: an Effect Event reads the latest value at View
  // initialization without making `data` a reactive dependency. That is the
  // documented contract -- initial dataset values, applied once per View,
  // never reactive -- and it keeps a fresh `data` object literal from tearing
  // down a perfectly good View on every parent render.
  const loadInitialData = useEffectEvent((view: View) => {
    if (!data) {
      return;
    }
    for (const [name, tuples] of Object.entries(data)) {
      view.data(name, tuples);
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Read from the latch, never the props: these are the values the live
    // View is built from, and they only change when a value changes. The
    // caller's own objects are handed to Vega, not the comparison copy.
    const {spec} = latch.inputs;
    let cancelled = false;
    let view: View | null = null;

    const fail = (err: unknown) => {
      if (!cancelled) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    try {
      // Validate $schema and resolve the library kind.
      const schemaResult = parseSchema(spec.$schema);
      if (!schemaResult.ok) {
        fail(new Error(schemaResult.error));
        return;
      }

      // Compile Vega-Lite -> Vega if needed; otherwise use the spec directly.
      const vegaSpec: VegaSpec =
        schemaResult.library === 'vega-lite'
          ? compile(spec as VegaLiteSpec, latch.inputs.compileOptions).spec
          : (spec as VegaSpec);

      // parse(spec, config?, options?) -> Runtime
      const runtime = parse(
        vegaSpec,
        latch.inputs.parseConfig,
        latch.inputs.parseOptions,
      );

      // new View(runtime, viewOptions) -- container is always injected by us.
      view = new View(runtime, {
        hover: true,
        ...latch.inputs.viewOptions,
        container,
      });

      // Load initial data into named datasets before the first render.
      // data is not reactive -- changes after mount are ignored.
      loadInitialData(view);

      view
        .runAsync()
        .then(() => {
          if (cancelled) {
            view?.finalize();
            return;
          }
          if (view) {
            onReady(view);
          }
        })
        .catch(fail);
    } catch (err) {
      fail(err);
    }

    return () => {
      cancelled = true;
      view?.finalize();
    };
  }, [latch]);

  return (
    <div
      ref={node => {
        containerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      className={className}
      style={style}
      {...props}
    />
  );
}

VegaChart.displayName = 'VegaChart';
