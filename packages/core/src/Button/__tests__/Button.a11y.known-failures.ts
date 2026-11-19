// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output BUTTON_KNOWN_FAILURES — the exact outcomes a component that adopts the
 *   button pattern does not deliver yet, each scoped to one expectation, one
 *   binding, one state, and one exact public-safe failure record.
 * @position Recorded debt, not permission. `docs/specs/AST-021/spec.md` FR8–FR10
 *   govern this: FR8 requires every record to name the expectation, binding,
 *   state, user impact, standards reference, evidence layer, exact failure, and
 *   reason;
 *   FR9 is the exact gate — the expectation still RUNS and reports
 *   `known-failure`, never `pass`, and "a different error, another state, a new
 *   expectation, or a wider failure MUST fail". When the component is fixed the
 *   record stops matching and the run reports `unexpected-pass`, which gates, so
 *   a fix cannot land while leaving a stale record behind.
 *
 * A record is never a way to make a run green. It says, in public and in one
 * place, precisely what is broken; operational ownership stays outside source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const BUTTON_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
