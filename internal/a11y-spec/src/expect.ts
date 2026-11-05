// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expect.ts
 * @input Uses the accessibility spec checker, jsdom harness, and failure formatter
 * @output `expectAccessibilitySpec` — the component-facing assertion helper with
 *   explicit render and subject seams
 * @position Test API. Component suites use this; reports and mutation proof use
 *   the lower-level `checkAccessibilitySpec` evaluator.
 */

import type {PatternContract} from './contract';
import {createJsdomHarness} from './harness/jsdom';
import {blockingResults, formatFailures} from './report';
import {
  checkAccessibilitySpec,
  type BindingResult,
  type CheckAccessibilitySpecOptions,
} from './check';

export interface ExpectAccessibilitySpecOptions<Facts> extends Omit<
  CheckAccessibilitySpecOptions<Facts>,
  'spec' | 'mount' | 'unmount'
> {
  /** The reusable accessibility specification this component state adopts. */
  readonly spec: PatternContract<Facts>;
  /** Render the actual component state under test. Called fresh per expectation. */
  readonly render: () => Promise<void> | void;
  /** Resolve the role-bearing element the specification checks. */
  readonly subject: () => Promise<Element> | Element;
  readonly related?: () =>
    | Promise<Readonly<Record<string, Element>>>
    | Readonly<Record<string, Element>>;
  /** Remove the rendered state between expectations. */
  readonly cleanup?: () => Promise<void> | void;
}

/**
 * Check one rendered component state and fail the test when a required
 * accessibility expectation fails or a known failure unexpectedly passes.
 */
export async function expectAccessibilitySpec<Facts>(
  options: ExpectAccessibilitySpecOptions<Facts>,
): Promise<BindingResult> {
  const {spec, render, subject, related, cleanup, ...binding} = options;
  const result = await checkAccessibilitySpec({
    ...binding,
    spec,
    mount: async () => {
      await render();
      return createJsdomHarness({
        subject: await subject(),
        related: await related?.(),
      });
    },
    unmount: cleanup,
  });
  const failures = formatFailures(blockingResults([result]));
  if (failures !== '') {
    throw new Error(`Accessibility specification failed:\n\n${failures}`);
  }
  return result;
}
