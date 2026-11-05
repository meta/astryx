// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract.ts
 * @input Uses ./checklist (completeness dimensions) and ./harness (evidence layers)
 * @output The accessibility spec-test contract vocabulary — NormativeSource,
 *   Expectation, PatternContract — plus `definePattern`, the constructor that
 *   refuses a contract which is not traceable, applicable, layered, and
 *   enforceable, and `unansweredDimensions`, the completeness check.
 * @position Foundation of @astryxdesign/a11y-spec. Every pattern, binding,
 *   runner, and report is expressed in these types.
 *
 * The rules encoded here come from the accepted accessibility spec-test
 * authoring record, `docs/specs/AST-020/spec.md`:
 *
 * - FR1  a WCAG 2.2 A/AA criterion is the conformance basis; an APG-primary
 *        expectation must still name the WCAG outcome it supports.
 * - FR4  every expectation carries a stable id, a user outcome, an exact
 *        normative source, applicability, an evidence layer, and enforcement,
 *        and exposes its id and source in test names and failure output.
 * - FR5  every checklist dimension is either encoded or exempted with a named
 *        owner; silence is not an exemption and neither is "not applicable".
 * - FR6  evidence layers keep distinct proof boundaries.
 * - FR9  enforcement is separate from severity and from tool coverage.
 * - FR14 ids survive refactors.
 *
 * FR5 is split across two places on purpose. The half a single expectation can
 * break — an unknown dimension, an exemption with no owner, a dimension claimed
 * twice — is refused here, at construction. Whether the pattern as a whole has
 * answered every dimension is `unansweredDimensions`, asserted by the pattern's
 * own suite: a contract under construction is incomplete by definition, and a
 * constructor that throws on it cannot be developed one expectation at a time.
 *
 * SYNC: When the shape of an expectation changes, update
 * - /internal/a11y-spec/README.md (the authoring guide)
 * - /internal/a11y-spec/src/patterns/switch.ts (the reference pattern)
 */

import {
  CHECKLIST_DIMENSIONS,
  type ChecklistDimensionId,
  type ChecklistExemption,
} from './checklist';
import {EVIDENCE_LAYERS, type EvidenceLayer, type Harness} from './harness';

/** How a failing expectation is treated by a gate (AST-020 FR9). */
export type Enforcement = 'required' | 'advisory';

/** A WCAG 2.2 success criterion. */
export interface WcagCriterion {
  readonly standard: 'wcag';
  /** Success-criterion number, e.g. `4.1.2`. */
  readonly id: string;
  /** Short name, e.g. `Name, Role, Value`. */
  readonly name: string;
  readonly level: 'A' | 'AA' | 'AAA';
  readonly url: string;
}

/** An exact requirement quoted from a WAI-ARIA APG pattern. */
export interface ApgRequirement {
  readonly standard: 'apg';
  /** APG pattern slug, e.g. `switch`. */
  readonly pattern: string;
  /** The requirement, quoted closely enough to find on the page. */
  readonly requirement: string;
  readonly url: string;
}

/** An exact requirement from a versioned public web standard. */
export interface WebStandardRequirement {
  readonly standard: 'web-standard';
  /** Specification and version, e.g. `WAI-ARIA 1.2`. */
  readonly specification: string;
  /** The requirement, quoted closely enough to find on the page. */
  readonly requirement: string;
  readonly url: string;
}

/** A current Astryx knowledge record that adopts an outcome. */
export interface AstryxRecord {
  readonly standard: 'astryx';
  /** The record's own stable id, e.g. `spec:AST-013` or `family:buttons`. */
  readonly id: string;
  /** The clause within it, e.g. `FR3`. */
  readonly clause: string;
  /**
   * The requirement, quoted exactly — the same discipline the APG sources
   * follow. A citation a reader cannot check against the record is not a
   * citation, and an id alone does not say what was adopted.
   */
  readonly requirement: string;
  /**
   * A public URL pinned to the bytes this quote was taken from. `main` moves;
   * a citation that moves with it is a citation to whatever the record becomes,
   * which is exactly what a normative reference must not be.
   */
  readonly url: string;
}

export type NormativeSource =
  WcagCriterion | ApgRequirement | WebStandardRequirement | AstryxRecord;

/** One-line citation, used in test names and failure output (AST-020 FR4). */
export function citeSource(source: NormativeSource): string {
  switch (source.standard) {
    case 'wcag':
      return `WCAG 2.2 ${source.id} ${source.name} (${source.level})`;
    case 'apg':
      return `APG ${source.pattern}: ${source.requirement}`;
    case 'web-standard':
      return `${source.specification}: ${source.requirement}`;
    case 'astryx':
      return `Astryx ${source.id} ${source.clause}: ${source.requirement}`;
  }
}

/**
 * When an expectation applies to a binding's state. Both halves are required:
 * the prose is what a reader sees on a `not-applicable` result, the predicate
 * is what the runner obeys (AST-020 FR4, FR5).
 */
export interface Applicability<Facts> {
  readonly condition: string;
  readonly test: (facts: Facts) => boolean;
}

/**
 * Thrown by an expectation that can only discover it does not apply once it has
 * looked at the page. Prefer `appliesWhen`, which is declared and readable; use
 * this only when the condition is itself an observation.
 *
 * The runner turns it into `not-applicable`, never into a pass. That is the
 * whole point: an expectation that returned early would report `pass`, and a
 * pass is a claim that the outcome was observed.
 */
export class NotApplicableHere extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'NotApplicableHere';
  }
}

/** What the browser observed at the first focus entry into the mounted subject. */
export interface InitialFocusEntryObservation {
  readonly subjectWasModal: boolean;
}

/** What an expectation is handed when it runs. */
export interface ExpectationContext<Facts> {
  readonly harness: Harness;
  /** The element the binding designates as the pattern's control. */
  readonly subject: Awaited<ReturnType<Harness['subject']>>;
  /** What the binding declares this state is supposed to be. */
  readonly facts: Facts;
  /**
   * Declare, mid-run, that this state cannot exercise the outcome — the page
   * turned out not to have what the expectation is about. The result is
   * `not-applicable` with this reason, and the run is over.
   *
   * Every use is visible in the report, so an expectation cannot quietly
   * excuse itself: a reader sees which states did not exercise it.
   */
  readonly notApplicable: (reason: string) => never;
  /**
   * How many times the control's action has run since it was mounted.
   *
   * Some patterns have no state to read. A switch says whether it is on, so
   * "pressing it worked" is observable from the control itself; a button's
   * action leaves no trace on the button at all. The BINDING knows — it renders
   * the component and can count the handler — so it supplies this and the
   * contract asks.
   *
   * A binding that does not supply it makes every expectation reading it fail
   * as a harness fault, loudly, rather than quietly passing.
   */
  readonly activations: () => Promise<number>;
  /**
   * The first focus entry into the mounted subject, captured by the binding from
   * browser events that occurred before the expectation began sampling state.
   * A binding that cannot supply it fails as a binding fault rather than turning
   * a missing observation into a contract result.
   */
  readonly initialFocusEntry: () => Promise<InitialFocusEntryObservation>;
  /** Ask the binding to perform one named public state transition. */
  readonly transition: (name: string) => Promise<void>;
}

export interface Expectation<Facts> {
  /**
   * Stable id, `<pattern>.<area>.<outcome>`. Ids survive refactors; splitting,
   * combining, or narrowing one is a contract change with a migration for every
   * binding and known-failure record that names it (AST-020 FR14).
   */
  readonly id: string;
  /** The user outcome, in one plain-language line. */
  readonly outcome: string;
  /** Exact normative sources. The first is primary and names the test. */
  readonly sources: readonly [NormativeSource, ...NormativeSource[]];
  /**
   * The WCAG 2.2 user outcome an APG-primary expectation supports. Required
   * when the primary source is APG, so an APG mechanic is never presented as a
   * success criterion of its own (AST-020 FR1).
   */
  readonly wcagOutcome?: string;
  /** The completeness dimensions this expectation carries (AST-020 FR5, FR10). */
  readonly covers: readonly ChecklistDimensionId[];
  readonly appliesWhen: Applicability<Facts>;
  /**
   * The layer that characterizes this expectation's claim. It names the
   * expectation in reports, and a known-failure record must match it.
   */
  readonly evidenceLayer: EvidenceLayer;
  /**
   * Any further layer the expectation's own body reads. An interaction
   * expectation is the usual case: the claim is a real-browser one — clicking
   * turns the switch on — but reading the resulting state is an
   * accessibility-tree observation, so the expectation cannot run without both.
   * A harness missing any of these reports `unrun`; it must not fail as though
   * the outcome were absent (AST-020 platform support).
   */
  readonly alsoNeeds?: readonly EvidenceLayer[];
  readonly enforcement: Enforcement;
  /**
   * Why an `advisory` expectation does not gate. Required for every advisory
   * expectation, so "advisory" is a recorded judgement about adoption rather
   * than a quiet way to stop a check from mattering (AST-020 FR9).
   */
  readonly advisoryBecause?: string;
  /** Throws (or rejects) with a reader-legible message when the outcome is absent. */
  readonly run: (context: ExpectationContext<Facts>) => Promise<void>;
}

export interface PatternContract<Facts> {
  /** Stable pattern id, e.g. `switch` or `text-input`. */
  readonly pattern: string;
  /** The pattern's canonical public normative URL. */
  readonly url: string;
  /** What the pattern owns, in one line, for report headers. */
  readonly scope: string;
  readonly expectations: readonly Expectation<Facts>[];
  /** Dimensions this pattern does not own, each naming who does (AST-020 FR5). */
  readonly exemptions: Readonly<
    Partial<Record<ChecklistDimensionId, ChecklistExemption>>
  >;
}

/**
 * Every layer an expectation needs before it can run: the one that
 * characterizes its claim, plus any further layer its body reads.
 */
export function requiredLayers<Facts>(
  expectation: Expectation<Facts>,
): readonly EvidenceLayer[] {
  return [expectation.evidenceLayer, ...(expectation.alsoNeeds ?? [])];
}

/**
 * A public GitHub URL pinned to one commit.
 *
 * A full 40-character sha, not a branch or a tag: both move, and a normative
 * citation that moves cites whatever the record later becomes. Public GitHub
 * rather than any https URL, because a link into an internal system is one a
 * reviewer of this repository cannot open — and must never appear in it.
 */
const PINNED_PUBLIC_SOURCE =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/blob\/[0-9a-f]{40}\/\S+$/;

/** Test name and failure prefix. Carries the id and the source (AST-020 FR4). */
export function describeExpectation<Facts>(
  expectation: Expectation<Facts>,
): string {
  return `${expectation.id} [${citeSource(expectation.sources[0])}] ${expectation.outcome}`;
}

/** The dimensions at least one expectation carries. */
function coveredDimensions<Facts>(
  contract: PatternContract<Facts>,
): readonly ChecklistDimensionId[] {
  return [
    ...new Set(
      contract.expectations.flatMap(expectation => expectation.covers),
    ),
  ].sort();
}

/**
 * The completeness dimensions this pattern has neither encoded nor exempted.
 * A finished pattern returns an empty list; anything else is a dimension that
 * would otherwise disappear silently (AST-020 FR5, FR10, FR12).
 */
export function unansweredDimensions<Facts>(
  contract: PatternContract<Facts>,
): readonly ChecklistDimensionId[] {
  const covered = new Set(coveredDimensions(contract));
  return CHECKLIST_DIMENSIONS.map(dimension => dimension.id).filter(
    id => !covered.has(id) && contract.exemptions[id] == null,
  );
}

const ID_SHAPE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const EMPTY_EXEMPTION =
  /^(n\/?a|not applicable|none|unknown|tbd|does not apply)\.?$/i;
const DIMENSION_IDS: readonly string[] = CHECKLIST_DIMENSIONS.map(
  dimension => dimension.id,
);

/**
 * Build a pattern contract, refusing one that cannot be audited.
 *
 * A contract that omits a source, an evidence layer, an applicability
 * condition, or an exemption's owner is not "less complete" — it is rejected.
 * Silence is the failure mode AST-020 is written against, so it is the one this
 * constructor makes impossible.
 */
export function definePattern<Facts>(
  contract: PatternContract<Facts>,
): PatternContract<Facts> {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const expectation of contract.expectations) {
    const {id} = expectation;
    if (!ID_SHAPE.test(id)) {
      problems.push(
        `expectation id ${JSON.stringify(id)} must look like "pattern.area.outcome"`,
      );
    }
    if (!id.startsWith(`${contract.pattern}.`)) {
      problems.push(
        `expectation ${id} does not belong to pattern ${contract.pattern}`,
      );
    }
    if (seen.has(id)) {
      problems.push(`duplicate expectation id ${id}`);
    }
    seen.add(id);

    if (expectation.outcome.trim() === '') {
      problems.push(`${id} states no user outcome`);
    }
    if (expectation.sources.length === 0) {
      problems.push(`${id} cites no normative source`);
    }
    // An Astryx record can make an expectation gate (FR9), so a citation nobody
    // can check is not good enough: it must say WHICH record, WHICH clause,
    // quote the requirement, and link to bytes that cannot move underneath it.
    for (const source of expectation.sources) {
      if (source.standard !== 'astryx') {
        continue;
      }
      for (const [field, value] of [
        ['id', source.id],
        ['clause', source.clause],
        ['requirement', source.requirement],
      ] as const) {
        if (value.trim() === '') {
          problems.push(
            `${id} cites an Astryx record with no ${field} (AST-020 FR1)`,
          );
        }
      }
      // One exact shape, rather than a list of the ways a URL can go wrong.
      // Anything looser lets through the two failures that matter: a link only
      // this checkout can open, and a link whose bytes move out from under the
      // quote — `main`, `HEAD`, a tag, a branch named anything at all.
      if (!PINNED_PUBLIC_SOURCE.test(source.url)) {
        problems.push(
          `${id} cites Astryx record "${source.id}" at "${source.url}". A record cited by a contract has to be readable by anyone reviewing it and pinned to the bytes the requirement was quoted from, so the URL must look like https://github.com/<org>/<repo>/blob/<full commit sha>/<path> (AST-020 FR1)`,
        );
      }
    }
    if (
      expectation.sources[0]?.standard === 'apg' &&
      (expectation.wcagOutcome ?? '').trim() === ''
    ) {
      problems.push(
        `${id} is APG-primary, so it must name the WCAG 2.2 outcome it supports (AST-020 FR1)`,
      );
    }
    if (expectation.covers.length === 0) {
      problems.push(`${id} carries no completeness dimension (AST-020 FR5)`);
    }
    for (const dimension of expectation.covers) {
      if (!DIMENSION_IDS.includes(dimension)) {
        problems.push(
          `${id} claims unknown completeness dimension "${dimension}"`,
        );
      }
      const exemption = contract.exemptions[dimension];
      if (exemption != null && exemption.coversRemainderOnly !== true) {
        problems.push(
          `"${dimension}" is both encoded by ${id} and exempted; a dimension has one answer, unless the exemption sets coversRemainderOnly (AST-020 FR5)`,
        );
      }
    }
    if (expectation.appliesWhen.condition.trim() === '') {
      problems.push(`${id} states no applicability condition`);
    }
    for (const layer of requiredLayers(expectation)) {
      if (!EVIDENCE_LAYERS.includes(layer)) {
        problems.push(`${id} names an unknown evidence layer "${layer}"`);
      }
    }
    if ((expectation.alsoNeeds ?? []).includes(expectation.evidenceLayer)) {
      problems.push(
        `${id} repeats its own evidence layer in alsoNeeds; list only the further layers it reads`,
      );
    }

    // FR9: `required` is earned by a DIRECTLY APPLICABLE WCAG A/AA criterion or
    // by a current Astryx record that adopts the outcome — never by how easy
    // the check is to automate.
    //
    // "Directly applicable" is read here as: the criterion is the
    // expectation's PRIMARY source, the one that names it. A supporting
    // citation further down the list is not adoption — an APG-primary
    // expectation that also mentions 4.1.2 for context is still an APG
    // requirement, and gating on it would let any expectation buy `required`
    // by adding a plausible criterion to the end of its list.
    const primary = expectation.sources[0];
    const adopted =
      primary != null &&
      ((primary.standard === 'wcag' &&
        (primary.level === 'A' || primary.level === 'AA')) ||
        primary.standard === 'astryx');
    if (expectation.enforcement === 'required' && !adopted) {
      problems.push(
        `${id} is required, but its primary source is neither a WCAG 2.2 A/AA criterion nor a current Astryx record (AST-020 FR9)`,
      );
    }
    if (
      expectation.enforcement === 'advisory' &&
      (expectation.advisoryBecause ?? '').trim() === ''
    ) {
      problems.push(
        `${id} is advisory but does not say why the outcome is not adopted as a gate (AST-020 FR9)`,
      );
    }
  }

  for (const [dimension, exemption] of Object.entries(contract.exemptions)) {
    if (!DIMENSION_IDS.includes(dimension)) {
      problems.push(`exemption "${dimension}" is not a completeness dimension`);
      continue;
    }
    if (exemption == null) {
      continue;
    }
    if (exemption.owner.trim() === '') {
      problems.push(
        `"${dimension}" is exempt but names no owner (AST-020 FR5)`,
      );
    }
    if (exemption.verifiedBy.trim() === '') {
      problems.push(
        `"${dimension}" is exempt but names no verification method (AST-020 FR5)`,
      );
    }
    if (
      exemption.coversRemainderOnly === true &&
      !contract.expectations.some(expectation =>
        expectation.covers.includes(dimension as ChecklistDimensionId),
      )
    ) {
      problems.push(
        `"${dimension}" claims to exempt only the remainder, but no expectation encodes any of it`,
      );
    }
    if (EMPTY_EXEMPTION.test(exemption.reason.trim())) {
      problems.push(
        `"${dimension}" uses "${exemption.reason}" as its exemption reason; FR5 forbids a generic escape hatch`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Pattern "${contract.pattern}" is not auditable:\n  - ${problems.join('\n  - ')}`,
    );
  }

  return contract;
}
