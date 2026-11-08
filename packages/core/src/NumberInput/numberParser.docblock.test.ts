// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file numberParser.docblock.test.ts
 * @input The rule paragraph in numberParser.ts, and the parser itself
 * @output Nothing; fails when the two disagree
 * @position Test-only; grades the prose in numberParser.ts against the code
 *
 * The file docblock of numberParser.ts states the rule the parser follows.
 * A sentence like that rots silently — the code moves and the words stay —
 * and the next person to change this file reads the words. So the paragraph
 * is executable here: `predict` implements it, clause by clause, and every
 * input is graded prose-against-parser.
 *
 * The one discipline that makes the number mean anything: `predict` may use
 * ONLY what the paragraph says. Every branch below quotes the clause it
 * implements, and those quotes are asserted verbatim against the source, so
 * a paragraph that loses a clause fails here instead of drifting. If the
 * parser grows a rule the words do not mention, this test goes red — that is
 * the point, not a defect.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/NumberInput/numberParser.ts
 */

import {describe, it, expect} from 'vitest';
import {parseLocaleNumber} from './numberParser';
import SOURCE from './numberParser.ts?raw';

/** The docblock as running prose: comment markers and line breaks removed. */
const PROSE = SOURCE.replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ');

/** Every clause `predict` is allowed to know, quoted from the docblock. */
const CLAUSES = {
  'defer to the alphabet': 'SEPARATOR_CHARS below is a bounded alphabet',
  'fold the space family': 'the whole space family folds to it under NFKC',
  'refuse what no reading fits': 'text that no reading fits returns null',
  'prefer the locale': 'Where both readings are well formed the locale',
  'size every group':
    "Grouping is well formed only when every group fits the locale's own " +
    'sizes: the last exactly the primary size, each inner one exactly the ' +
    'secondary, the first no longer than that.',
  'fall back to the decimal point': 'keep the full stop as a decimal point',
  'read three-digit groups anywhere':
    'Groups of three fit every locale, so a separator repeated with ' +
    'three-digit groups is grouping in all of them',
  'need only one group-only occurrence':
    'for a space or apostrophe, which no locale writes as a decimal point, ' +
    'one occurrence is enough',
} as const;

/** The bounded alphabet the docblock defers to, read out of the source. */
const ALPHABET: ReadonlySet<string> = new Set(
  JSON.parse(
    `"${/const SEPARATOR_CHARS = "([^"]*)"/.exec(SOURCE)?.[1] ?? ''}"`,
  ),
);

const symbolsCache = new Map<string, ReturnType<typeof readSymbols>>();
function readSymbols(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const sizes = new Intl.NumberFormat(locale)
    .formatToParts(11111111111)
    .filter(p => p.type === 'integer')
    .map(p => p.value.length);
  const grouped = sizes.length > 1;
  return {
    group: (parts.find(p => p.type === 'group')?.value ?? ',').normalize(
      'NFKC',
    ),
    decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
    primary: grouped ? sizes[sizes.length - 1] : 3,
    secondary: grouped ? sizes[sizes.length - 2] : 3,
  };
}
function symbolsOf(locale: string) {
  let s = symbolsCache.get(locale);
  if (s === undefined) {
    s = readSymbols(locale);
    symbolsCache.set(locale, s);
  }
  return s;
}

/** CLAUSES['size every group'], with the sizes it is handed. */
function groupsFit(chunks: string[], primary: number, secondary: number) {
  return (
    chunks[chunks.length - 1].length === primary &&
    chunks[0].length <= secondary &&
    chunks.slice(1, -1).every(chunk => chunk.length === secondary)
  );
}

/** CLAUSES['need only one group-only occurrence']: "a space or apostrophe". */
const isSpaceOrApostrophe = (char: string) => /^[\s'\u2019]$/.test(char);

const SKIPPED = Symbol('outside the paragraph');

/**
 * The paragraph, as code. Digits with one separator character repeated
 * between them is the shape it describes; anything else is not this
 * paragraph's subject and is skipped rather than guessed at.
 */
function predict(input: string, locale: string): number | null | symbol {
  // CLAUSES['fold the space family'].
  const text = input.normalize('NFKC');
  if (!/^\d/.test(text) || !/\d$/.test(text)) {
    return SKIPPED;
  }
  const separators = [...new Set(text.replace(/\d/g, ''))];
  if (separators.length !== 1) {
    return SKIPPED;
  }
  const [separator] = separators;

  // CLAUSES['defer to the alphabet'].
  if (!ALPHABET.has(separator)) {
    return null;
  }

  const chunks = text.split(separator);
  const {group, decimal, primary, secondary} = symbolsOf(locale);

  // CLAUSES['prefer the locale'] + CLAUSES['size every group']: of the two
  // locale readings, grouping wins wherever it is well formed.
  if (separator === group && groupsFit(chunks, primary, secondary)) {
    return Number(chunks.join(''));
  }
  // The locale's other reading. A decimal point appears once.
  if (separator === decimal && chunks.length === 2) {
    return Number(`${chunks[0]}.${chunks[1]}`);
  }
  // CLAUSES['fall back to the decimal point'], for a full stop the locale
  // could read neither way.
  if (separator === '.' && chunks.length === 2) {
    return Number(text);
  }
  // CLAUSES['read three-digit groups anywhere'], and CLAUSES['need only one
  // group-only occurrence'] for how many occurrences it takes.
  const enough = isSpaceOrApostrophe(separator) ? 1 : 2;
  if (chunks.length - 1 >= enough && groupsFit(chunks, 3, 3)) {
    return Number(chunks.join(''));
  }
  // CLAUSES['refuse what no reading fits'].
  return null;
}

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN', 'ar-SA'];

/** The shapes the paragraph names, plus the seams around each clause. */
const NAMED: [string, string][] = [
  ['1.234', 'de-DE'],
  ['1.2345', 'de-DE'],
  ['1234.567', 'de-DE'],
  ['12345.678', 'de-DE'],
  ['12.345', 'de-DE'],
  ['1.23', 'de-DE'],
  ['1,234,567', 'en-US'],
  ['1,234,567', 'de-DE'],
  ['1.234.567', 'en-US'],
  ['1234.567.890', 'de-DE'],
  ['1 234', 'en-US'],
  ['1\u00A0234', 'en-US'],
  ['1 234 567', 'en-US'],
  ['1234 567', 'fr-FR'],
  ["1'234", 'de-CH'],
  ["1'234", 'en-US'],
  ['1\u2019234', 'de-CH'],
  ['1,234', 'en-IN'],
  ['12,34,567', 'en-IN'],
  ['123,45,678', 'en-IN'],
  ['1,2,345', 'en-IN'],
  ['1\u066C234', 'ar-SA'],
  ['1\u066B5', 'ar-SA'],
  ['1\u00B7234\u00B7567', 'en-US'],
  ['123-456-789', 'en-US'],
];

/** Every one-, two- and three-separator shape over short digit runs. */
function* generated() {
  const runs = ['1', '12', '123', '1234', '12345'];
  for (const locale of LOCALES) {
    for (const separator of ALPHABET) {
      for (const a of runs) {
        for (const b of runs) {
          yield [`${a}${separator}${b}`, locale] as [string, string];
          for (const c of runs) {
            yield [`${a}${separator}${b}${separator}${c}`, locale] as [
              string,
              string,
            ];
            for (const d of runs) {
              yield [
                `${a}${separator}${b}${separator}${c}${separator}${d}`,
                locale,
              ] as [string, string];
            }
          }
        }
      }
    }
  }
}

describe('the numberParser docblock', () => {
  it.each(Object.entries(CLAUSES))('still says: %s', (_name, quote) => {
    expect(PROSE).toContain(quote);
  });

  it.each(NAMED)('reads %j in %s the way the parser does', (input, locale) => {
    expect(predict(input, locale)).toBe(parseLocaleNumber(input, locale));
  });

  it('reads every generated shape the way the parser does', () => {
    const disagreements: string[] = [];
    let checked = 0;
    for (const [input, locale] of generated()) {
      const said = predict(input, locale);
      if (said === SKIPPED) {
        continue;
      }
      checked++;
      const did = parseLocaleNumber(input, locale);
      if (!Object.is(said, did)) {
        disagreements.push(
          `${JSON.stringify(input)} in ${locale}: docblock ${String(said)}, parser ${String(did)}`,
        );
      }
    }
    // The sweep is the evidence; a shrunken one silently proves nothing.
    expect(checked).toBeGreaterThan(30000);
    expect(disagreements.slice(0, 10)).toEqual([]);
  });
});
