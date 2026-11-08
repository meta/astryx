// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check.ts
 * @input Uses ./contract (expectations), ./harness (the runtime seam)
 * @output `checkAccessibilitySpec` — runs one pattern contract against one component binding
 *   state — plus the known-failure vocabulary and exact-record reconciliation
 *   helpers it obeys.
 * @position The engine between a pattern and a component. Everything a report
 *   later says about a binding is decided here.
 *
 * The rules come from the accepted migration record,
 * `docs/specs/AST-021/spec.md`:
 *
 * - FR8  a checked-in known failure names an expectation, binding, state,
 *        evidence layer, exact failure, user impact, standards source, and why
 *        migration does not fix it. Operational tracking stays outside public
 *        source.
 * - FR9  a known failure changes only its own exact result. A different error,
 *        another state, a new expectation, or a wider failure still fails, and
 *        an expectation that starts passing is reported as an unexpected pass
 *        so the stale record is removed rather than counted as debt forever.
 * - FR10 required expectations that pass gate immediately.
 *
 * and from `docs/specs/AST-020/spec.md`:
 *
 * - Platform: a harness that cannot observe an assigned evidence layer reports
 *   that limitation. It does not pass, skip silently, or answer from a lower
 *   layer.
 *
 * SYNC: When a status is added, update ./report.ts and the README's status table.
 */

import {
  NotApplicableHere,
  describeExpectation,
  requiredLayers,
  type Enforcement,
  type Expectation,
  type InitialFocusEntryObservation,
  type PatternContract,
} from './contract';
import {
  MissingHarnessRelation,
  type EvidenceLayer,
  type Harness,
} from './harness';

export type ResultStatus =
  /** The outcome was observed. */
  | 'pass'
  /** The outcome was absent. */
  | 'fail'
  /** The exact recorded historical failure, still failing. Never a pass. */
  | 'known-failure'
  /** A recorded failure that now passes: the record is stale and must go. */
  | 'unexpected-pass'
  /** This state cannot change the outcome, so the expectation does not apply. */
  | 'not-applicable'
  /** No harness in this run can observe the assigned evidence layer. */
  | 'unrun';

/**
 * One historical failure, pinned tightly enough that it cannot cover anything
 * else (AST-021 FR8, FR9).
 */
export interface KnownFailure {
  readonly expectation: string;
  readonly binding: string;
  readonly state: string;
  readonly evidenceLayer: EvidenceLayer;
  /** The exact failure this record covers. Any text change is a different failure. */
  readonly failureEquals: string;
  /** Exact standards source for the failed user outcome. */
  readonly standardsReference: string;
  /** What the person using the component actually experiences. */
  readonly userImpact: string;
  /** Why this migration records the gap instead of fixing it. */
  readonly reason: string;
}

export interface ExpectationResult {
  readonly expectation: string;
  readonly description: string;
  readonly outcome: string;
  readonly evidenceLayer: EvidenceLayer;
  readonly enforcement: Enforcement;
  readonly status: ResultStatus;
  /** Present for `fail`, `known-failure`, `not-applicable`, and `unrun`. */
  readonly detail?: string;
  /**
   * For an `unrun` result: exactly which layers this run could not observe.
   * Not always the expectation's own layer — an interaction expectation can be
   * unrun because the tree it reads the result from is out of reach.
   */
  readonly missingLayers?: readonly EvidenceLayer[];
  /** Present when an exact known-failure record was consulted. */
  readonly knownFailure?: KnownFailure;
}

export interface BindingResult {
  readonly pattern: string;
  /** The component this binding is for, e.g. `Switch`. */
  readonly binding: string;
  /** The representative state, e.g. `off` or `focusable-disabled`. */
  readonly state: string;
  readonly harness: string;
  readonly results: readonly ExpectationResult[];
}

export interface CheckAccessibilitySpecOptions<Facts> {
  readonly spec: PatternContract<Facts>;
  readonly binding: string;
  readonly state: string;
  readonly facts: Facts;
  /**
   * Mount the binding fresh and return a harness pointed at it. Called once per
   * expectation, so each one starts from the state the binding declares rather
   * than from whatever the previous expectation left behind.
   */
  readonly mount: () => Promise<Harness>;
  /** Unmount between expectations. */
  readonly unmount?: () => Promise<void> | void;
  /**
   * How many times this binding's action has run since the current mount.
   *
   * Required by any pattern whose expectations read it — a button's activation
   * leaves no trace on the button, so only the binding can count it. Omitting
   * it where the pattern needs it is a binding fault and fails loudly.
   */
  readonly activations?: () => Promise<number>;
  /**
   * Browser event evidence for ordering-sensitive focus expectations. The
   * binding must begin recording before the subject can receive focus.
   */
  readonly initialFocusEntry?: () => Promise<InitialFocusEntryObservation>;
  /** Perform one named public state transition required by the pattern. */
  readonly transition?: (name: string) => Promise<void> | void;
  /**
   * Run only these expectation ids. Used by the contract's own mutation proof,
   * which asks one expectation at a time whether it notices its outcome being
   * removed. A binding leaves it unset and runs the whole contract.
   */
  readonly only?: readonly string[];
  readonly knownFailures?: readonly KnownFailure[];
}

/**
 * Thrown when an expectation reads something only the binding can supply and
 * the binding did not supply it. A binding fault, not a contract result: it
 * escapes `checkAccessibilitySpec` rather than being recorded as a failure, because the
 * outcome was never actually tested.
 */
export class MissingBindingCapability extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingBindingCapability';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findKnownFailure<Facts>(
  known: readonly KnownFailure[],
  expectation: Expectation<Facts>,
  binding: string,
  state: string,
): KnownFailure | undefined {
  return known.find(
    record =>
      record.expectation === expectation.id &&
      record.binding === binding &&
      record.state === state &&
      record.evidenceLayer === expectation.evidenceLayer,
  );
}

export function unmatchedKnownFailures(
  knownFailures: readonly KnownFailure[],
  bindings: readonly BindingResult[],
): readonly string[] {
  return knownFailures.flatMap(record => {
    const matches = bindings.flatMap(binding =>
      binding.results.filter(result => result.knownFailure === record),
    ).length;
    return matches === 1
      ? []
      : [
          `${record.binding} [${record.state}] ${record.expectation} at ${record.evidenceLayer} matched ${matches} results; every known-failure record must match exactly one executed result`,
        ];
  });
}

export async function checkAccessibilitySpec<Facts>(
  options: CheckAccessibilitySpecOptions<Facts>,
): Promise<BindingResult> {
  const {spec, binding, state, facts, mount, unmount} = options;
  const knownFailures = options.knownFailures ?? [];
  const results: ExpectationResult[] = [];
  let harnessName = 'unmounted';

  for (const expectation of spec.expectations) {
    if (options.only != null && !options.only.includes(expectation.id)) {
      continue;
    }
    const base = {
      expectation: expectation.id,
      description: describeExpectation(expectation),
      outcome: expectation.outcome,
      evidenceLayer: expectation.evidenceLayer,
      enforcement: expectation.enforcement,
    } as const;

    if (!expectation.appliesWhen.test(facts)) {
      results.push({
        ...base,
        status: 'not-applicable',
        detail: `applies when ${expectation.appliesWhen.condition}`,
      });
      continue;
    }

    let harness: Harness | undefined;
    let failure: string | undefined;
    let notApplicableReason: string | undefined;
    let ran = false;

    try {
      const mounted = await mount();
      harness = mounted;
      harnessName = mounted.name;
      const unobservable = requiredLayers(expectation).filter(
        layer => !mounted.observes.includes(layer),
      );
      if (unobservable.length > 0) {
        results.push({
          ...base,
          status: 'unrun',
          missingLayers: unobservable,
          detail: `the ${mounted.name} harness cannot observe the ${unobservable.join(' or ')} layer${unobservable.length === 1 ? '' : 's'} this expectation reads`,
        });
        continue;
      }
      ran = true;
      const subject = await harness.subject();
      await expectation.run({
        harness,
        subject,
        facts,
        notApplicable: reason => {
          throw new NotApplicableHere(reason);
        },
        activations: async () => {
          if (options.activations == null) {
            throw new MissingBindingCapability(
              `${expectation.id} counts how many times the action ran, but this binding supplies no activation count`,
            );
          }
          return options.activations();
        },
        initialFocusEntry: async () => {
          if (options.initialFocusEntry == null) {
            throw new MissingBindingCapability(
              `${expectation.id} reads the first focus entry, but this binding supplies no focus-entry observation`,
            );
          }
          return options.initialFocusEntry();
        },
        transition: async name => {
          if (options.transition == null) {
            throw new MissingBindingCapability(
              `${expectation.id} requests the "${name}" transition, but this binding supplies no transition driver`,
            );
          }
          await options.transition(name);
        },
      });
    } catch (error) {
      if (
        error instanceof MissingBindingCapability ||
        error instanceof MissingHarnessRelation
      ) {
        // Never a contract result: the outcome was not tested at all.
        throw error;
      }
      if (error instanceof NotApplicableHere) {
        notApplicableReason = error.message;
      } else {
        failure = messageOf(error);
      }
      if (!ran) {
        // The mount itself failed. That is a harness fault, not a contract
        // result, and it must not be absorbed by a known-failure record.
        throw error;
      }
    } finally {
      await unmount?.();
    }

    if (notApplicableReason !== undefined) {
      // Discovered from the page rather than declared up front. It is reported
      // exactly like a declared one, so neither reads as a pass, and a
      // known-failure record is deliberately NOT consulted: an expectation that
      // did not run has nothing to record a failure against.
      results.push({
        ...base,
        status: 'not-applicable',
        detail: notApplicableReason,
      });
      continue;
    }

    const record = findKnownFailure(knownFailures, expectation, binding, state);

    if (failure === undefined) {
      results.push(
        record == null
          ? {...base, status: 'pass'}
          : {
              ...base,
              status: 'unexpected-pass',
              knownFailure: record,
              detail:
                'the recorded failure no longer happens; remove this stale known-failure record and reconcile its separately owned operational gap record when no other binding still refers to it',
            },
      );
      continue;
    }

    if (record != null && failure === record.failureEquals) {
      results.push({
        ...base,
        status: 'known-failure',
        knownFailure: record,
        detail: failure,
      });
      continue;
    }

    results.push({
      ...base,
      status: 'fail',
      detail:
        record == null
          ? failure
          : `${failure}\n\nA known failure is recorded for this expectation, binding, and state, but it covers a different failure (${JSON.stringify(record.failureEquals)}). A known failure never widens to cover a new one.`,
      knownFailure: record,
    });
  }

  return {
    pattern: spec.pattern,
    binding,
    state,
    harness: harnessName,
    results,
  };
}
