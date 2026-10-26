// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract.test.ts
 * @input Uses ./contract and ./checklist
 * @output Proof that `definePattern` refuses contracts nobody could audit and
 *   accepts native patterns grounded in versioned web standards without
 *   misrepresenting them as APG patterns.
 * @position Schema self-test. Each case here is a way an expectation could look
 *   finished and prove nothing.
 *
 * `docs/specs/AST-020/spec.md` FR4, FR5, FR6, and FR9. The record's own failure
 * expectation is "a check lacks a source or layer, passes from an unsupported
 * harness, depends on private markup, or one-way behavior hides a reverse-path
 * failure" — the first two are refused here at construction.
 */

import {describe, expect, it} from 'vitest';
import {
  citeSource,
  definePattern,
  unansweredDimensions,
  type AstryxRecord,
  type Expectation,
  type PatternContract,
  type WebStandardRequirement,
} from './contract';
import {CHECKLIST_DIMENSIONS} from './checklist';
import type {EvidenceLayer} from './harness';

const WCAG_4_1_2 = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
} as const;

const APG_SOMETHING = {
  standard: 'apg',
  pattern: 'probe',
  requirement: 'The probe does the probe thing.',
  url: 'https://example.invalid/probe',
} as const;

function expectation(
  overrides: Partial<Expectation<unknown>> = {},
): Expectation<unknown> {
  return {
    id: 'probe.outcome.observed',
    outcome: 'The probe outcome happens.',
    sources: [WCAG_4_1_2],
    covers: ['4.1.2-name-role-value'],
    appliesWhen: {condition: 'always', test: () => true},
    evidenceLayer: 'dom',
    enforcement: 'required',
    run: async () => {},
    ...overrides,
  };
}

function pattern(
  overrides: Partial<PatternContract<unknown>> = {},
): () => PatternContract<unknown> {
  return () =>
    definePattern<unknown>({
      pattern: 'probe',
      url: 'https://example.invalid/probe',
      scope: 'A stub pattern.',
      expectations: [expectation()],
      exemptions: {},
      ...overrides,
    });
}

describe('definePattern', () => {
  it('accepts a traceable, applicable, layered, enforceable expectation', () => {
    expect(pattern()).not.toThrow();
  });

  it('cites a versioned web-standard requirement without pretending it is APG', () => {
    const source: WebStandardRequirement = {
      standard: 'web-standard',
      specification: 'WAI-ARIA 1.2',
      requirement:
        'A textbox is an input that allows free-form text as its value.',
      url: 'https://www.w3.org/TR/wai-aria-1.2/#textbox',
    };

    expect(citeSource(source)).toBe(
      'WAI-ARIA 1.2: A textbox is an input that allows free-form text as its value.',
    );
    expect(
      pattern({expectations: [expectation({sources: [WCAG_4_1_2, source]})]}),
    ).not.toThrow();
  });

  it('accepts a hyphenated adopted-pattern slug in an expectation id', () => {
    expect(
      pattern({
        pattern: 'modal-dialog',
        expectations: [expectation({id: 'modal-dialog.name.exposed'})],
      }),
    ).not.toThrow();
  });

  it('refuses an expectation with no user outcome', () => {
    expect(pattern({expectations: [expectation({outcome: '  '})]})).toThrow(
      /states no user outcome/,
    );
  });

  it('refuses an expectation that cites nothing', () => {
    expect(
      pattern({
        expectations: [
          expectation({
            sources: [] as unknown as Expectation<unknown>['sources'],
          }),
        ],
      }),
    ).toThrow(/cites no normative source/);
  });

  it('refuses an APG-primary expectation that names no WCAG outcome', () => {
    expect(
      pattern({expectations: [expectation({sources: [APG_SOMETHING]})]}),
    ).toThrow(/must name the WCAG 2.2 outcome it supports/);
  });

  it('accepts an APG-primary expectation that names the WCAG outcome and reports', () => {
    expect(
      pattern({
        expectations: [
          expectation({
            sources: [APG_SOMETHING, WCAG_4_1_2],
            wcagOutcome: 'The probe state is programmatically available.',
            enforcement: 'advisory',
            advisoryBecause: 'Nothing current adopts the probe outcome.',
          }),
        ],
      }),
    ).not.toThrow();
  });

  it('refuses to gate on an APG requirement propped up by a supporting citation', () => {
    // FR9 wants a DIRECTLY applicable criterion. Without this, any expectation
    // could buy `required` by appending a plausible criterion to its list.
    expect(
      pattern({
        expectations: [
          expectation({
            sources: [APG_SOMETHING, WCAG_4_1_2],
            wcagOutcome: 'The probe state is programmatically available.',
            enforcement: 'required',
          }),
        ],
      }),
    ).toThrow(/its primary source is neither/);
  });

  it('refuses an expectation with no applicability condition', () => {
    expect(
      pattern({
        expectations: [
          expectation({appliesWhen: {condition: '', test: () => true}}),
        ],
      }),
    ).toThrow(/states no applicability condition/);
  });

  it('refuses an unknown evidence layer', () => {
    expect(
      pattern({
        expectations: [
          expectation({
            evidenceLayer: 'vibes' as Expectation<unknown>['evidenceLayer'],
          }),
        ],
      }),
    ).toThrow(/unknown evidence layer/);
  });

  describe('an Astryx record as a source', () => {
    // It can make an expectation GATE (FR9), so a citation a reviewer cannot
    // check is not good enough.
    const record = (
      overrides: Partial<Omit<AstryxRecord, 'standard'>> = {},
    ): AstryxRecord => ({
      standard: 'astryx',
      id: 'family:probes',
      clause: 'FR1',
      requirement: 'A probe MUST probe.',
      url: `https://github.com/facebook/astryx/blob/${'a'.repeat(40)}/docs/families/probes.md`,
      ...overrides,
    });

    it('accepts one that names its record, its clause, and its bytes', () => {
      expect(
        pattern({expectations: [expectation({sources: [record()]})]}),
      ).not.toThrow();
    });

    it.each([['id'], ['clause'], ['requirement']] as const)(
      'refuses one with no %s',
      field => {
        expect(
          pattern({
            expectations: [expectation({sources: [record({[field]: '  '})]})],
          }),
        ).toThrow(new RegExp(`cites an Astryx record with no ${field}`));
      },
    );

    const PIN = 'a'.repeat(40);

    it.each([
      // Only resolves inside a checkout.
      ['docs/families/probes.md'],
      // Not public: a reviewer of this repository cannot open it, and it must
      // never appear in it.
      ['https://code.example.internal/astryx/docs/families/probes.md'],
      ['http://github.com/facebook/astryx/blob/' + PIN + '/docs/x.md'],
      // Every one of these moves out from under the quote.
      ['https://github.com/facebook/astryx/blob/main/docs/x.md'],
      ['https://github.com/facebook/astryx/blob/HEAD/docs/x.md'],
      ['https://github.com/facebook/astryx/blob/develop/docs/x.md'],
      ['https://github.com/facebook/astryx/blob/v1.2.3/docs/x.md'],
      ['https://github.com/facebook/astryx/blob/refs/heads/main/docs/x.md'],
      ['https://github.com/facebook/astryx/raw/' + PIN + '/docs/x.md'],
      // A short sha is ambiguous over a long enough history.
      ['https://github.com/facebook/astryx/blob/abc1234/docs/x.md'],
    ])('refuses %s', url => {
      expect(
        pattern({expectations: [expectation({sources: [record({url})]})]}),
      ).toThrow(/pinned to the bytes the requirement was quoted from/);
    });

    it('accepts a public GitHub URL pinned to a full commit sha', () => {
      expect(
        pattern({
          expectations: [
            expectation({
              sources: [
                record({
                  url: `https://github.com/facebook/astryx/blob/${PIN}/docs/families/probes.md#L1-L2`,
                }),
              ],
            }),
          ],
        }),
      ).not.toThrow();
    });

    it('says which record and clause in the citation, not just the id', () => {
      expect(citeSource(record())).toBe(
        'Astryx family:probes FR1: A probe MUST probe.',
      );
    });
  });

  it('refuses an unknown layer in alsoNeeds', () => {
    expect(
      pattern({
        expectations: [
          expectation({
            alsoNeeds: ['vibes'] as unknown as readonly EvidenceLayer[],
          }),
        ],
      }),
    ).toThrow(/names an unknown evidence layer "vibes"/);
  });

  it("refuses alsoNeeds that repeats the expectation's own layer", () => {
    expect(
      pattern({expectations: [expectation({alsoNeeds: ['dom']})]}),
    ).toThrow(/repeats its own evidence layer/);
  });

  it('refuses a required expectation nothing has adopted', () => {
    expect(
      pattern({
        expectations: [
          expectation({
            sources: [APG_SOMETHING],
            wcagOutcome: 'The probe state is programmatically available.',
            enforcement: 'required',
          }),
        ],
      }),
    ).toThrow(/its primary source is neither/);
  });

  it('refuses an advisory expectation that does not say why it is advisory', () => {
    expect(
      pattern({expectations: [expectation({enforcement: 'advisory'})]}),
    ).toThrow(/does not say why the outcome is not adopted as a gate/);
  });

  it('refuses an expectation that carries no completeness dimension', () => {
    expect(pattern({expectations: [expectation({covers: []})]})).toThrow(
      /carries no completeness dimension/,
    );
  });

  it('refuses a dimension that is claimed twice', () => {
    expect(
      pattern({
        exemptions: {
          '4.1.2-name-role-value': {
            owner: 'someone else',
            verifiedBy: 'a different suite',
            reason: 'Because the other suite already reads it.',
          },
        },
      }),
    ).toThrow(/both encoded by probe.outcome.observed and exempted/);
  });

  it('lets a dimension be part-encoded when the exemption owns the remainder', () => {
    expect(
      pattern({
        exemptions: {
          '4.1.2-name-role-value': {
            owner: 'the caller',
            verifiedBy: 'integration review',
            reason: 'Half of this criterion is not visible to one component.',
            coversRemainderOnly: true,
          },
        },
      }),
    ).not.toThrow();
  });

  it('refuses a remainder-only exemption when nothing encodes the rest', () => {
    expect(
      pattern({
        expectations: [expectation({covers: ['2.1.1-keyboard']})],
        exemptions: {
          '4.1.2-name-role-value': {
            owner: 'the caller',
            verifiedBy: 'integration review',
            reason: 'Half of this criterion is not visible to one component.',
            coversRemainderOnly: true,
          },
        },
      }),
    ).toThrow(/no expectation encodes any of it/);
  });

  it('refuses an exemption with no owner', () => {
    expect(
      pattern({
        expectations: [expectation({covers: ['2.1.1-keyboard']})],
        exemptions: {
          '4.1.2-name-role-value': {
            owner: '',
            verifiedBy: 'a different suite',
            reason: 'Because the other suite already reads it.',
          },
        },
      }),
    ).toThrow(/names no owner/);
  });

  it('refuses "not applicable" as an exemption reason', () => {
    expect(
      pattern({
        expectations: [expectation({covers: ['2.1.1-keyboard']})],
        exemptions: {
          '4.1.2-name-role-value': {
            owner: 'someone else',
            verifiedBy: 'a different suite',
            reason: 'N/A',
          },
        },
      }),
    ).toThrow(/FR5 forbids a generic escape hatch/);
  });

  it('refuses a duplicate expectation id', () => {
    expect(pattern({expectations: [expectation(), expectation()]})).toThrow(
      /duplicate expectation id/,
    );
  });

  it('refuses an id that does not belong to the pattern', () => {
    expect(
      pattern({expectations: [expectation({id: 'other.outcome.observed'})]}),
    ).toThrow(/does not belong to pattern probe/);
  });
});

describe('unansweredDimensions', () => {
  it('lists every dimension the pattern has neither encoded nor exempted', () => {
    const contract = pattern()();
    const unanswered = unansweredDimensions(contract);
    expect(unanswered).not.toContain('4.1.2-name-role-value');
    expect(unanswered).toHaveLength(CHECKLIST_DIMENSIONS.length - 1);
  });
});
