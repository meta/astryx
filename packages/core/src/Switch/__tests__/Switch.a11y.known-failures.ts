// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output SWITCH_KNOWN_FAILURES — the switch-pattern outcomes Switch does not
 *   deliver today, each pinned to one expectation, binding, state, and layer.
 * @position Read by both Switch bindings. Nothing here is a pass: a recorded
 *   failure still runs, still fails, and is reported as debt.
 *
 * `docs/specs/AST-021/spec.md` FR8–FR10 govern this file:
 *
 * - a record names the expectation, binding, state, evidence layer, exact
 *   failure, user impact, and why the migration does not fix it;
 * - it covers only that exact failure — a different message, another state, or
 *   a wider failure still fails the build;
 * - when the outcome starts passing, the run reports an unexpected pass and the
 *   record must be deleted rather than left standing.
 *
 * Adding or widening a record after the baseline is an owner decision with a
 * linked defect, not a routine test update.
 *
 * SYNC: Deleting a record should close, or follow, its linked issue.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const SWITCH_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
