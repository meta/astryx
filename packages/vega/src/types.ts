// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input Vega and Vega-Lite spec types, and the Astryx Vega wrapper API surface
 * @output Shared TypeScript types for @astryxdesign/vega
 * @position Type definitions; imported by all components in this package
 *
 * SYNC: When modified, update /packages/vega/README.md
 */

import type React from 'react';
import type {Spec as VegaSpec, Config, View, ViewOptions} from 'vega';
import type {LoggerInterface} from 'vega-util';
import type {
  TopLevelSpec as VegaLiteSpec,
  Config as VegaLiteConfig,
} from 'vega-lite';

export type {
  VegaSpec,
  VegaLiteSpec,
  Config,
  View,
  ViewOptions,
  LoggerInterface,
};

/**
 * Options for the Vega-Lite `compile()` function.
 *
 * Mirrors `CompileOptions` from `vega-lite/src/compile/compile.ts`, which is
 * not part of the public vega-lite export surface, so we redeclare it here.
 *
 * @see https://github.com/vega/vega-lite/blob/main/src/compile/compile.ts
 */
export interface CompileOptions {
  /**
   * Vega-Lite config merged on top of the spec's own config before compilation.
   */
  config?: VegaLiteConfig;
  /**
   * Custom logger used during compilation.
   * @see https://github.com/vega/vega/blob/main/packages/vega-util/src/logger.ts
   */
  logger?: LoggerInterface;
  /**
   * Custom field title formatter. Overrides the global singleton used by
   * vega-lite to produce axis/legend/header titles from field definitions.
   *
   * Typed loosely to avoid coupling to vega-lite's unexported internal types.
   */
  // Typed loosely to avoid coupling to vega-lite's unexported internal types.
  fieldTitle?: (...args: unknown[]) => string;
}

/**
 * A spec accepted by `<VegaChart>`. Must include a `$schema` field --
 * the component uses it to decide whether to compile (Vega-Lite) or
 * render directly (Vega).
 */
export type AnySpec = (VegaSpec | VegaLiteSpec) & {$schema: string};

/**
 * Options forwarded to `vega.parse(spec, config, parseOptions)`.
 * @see https://vega.github.io/vega/docs/api/view/#view_parse
 */
export interface ParseOptions {
  /**
   * When `true`, the parser retains the abstract syntax tree (AST) of
   * Vega expressions in the runtime instead of compiling them with the
   * Function constructor. Pair it with `viewOptions.expr` set to
   * `vega-interpreter`'s evaluator to run spec expressions interpreted —
   * the required configuration for specs you didn't author (see
   * "Untrusted specs" in the README). Also useful for introspection and
   * tooling. Defaults to `false`.
   */
  ast?: boolean;
}

/**
 * Initial data to load into named Vega datasets after the View is created,
 * before the first render.
 *
 * Each key is a dataset name matching a `data` entry in the Vega spec.
 * Each value is the array of tuples passed to `view.data(name, tuples)`.
 *
 * This mirrors the setter overload of the View data API:
 *   `view.data(name: string, tuples: any[]): this`
 *
 * @see https://vega.github.io/vega/docs/api/view/#view_data
 *
 * @example
 * ```
 * data={{
 *   table: [{category: 'A', value: 28}, {category: 'B', value: 55}],
 * }}
 * ```
 */
export type ViewData = Record<string, unknown[]>;

/**
 * Props for the `<VegaChart>` component.
 *
 * Extends `React.HTMLAttributes<HTMLDivElement>` (minus `contentEditable`,
 * `dangerouslySetInnerHTML`) for full DOM event passthrough — drag, pointer,
 * keyboard, clipboard, `data-testid`, etc.
 *
 * Note: unlike other Astryx components, this component does not accept `xstyle`
 * because `@astryxdesign/vega` does not depend on StyleX. Use `className` or `style`
 * for layout overrides instead.
 */
export interface VegaChartProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  | 'contentEditable'
  | 'dangerouslySetInnerHTML'
  | 'suppressContentEditableWarning'
  | 'suppressHydrationWarning'
  | 'onError'
> {
  /**
   * Ref forwarded to the root container div.
   */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * A Vega or Vega-Lite specification object.
   *
   * Must include a `$schema` field matching the official Vega schema URL
   * format: `https://vega.github.io/schema/{vega|vega-lite}/{version}.json`
   *
   * The component inspects `$schema` to determine how to handle the spec:
   * - `vega-lite` -> compiled to Vega via `vega-lite`'s `compile()`, then rendered
   * - `vega` -> rendered directly without compilation
   *
   * **A spec is a program, not just data.** Vega evaluates the expression
   * strings inside a spec (signals, event streams, encodings, filters) and,
   * by default, compiles them with the Function constructor; a spec's data
   * sources can also name URLs the default loader will fetch, including
   * signal-built ones. Only render specs you author or review. For specs
   * from users, documents, or model output, wire the interpreter and a
   * restricted loader — see "Untrusted specs" in the README — and treat that
   * configuration as required, not optional.
   *
   * @see https://vega.github.io/vega/docs/specification/
   * @see https://vega.github.io/vega-lite/docs/spec.html
   * @see https://vega.github.io/vega/usage/interpreter/
   */
  spec: AnySpec;
  /**
   * Initial data for named Vega datasets, applied via `view.data(name, tuples)`
   * after the View is created and before the first render.
   *
   * This prop is *not reactive* — it is only read during View initialization.
   * Changes after mount are ignored. To update data dynamically, use `onReady`
   * to access the live View and call `view.data(name, tuples)` + `view.runAsync()`
   * directly.
   *
   * Each key must match a dataset name defined in the spec's `data` array.
   *
   * @see https://vega.github.io/vega/docs/api/view/#view_data
   */
  data?: ViewData;
  /**
   * Options passed to `vega-lite`'s `compile()` function.
   * Only applied when `spec.$schema` identifies a `vega-lite` spec.
   * Ignored for native Vega specs.
   * @see https://github.com/vega/vega-lite/blob/main/src/compile/compile.ts
   */
  compileOptions?: CompileOptions;
  /**
   * Vega config object passed as the second argument to `vega.parse()`.
   * Overrides config values embedded in the spec.
   * @see https://vega.github.io/vega/docs/config/
   */
  parseConfig?: Config;
  /**
   * Options passed as the third argument to `vega.parse()`.
   * Currently only supports `{ ast: boolean }`.
   * @see https://vega.github.io/vega/docs/api/view/#view_parse
   */
  parseOptions?: ParseOptions;
  /**
   * Options passed directly to `new vega.View(runtime, viewOptions)`.
   * Controls renderer backend, logger, tooltip handler, locale, loader,
   * background color, hover behavior, and more.
   *
   * Note: `container` is always set by the component and will be overridden.
   *
   * @see https://vega.github.io/vega/docs/api/view/
   */
  viewOptions?: Omit<ViewOptions, 'container'>;
  /**
   * Called with the live Vega `View` once the chart has rendered.
   * Use this to attach signal listeners, stream data, or drive animations.
   */
  onReady?: (view: View) => void;
  /**
   * Called when the `$schema` is invalid, compilation fails, or the
   * Vega runtime throws during rendering.
   */
  onError?: (error: Error) => void;
}
