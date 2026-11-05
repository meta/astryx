// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file report.ts
 * @input Uses ./check (BindingResult) and ./contract (PatternContract)
 * @output `summarize` and `formatReport` — the facts a reader needs, kept as
 *   separate facts — plus `blockingResults`, the gate over them, and
 *   `formatFailures`, the reader-legible failure block bindings assert on.
 * @position Reporting layer. Also the gate: `blockingResults` decides what
 *   fails a build.
 *
 * `docs/specs/AST-021/spec.md` FR11 is the whole design here: report patterns,
 * bindings, applicable expectations, passes, known failures, unrun layers, and
 * exemptions SEPARATELY, and never collapse them into one percentage or grade.
 * A pattern with one required failure is not "mostly conformant", and there is
 * no number in this file that could be mistaken for saying it is.
 *
 * SYNC: When ./check.ts gains a status, add it here and to the README table.
 */

import type {PatternContract} from './contract';
import type {BindingResult, ExpectationResult} from './check';

export interface ReportCounts {
  readonly pass: number;
  readonly fail: number;
  readonly knownFailure: number;
  readonly unexpectedPass: number;
  readonly notApplicable: number;
  readonly unrun: number;
}

export interface Report {
  readonly pattern: string;
  readonly bindings: readonly BindingResult[];
  readonly counts: ReportCounts;
  /** Unrun evidence layers, so nothing reads a green run as full coverage. */
  readonly unrunLayers: readonly string[];
  /** Dimensions this pattern does not own, with the owner that does. */
  readonly exemptions: readonly {
    readonly dimension: string;
    readonly owner: string;
    readonly verifiedBy: string;
    readonly reason: string;
    /** True when expectations here cover part of it and the owner holds the rest. */
    readonly remainderOnly: boolean;
    /** For a part-encoded dimension: the expectations that carry the encoded half. */
    readonly encodedBy: readonly string[];
  }[];
}

function count(
  results: readonly ExpectationResult[],
  status: ExpectationResult['status'],
): number {
  return results.filter(result => result.status === status).length;
}

export function summarize<Facts>(
  contract: PatternContract<Facts>,
  bindings: readonly BindingResult[],
): Report {
  const results = bindings.flatMap(binding => binding.results);
  // The layers that were actually out of reach, not the layers the unrun
  // expectations are filed under: an interaction expectation is unrun in jsdom
  // because of BOTH the browser it needs and the tree it reads the result from.
  const unrunLayers = [
    ...new Set(
      results
        .filter(result => result.status === 'unrun')
        .flatMap(result => result.missingLayers ?? [result.evidenceLayer]),
    ),
  ].sort();

  const exemptions = Object.entries(contract.exemptions)
    .flatMap(([dimension, exemption]) =>
      exemption == null
        ? []
        : [
            {
              dimension,
              owner: exemption.owner,
              verifiedBy: exemption.verifiedBy,
              reason: exemption.reason,
              remainderOnly: exemption.coversRemainderOnly === true,
              encodedBy: contract.expectations
                .filter(expectation =>
                  (expectation.covers as readonly string[]).includes(dimension),
                )
                .map(expectation => expectation.id),
            },
          ],
    )
    .sort((a, b) => a.dimension.localeCompare(b.dimension));

  return {
    pattern: contract.pattern,
    bindings,
    counts: {
      pass: count(results, 'pass'),
      fail: count(results, 'fail'),
      knownFailure: count(results, 'known-failure'),
      unexpectedPass: count(results, 'unexpected-pass'),
      notApplicable: count(results, 'not-applicable'),
      unrun: count(results, 'unrun'),
    },
    unrunLayers,
    exemptions,
  };
}

/**
 * Expectations that never actually ran across a whole binding — every state
 * reported `not-applicable` or `unrun`.
 *
 * A gate nothing exercises is not a gate. `definePattern` cannot catch this: it
 * sees the contract, never the bindings, so whether an applicability condition
 * matches any real state is only knowable once a binding has run. A binding
 * asserts on this, so an expectation that quietly applies to nothing — through
 * a condition no state meets, or an escape it always takes — is visible instead
 * of counting as coverage.
 */
export function neverExercised(
  bindings: readonly BindingResult[],
): readonly string[] {
  const seen = new Map<string, boolean>();
  for (const binding of bindings) {
    for (const result of binding.results) {
      const ran =
        result.status !== 'not-applicable' && result.status !== 'unrun';
      seen.set(
        result.expectation,
        (seen.get(result.expectation) ?? false) || ran,
      );
    }
  }
  return [...seen.entries()]
    .filter(([, ran]) => !ran)
    .map(([expectation]) => expectation)
    .sort();
}

/**
 * The results that must fail a build.
 *
 * A `required` expectation that fails is a regression. An unexpected pass is a
 * stale debt record, and AST-021 FR9 requires removing it rather than counting
 * it. An ordinary `advisory` failure reports without gating, including when it
 * differs from recorded advisory debt: AST-020 FR9 says advisory expectations
 * report only. An `unrun` layer gates nothing — it is a coverage fact, reported
 * as one.
 */
export function blockingResults(
  bindings: readonly BindingResult[],
): readonly {binding: BindingResult; result: ExpectationResult}[] {
  return bindings.flatMap(binding =>
    binding.results
      .filter(
        result =>
          result.status === 'unexpected-pass' ||
          (result.status === 'fail' && result.enforcement === 'required'),
      )
      .map(result => ({binding, result})),
  );
}

/** A reader-legible failure block: which binding, which state, which layer, why. */
export function formatFailures(
  blocking: readonly {binding: BindingResult; result: ExpectationResult}[],
): string {
  return blocking
    .map(
      ({binding, result}) =>
        `${binding.binding} [${binding.state}] via ${binding.harness}\n` +
        `  ${result.description}\n` +
        `  evidence layer: ${result.evidenceLayer} · enforcement: ${result.enforcement} · status: ${result.status}\n` +
        `  ${(result.detail ?? '').split('\n').join('\n  ')}`,
    )
    .join('\n\n');
}

/** The full factual report. Counts stay counts; there is no score to quote. */
export function formatReport(report: Report): string {
  const lines: string[] = [];
  lines.push(`Accessibility spec-test report — pattern "${report.pattern}"`);
  lines.push('');
  for (const binding of report.bindings) {
    lines.push(`${binding.binding} [${binding.state}] via ${binding.harness}`);
    for (const result of binding.results) {
      const failureLike =
        result.status === 'fail' ||
        result.status === 'known-failure' ||
        result.status === 'unexpected-pass';
      lines.push(
        `  ${result.status.padEnd(15)} ${failureLike ? result.description : result.expectation} · ${result.evidenceLayer} · ${result.enforcement}`,
      );
      if (failureLike && result.detail != null) {
        lines.push(`    ${result.detail.split('\n').join('\n    ')}`);
      }
    }
    lines.push('');
  }
  const {counts} = report;
  lines.push(
    `pass ${counts.pass} · fail ${counts.fail} · known-failure ${counts.knownFailure} · ` +
      `unexpected-pass ${counts.unexpectedPass} · not-applicable ${counts.notApplicable} · unrun ${counts.unrun}`,
  );
  lines.push(
    report.unrunLayers.length === 0
      ? 'unrun evidence layers: none in this run'
      : `unrun evidence layers: ${report.unrunLayers.join(', ')}`,
  );
  for (const exemption of report.exemptions) {
    // A dimension this pattern owns PART of reads differently from one it does
    // not own at all, and collapsing the two would overstate the second.
    lines.push(
      exemption.remainderOnly
        ? `part-encoded ${exemption.dimension} — encoded by ${exemption.encodedBy.join(', ')}; remainder → ${exemption.owner} (${exemption.verifiedBy})`
        : `exempt ${exemption.dimension} → ${exemption.owner} (${exemption.verifiedBy})`,
    );
  }
  return lines.join('\n');
}
