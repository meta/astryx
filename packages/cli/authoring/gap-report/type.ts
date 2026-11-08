// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public type surface for gap-report handlers.
 *
 * A handler receives a normalized gap report and routes it to a destination.
 * Project config may define one (`gapReport` in `astryx.config`); every loaded
 * integration may export one as a `gapReport` NAMED export. The CLI composes
 * them additively: project handler first, then each integration handler in
 * config order. Every handler receives a `structuredClone` of the same
 * normalized report.
 *
 * This module is the shared authoring surface for both config and integration
 * gap-report handlers.
 */

import type {DebugInvocationSource} from '../debug/type.js';

/** Supported gap-report categories. */
export type GapReportCategory =
  | 'missing_component'
  | 'missing_variant'
  | 'layout_gap'
  | 'styling_gap'
  | 'a11y_gap'
  | 'api_friction'
  | 'docs_gap'
  | 'other';

/**
 * The normalized report event handed to each handler. Plain camelCase,
 * with no handler-private context.
 */
export interface GapReport {
  schemaVersion: 1;
  component: string;
  category: GapReportCategory;
  categoryLabel: string;
  intention: string;
  detail?: string;
  source: DebugInvocationSource;
  timestamp: string;
  target: GapReportTarget;
}

/** The package a gap report describes. */
export interface GapReportTarget {
  package: string;
  version: string | null;
  issuesUrl: string | null;
}

/**
 * What a handler returns. Strict: unknown fields are invalid, and an invalid
 * return is recorded as a failed delivery.
 *
 * - `filed` — the handler created or queued the report.
 * - `routed_only` — the handler pointed at a destination but did not create
 *   the report itself; `url` is REQUIRED.
 * - `skipped` — the handler chose not to act (e.g. deduplication).
 *
 * At least `url` or `message` must be present where applicable (filed or
 * routed_only).
 */
export interface GapReportHandlerReceipt {
  status: 'filed' | 'routed_only' | 'skipped';
  /** HTTP(S) URL. Required when status is `routed_only`. */
  url?: string;
  /** Human-readable message, at most 2000 characters. */
  message?: string;
}

/** Context for one handler invocation. */
export interface GapReportHandlerContext {
  /** Aborted when the handler exceeds its 30-second budget. */
  readonly signal: AbortSignal;
}

/**
 * A handler that receives a normalized gap report. Use a plain object, not a
 * bare function or callable-with-properties.
 *
 * ```
 * export const gapReport = {
 *   audience: 'public',
 *   handle: async (report) => ({status: 'filed', url: '...'}),
 * };
 * ```
 *
 * The handler is called with `structuredClone(report)`, so mutations are
 * harmless. It may be sync or async; async handlers are awaited with a 30 s
 * timeout. A throw, timeout, or `process.exit` attempt becomes a failed
 * delivery — later handlers still run. Handler stdout is redirected to stderr
 * so JSON stdout remains one envelope.
 */
export interface GapReportHandler {
  /** Whether the handler's destination is organization-internal or public. */
  audience: 'internal' | 'public';
  /**
   * Called with a normalized, cloned report and an abort signal. Return a strict
   * receipt. Async handlers are awaited with a 30 s timeout.
   */
  handle: (
    report: GapReport,
    context: GapReportHandlerContext,
  ) => GapReportHandlerReceipt | Promise<GapReportHandlerReceipt>;
}
