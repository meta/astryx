// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check.test.ts
 * @input Uses ./contract, ./check, ./report and a stub harness
 * @output Proof that a known failure changes only its own exact result, that an
 *   unobservable layer is reported rather than passed, and that the report
 *   keeps its facts apart.
 * @position Runner self-test. These are the rules a migration depends on, so
 *   they are tested directly rather than through a component.
 *
 * `docs/specs/AST-021/spec.md` FR9 is the rule under test: "A different error,
 * another state, a new expectation, or a wider failure MUST fail. When the
 * expectation starts passing, CI MUST report an unexpected pass."
 */

import {describe, expect, it, vi} from 'vitest';
import {
  definePattern,
  type ExpectationContext,
  type PatternContract,
} from './contract';
import type {EvidenceLayer, Harness, Subject} from './harness';
import {
  blockingResults,
  formatReport,
  neverExercised,
  summarize,
} from './report';
import {
  checkAccessibilitySpec,
  unmatchedKnownFailures,
  type KnownFailure,
} from './check';

interface Facts {
  readonly applicable: boolean;
}

const subject = {} as Subject;

function harness(observes: readonly EvidenceLayer[]): Harness {
  return {
    name: 'stub',
    observes,
    subject: async () => subject,
    related: async () => subject,
    contains: async () => true,
    containsSemantically: async () => true,
    references: async () => true,
    click: async () => {},
    abortedPress: async () => {},
    clickBeside: async () => {},
    hover: async () => {},
    pointerAway: async () => {},
    typeText: async () => {},
    clearText: async () => {},
    press: async () => {},
    resetFocus: async () => {},
  };
}

function contractThat(
  behaviour: (context: ExpectationContext<Facts>) => void | Promise<void>,
  overrides: {
    layer?: EvidenceLayer;
    alsoNeeds?: readonly EvidenceLayer[];
    enforcement?: 'required' | 'advisory';
  } = {},
): PatternContract<Facts> {
  return definePattern<Facts>({
    pattern: 'probe',
    url: 'https://example.invalid/probe',
    scope: 'A stub pattern used to test the runner.',
    exemptions: {},
    expectations: [
      {
        id: 'probe.outcome.observed',
        outcome: 'The stub outcome happens.',
        sources: [
          {
            standard: 'wcag',
            id: '4.1.2',
            name: 'Name, Role, Value',
            level: 'A',
            url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
          },
        ],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the state is applicable',
          test: facts => facts.applicable,
        },
        evidenceLayer: overrides.layer ?? 'dom',
        alsoNeeds: overrides.alsoNeeds,
        enforcement: overrides.enforcement ?? 'required',
        advisoryBecause:
          overrides.enforcement === 'advisory'
            ? 'Nothing adopts the stub outcome.'
            : undefined,
        run: async context => behaviour(context),
      },
    ],
  });
}

function knownFailure(overrides: Partial<KnownFailure> = {}): KnownFailure {
  return {
    expectation: 'probe.outcome.observed',
    binding: 'Stub',
    state: 'default',
    evidenceLayer: 'dom',
    failureEquals: 'the stub outcome is missing entirely',
    standardsReference: 'WCAG 2.2 4.1.2 Name, Role, Value (Level A)',
    userImpact: 'The stub does nothing for the user.',
    reason: 'Recorded by the migration; the fix is its own change.',
    ...overrides,
  };
}

async function run(
  spec: PatternContract<Facts>,
  options: {
    facts?: Facts;
    knownFailures?: readonly KnownFailure[];
    observes?: readonly EvidenceLayer[];
    state?: string;
    initialFocusEntry?: () => Promise<{readonly subjectWasModal: boolean}>;
    transition?: (name: string) => Promise<void> | void;
  } = {},
) {
  return checkAccessibilitySpec({
    spec,
    binding: 'Stub',
    state: options.state ?? 'default',
    facts: options.facts ?? {applicable: true},
    mount: async () => harness(options.observes ?? ['unit', 'dom']),
    knownFailures: options.knownFailures,
    initialFocusEntry: options.initialFocusEntry,
    transition: options.transition,
  });
}

const missing = () => {
  throw new Error('the stub outcome is missing entirely');
};

describe('checkAccessibilitySpec', () => {
  it('passes when the outcome happens', async () => {
    const result = await run(contractThat(() => {}));
    expect(result.results[0]?.status).toBe('pass');
    expect(blockingResults([result])).toEqual([]);
  });

  it('fails when the outcome is absent, and that blocks', async () => {
    const result = await run(contractThat(missing));
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toContain('the stub outcome is missing');
    expect(blockingResults([result])).toHaveLength(1);
  });

  it('does not run an expectation this state cannot change', async () => {
    const behaviour = vi.fn();
    const result = await run(contractThat(behaviour), {
      facts: {applicable: false},
    });
    expect(behaviour).not.toHaveBeenCalled();
    expect(result.results[0]?.status).toBe('not-applicable');
    expect(result.results[0]?.detail).toContain('applies when');
  });

  it('reports an unobservable evidence layer instead of passing or skipping it', async () => {
    const behaviour = vi.fn();
    const result = await run(
      contractThat(behaviour, {layer: 'accessibility-tree'}),
      {observes: ['unit', 'dom']},
    );
    expect(behaviour).not.toHaveBeenCalled();
    expect(result.results[0]?.status).toBe('unrun');
    expect(result.results[0]?.detail).toContain('cannot observe');
    expect(blockingResults([result])).toEqual([]);
  });

  it('reports unrun when a FURTHER layer the expectation reads is out of reach', async () => {
    const behaviour = vi.fn();
    // The shape of every interaction expectation: the claim is a real-browser
    // one, but the answer is read out of the accessibility tree. A harness with
    // the browser and no tree cannot run it, and must not fail it either.
    const result = await run(
      contractThat(behaviour, {
        layer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
      }),
      {observes: ['unit', 'dom', 'real-browser']},
    );
    expect(behaviour).not.toHaveBeenCalled();
    expect(result.results[0]?.status).toBe('unrun');
    expect(result.results[0]?.missingLayers).toEqual(['accessibility-tree']);
    expect(result.results[0]?.detail).toContain('accessibility-tree');
    expect(blockingResults([result])).toEqual([]);
  });

  it('runs once every layer it reads is observable', async () => {
    const behaviour = vi.fn();
    const result = await run(
      contractThat(behaviour, {
        layer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
      }),
      {observes: ['unit', 'dom', 'accessibility-tree', 'real-browser']},
    );
    expect(behaviour).toHaveBeenCalled();
    expect(result.results[0]?.status).toBe('pass');
  });

  it('treats a missing first-focus observation as a binding fault', async () => {
    const spec = contractThat(
      async ({initialFocusEntry}) => {
        await initialFocusEntry();
      },
      {layer: 'real-browser'},
    );

    await expect(
      run(spec, {observes: ['unit', 'dom', 'real-browser']}),
    ).rejects.toThrow('supplies no focus-entry observation');
  });

  it('passes the binding-owned first-focus observation to the expectation', async () => {
    const observed = vi.fn(async () => ({subjectWasModal: true}));
    const spec = contractThat(
      async ({initialFocusEntry}) => {
        expect(await initialFocusEntry()).toEqual({subjectWasModal: true});
      },
      {layer: 'real-browser'},
    );

    const result = await run(spec, {
      observes: ['unit', 'dom', 'real-browser'],
      initialFocusEntry: observed,
    });
    expect(observed).toHaveBeenCalledOnce();
    expect(result.results[0]?.status).toBe('pass');
  });

  it('treats a missing public transition driver as a binding fault', async () => {
    const spec = contractThat(async ({transition}) => transition('show'));

    await expect(run(spec)).rejects.toThrow(
      'requests the "show" transition, but this binding supplies no transition driver',
    );
  });

  it('passes named public transitions to the binding driver', async () => {
    const transition = vi.fn(async () => {});
    const spec = contractThat(async context => context.transition('replace'));

    const result = await run(spec, {transition});
    expect(transition).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledWith('replace');
    expect(result.results[0]?.status).toBe('pass');
  });

  describe('an expectation that discovers mid-run that it does not apply', () => {
    it('reports not-applicable with its reason, never a pass', async () => {
      const contract = contractThat(() => {});
      const withEscape = definePattern<Facts>({
        ...contract,
        expectations: [
          {
            ...contract.expectations[0]!,
            run: async ({notApplicable}) =>
              notApplicable('the page has nothing for this to be about'),
          },
        ],
      });
      const result = await run(withEscape);
      expect(result.results[0]?.status).toBe('not-applicable');
      expect(result.results[0]?.detail).toBe(
        'the page has nothing for this to be about',
      );
      expect(blockingResults([result])).toEqual([]);
    });

    it('does not let a known-failure record turn it into recorded debt', async () => {
      // An expectation that did not run has nothing to record a failure
      // against, so the record must neither match nor go stale.
      const contract = contractThat(() => {});
      const withEscape = definePattern<Facts>({
        ...contract,
        expectations: [
          {
            ...contract.expectations[0]!,
            run: async ({notApplicable}) => notApplicable('nothing to judge'),
          },
        ],
      });
      const result = await run(withEscape, {knownFailures: [knownFailure()]});
      expect(result.results[0]?.status).toBe('not-applicable');
      expect(result.results[0]?.knownFailure).toBeUndefined();
      expect(blockingResults([result])).toEqual([]);
    });

    it('still fails when the expectation throws an ordinary error', async () => {
      // The escape is the only thing that yields not-applicable: an expectation
      // cannot reach it by failing in some other way.
      const result = await run(contractThat(missing));
      expect(result.results[0]?.status).toBe('fail');
    });
  });

  it('reports an advisory failure without blocking', async () => {
    const result = await run(contractThat(missing, {enforcement: 'advisory'}));
    expect(result.results[0]?.status).toBe('fail');
    expect(blockingResults([result])).toEqual([]);
  });

  describe('known failures', () => {
    it('records the exact recorded failure as debt, never as a pass', async () => {
      const result = await run(contractThat(missing), {
        knownFailures: [knownFailure()],
      });
      expect(result.results[0]?.status).toBe('known-failure');
      expect(result.results[0]?.knownFailure).toEqual(
        expect.objectContaining({
          expectation: 'probe.outcome.observed',
          binding: 'Stub',
          state: 'default',
        }),
      );
      expect(blockingResults([result])).toEqual([]);
    });

    it('fails on a different failure, rather than widening to cover it', async () => {
      const result = await run(
        contractThat(() => {
          throw new Error('the stub outcome happened twice');
        }),
        {knownFailures: [knownFailure()]},
      );
      expect(result.results[0]?.status).toBe('fail');
      expect(result.results[0]?.detail).toContain(
        'it covers a different failure',
      );
      expect(blockingResults([result])).toHaveLength(1);
    });

    it('reports an advisory failure in a state the record does not name', async () => {
      const result = await run(
        contractThat(missing, {enforcement: 'advisory'}),
        {
          state: 'another-state',
          knownFailures: [knownFailure()],
        },
      );
      expect(result.results[0]?.status).toBe('fail');
      expect(blockingResults([result])).toEqual([]);
    });

    it('fails at an evidence layer the record does not name', async () => {
      const result = await run(contractThat(missing), {
        knownFailures: [knownFailure({evidenceLayer: 'real-browser'})],
      });
      expect(result.results[0]?.status).toBe('fail');
    });

    it('fails when only a substring of the recorded failure matches', async () => {
      const result = await run(contractThat(missing), {
        knownFailures: [
          knownFailure({failureEquals: 'the stub outcome is missing'}),
        ],
      });
      expect(result.results[0]?.status).toBe('fail');
      expect(blockingResults([result])).toHaveLength(1);
    });

    it('reports a different advisory failure when a known record was consulted', async () => {
      const result = await run(
        contractThat(
          () => {
            throw new Error('the stub outcome broke differently');
          },
          {enforcement: 'advisory'},
        ),
        {knownFailures: [knownFailure()]},
      );
      expect(result.results[0]?.status).toBe('fail');
      expect(result.results[0]?.knownFailure).toBeDefined();
      expect(blockingResults([result])).toEqual([]);
    });

    it('accepts a record matched by exactly one executed result', async () => {
      const record = knownFailure();
      const result = await run(contractThat(missing), {
        knownFailures: [record],
      });
      expect(unmatchedKnownFailures([record], [result])).toEqual([]);
    });

    it('reports a record orphaned by a missing state or expectation', async () => {
      const orphan = knownFailure({state: 'deleted-state'});
      const result = await run(
        contractThat(() => {}),
        {
          knownFailures: [orphan],
        },
      );
      expect(unmatchedKnownFailures([orphan], [result])).toEqual([
        expect.stringContaining('matched 0 results'),
      ]);
    });

    it('reports an unexpected pass when the recorded failure stops happening', async () => {
      const result = await run(
        contractThat(() => {}),
        {
          knownFailures: [knownFailure()],
        },
      );
      expect(result.results[0]?.status).toBe('unexpected-pass');
      expect(result.results[0]?.detail).toContain(
        'remove this stale known-failure',
      );
      expect(result.results[0]?.detail).toContain(
        'reconcile its separately owned operational gap record',
      );
      expect(blockingResults([result])).toHaveLength(1);
    });
  });

  it('lets a broken mount surface instead of absorbing it as a result', async () => {
    await expect(
      checkAccessibilitySpec({
        spec: contractThat(() => {}),
        binding: 'Stub',
        state: 'default',
        facts: {applicable: true},
        mount: async () => {
          throw new Error('the fixture never mounted');
        },
        knownFailures: [knownFailure()],
      }),
    ).rejects.toThrow('the fixture never mounted');
  });
});

describe('the report keeps its facts apart', () => {
  it('prints the source and failure detail for a report-only advisory result', async () => {
    const result = await run(contractThat(missing, {enforcement: 'advisory'}));
    const text = formatReport(
      summarize(contractThat(missing, {enforcement: 'advisory'}), [result]),
    );
    expect(text).toContain('WCAG 2.2 4.1.2 Name, Role, Value (A)');
    expect(text).toContain('the stub outcome is missing entirely');
    expect(blockingResults([result])).toEqual([]);
  });

  it('counts each status separately and quotes no score', async () => {
    const contract = contractThat(missing);
    const failing = await run(contract);
    const known = await run(contract, {
      state: 'known',
      knownFailures: [knownFailure({state: 'known'})],
    });
    const skipped = await run(contract, {facts: {applicable: false}});

    const report = summarize(contract, [failing, known, skipped]);
    expect(report.counts).toEqual({
      pass: 0,
      fail: 1,
      knownFailure: 1,
      unexpectedPass: 0,
      notApplicable: 1,
      unrun: 0,
    });

    const text = formatReport(report);
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/score/i);
    expect(text).toContain('known-failure 1');
  });

  it('names an expectation no state ever exercised', async () => {
    // A gate nothing runs is not a gate, however green the report looks.
    const base = contractThat(() => {});
    const skipped = definePattern<Facts>({
      ...base,
      expectations: [
        {
          ...base.expectations[0]!,
          appliesWhen: {condition: 'never, as it happens', test: () => false},
        },
      ],
    });
    const results = [
      await run(skipped, {state: 'one'}),
      await run(skipped, {state: 'two'}),
    ];
    expect(neverExercised(results)).toEqual(['probe.outcome.observed']);
  });

  it('says nothing when every expectation ran somewhere', async () => {
    const contract = contractThat(() => {});
    const results = [
      await run(contract, {state: 'one', facts: {applicable: false}}),
      await run(contract, {state: 'two'}),
    ];
    expect(neverExercised(results)).toEqual([]);
  });

  it('counts an unrun layer as not exercised', async () => {
    const contract = contractThat(() => {}, {layer: 'real-browser'});
    const results = [await run(contract, {observes: ['unit', 'dom']})];
    expect(neverExercised(results)).toEqual(['probe.outcome.observed']);
  });

  it('tells a part-encoded dimension apart from a fully exempt one', async () => {
    const base = contractThat(() => {});
    const contract = definePattern<Facts>({
      ...base,
      exemptions: {
        // Encoded by the stub expectation, remainder owned elsewhere.
        '4.1.2-name-role-value': {
          owner: 'the caller',
          verifiedBy: 'integration review',
          reason: 'One component cannot see the other half.',
          coversRemainderOnly: true,
        },
        // Not owned here at all.
        '2.4.7-focus-visible': {
          owner: 'the theme',
          verifiedBy: 'the visual gate',
          reason: 'A focus ring is a painted result.',
        },
      },
    });
    const report = summarize(contract, [await run(contract)]);
    const text = formatReport(report);

    expect(text).toContain(
      'part-encoded 4.1.2-name-role-value — encoded by probe.outcome.observed; remainder → the caller',
    );
    // A reader of the report alone can see WHICH half is covered.
    expect(
      report.exemptions.find(e => e.dimension === '4.1.2-name-role-value')
        ?.encodedBy,
    ).toEqual(['probe.outcome.observed']);
    expect(text).toContain('exempt 2.4.7-focus-visible → the theme');
    // The part-encoded one must not read as fully exempt.
    expect(text).not.toContain('exempt 4.1.2-name-role-value →');
    expect(
      report.exemptions.find(e => e.dimension === '4.1.2-name-role-value')
        ?.remainderOnly,
    ).toBe(true);
    expect(
      report.exemptions.find(e => e.dimension === '2.4.7-focus-visible')
        ?.remainderOnly,
    ).toBe(false);
  });

  it('names the layers that were not run, so a green run is not read as full coverage', async () => {
    const contract = contractThat(() => {}, {layer: 'real-browser'});
    const report = summarize(contract, [await run(contract)]);
    expect(report.unrunLayers).toEqual(['real-browser']);
    expect(formatReport(report)).toContain(
      'unrun evidence layers: real-browser',
    );
  });

  it('names every layer that was out of reach, not just the one the expectation is filed under', async () => {
    const contract = contractThat(() => {}, {
      layer: 'real-browser',
      alsoNeeds: ['accessibility-tree'],
    });
    const report = summarize(contract, [await run(contract)]);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
  });
});
