// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-comment-provenance.test.mjs
 * @description Tests for the Astryx no-comment-provenance ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule, {QUOTE_ENTRY} from './no-comment-provenance.js';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {jsx: true},
    },
  },
});

const file = '/repo/packages/core/src/Button/Button.tsx';
const baselined = entries => [
  {baseline: {'packages/core/src/Button/Button.tsx': entries}, root: '/repo'},
];

// Seven prose lines with one citation: a block that restates its record.
const longCitingBlock = `
  // The panel closes when focus leaves it.
  // Focus returns to the opener when it is still in the page.
  // Otherwise focus goes to the body.
  // A pointer press outside closes it too.
  // Escape closes only the top panel.
  // The close does not move scroll.
  // Each step follows spec:AST-108.
  const a = 1;
`;

// RuleTester registers its own describe/it blocks internally, so it must run
// at the top level (Vitest 4 forbids calling suite functions inside an it()).
tester.run('no-comment-provenance', rule, {
  valid: [
    // ✅ A comment that states a reason.
    {
      code: `// Safari fires blur before click, so the close waits a frame.\nconst a = 1;`,
      filename: file,
    },
    // ✅ Strings are not comments.
    {
      code: `const a = 'spec:AST-108 FR4 #9428 2026-10-31';`,
      filename: file,
    },
    // ✅ The copyright line and the lines a tool reads, with their
    // continuation lines.
    {
      code: `// Copyright (c) Meta Platforms, Inc. and affiliates. 2026-01-01
/**
 * @input Button props
 * @pr-a11y spec:AST-030 FR12
 *   component:Button
 * SYNC: Button.doc.mjs follows #1234
 */
const a = 1;`,
      filename: file,
    },
    // ✅ A line-comment SYNC reminder keeps its continuation line.
    {
      code: `// SYNC: keep in step with
// component:Button and FR2.
const a = 1;`,
      filename: file,
    },
    // ✅ Lint and TypeScript directives, with their reasons.
    {
      code: `// eslint-disable-next-line no-console -- spec:AST-001 FR2 (#1234)
console.log(1);
// @ts-expect-error The type lags spec:AST-002 FR1.
const b: number = 'x';
/* eslint-disable no-alert */`,
      filename: file,
    },
    // ✅ The @example body of public JSDoc is a code sample.
    {
      code: `/**
 * A button.
 * @example
 * <Button since="2026-10-31" label="FR4" />
 */
export function Button() { return null; }`,
      filename: file,
    },
    // ✅ The Effect note names the system it syncs.
    {
      code: `function C() {
  // Syncs the document title with the open panel.
  useEffect(() => {}, []);
}`,
      filename: file,
    },
    // ✅ Code samples in any comment: @example sections and fenced code.
    {
      code: `function f() {
  /**
   * Parses a date.
   * @example
   * parse('2026-10-31') // FR4
   */
  /*
   * \`\`\`
   * const issue = '#1234'; // 2026-10-31
   * \`\`\`
   */
  return 1;
}`,
      filename: file,
    },
    // ✅ Hex colours, quoted dates, and lowercase must are not provenance.
    {
      code: `// Fall back to #000, #333333, #DD1234, or #DEC123.
// Dates look like "2026-10-31" or \`2026-01-02\`.
// The caller must pass a label.
const a = 1;`,
      filename: file,
    },
    // ✅ The baseline allows each listed site.
    {
      code: `// Follows spec:AST-108 FR4 since #9428 on 2026-10-31.
// The panel MUST close.
const a = 1;`,
      filename: file,
      options: baselined([
        'spec:AST-108',
        'FR4',
        '#9428',
        '2026-10-31',
        QUOTE_ENTRY,
      ]),
    },
    // ✅ A long block without a citation is not a quote.
    {
      code: longCitingBlock.replace(' Each step follows spec:AST-108.', ''),
      filename: file,
    },
  ],
  invalid: [
    // ❌ Record ids of each kind, with a claim suffix kept in one finding.
    {
      code: `// See spec:AST-108/FR4, component:Button, module:Icon/registry,
// architecture:knowledge-contracts, family:menus, design:reduced-motion,
// theme:butter, and AST-094.
const a = 1;`,
      filename: file,
      errors: [
        {messageId: 'record', data: {entry: 'spec:AST-108/FR4'}},
        {messageId: 'record', data: {entry: 'component:Button'}},
        {messageId: 'record', data: {entry: 'module:Icon/registry'}},
        {
          messageId: 'record',
          data: {entry: 'architecture:knowledge-contracts'},
        },
        {messageId: 'record', data: {entry: 'family:menus'}},
        {messageId: 'record', data: {entry: 'design:reduced-motion'}},
        {messageId: 'record', data: {entry: 'theme:butter'}},
        {messageId: 'record', data: {entry: 'AST-094'}},
      ],
    },
    // ❌ Claim ids.
    {
      code: `/* Holds FR12, INV3, DEC-4, and AR2b. */\nconst a = 1;`,
      filename: file,
      errors: [
        {messageId: 'claim', data: {entry: 'FR12'}, column: 10},
        {messageId: 'claim', data: {entry: 'INV3'}},
        {messageId: 'claim', data: {entry: 'DEC-4'}},
        {messageId: 'claim', data: {entry: 'AR2b'}},
      ],
    },
    // ❌ Pull request and issue references.
    {
      code: `// Fixed in #4290, PR #77, and
// https://github.com/meta/astryx/pull/9428.
const a = 1;`,
      filename: file,
      errors: [
        {messageId: 'reference', data: {entry: '#4290'}},
        {messageId: 'reference', data: {entry: 'PR #77'}},
        {
          messageId: 'reference',
          data: {entry: 'https://github.com/meta/astryx/pull/9428'},
        },
      ],
    },
    // ❌ Date stamps.
    {
      code: `// Decided 2026-10-31; true as of Oct 2026.\nconst a = 1;`,
      filename: file,
      errors: [
        {messageId: 'date', data: {entry: '2026-10-31'}},
        {messageId: 'date', data: {entry: 'as of Oct 2026'}},
      ],
    },
    // ❌ Requirement text in capitals is a quote.
    {
      code: `// The panel MUST close when focus leaves it.\nconst a = 1;`,
      filename: file,
      errors: [{messageId: 'quote', data: {entry: QUOTE_ENTRY}, column: 14}],
    },
    // ❌ A long block that cites a record is a quote too.
    {
      code: longCitingBlock,
      filename: file,
      errors: [
        {messageId: 'longQuote', data: {entry: QUOTE_ENTRY}, line: 2},
        {messageId: 'record', data: {entry: 'spec:AST-108'}, line: 8},
      ],
    },
    // ❌ JSDoc on exports and on their members keeps no citations.
    {
      code: `/** Closes on select, as decided in #9123 (component:Menu FR7). */
export function Menu() { return null; }

export interface MenuProps {
  /** The label. Added 2026-10-31. */
  label: string;
}

/** Local, exported below. Follows INV3. */
const helper = () => 1;
export {helper};`,
      filename: file,
      errors: [
        {messageId: 'reference', data: {entry: '#9123'}},
        {messageId: 'record', data: {entry: 'component:Menu'}},
        {messageId: 'claim', data: {entry: 'FR7'}},
        {messageId: 'date', data: {entry: '2026-10-31'}},
        {messageId: 'claim', data: {entry: 'INV3'}},
      ],
    },
    // ❌ Public JSDoc keeps no quote blocks.
    {
      code: `export interface ButtonProps {
  /** The label. It MUST be short. */
  label: string;
}`,
      filename: file,
      errors: [{messageId: 'quote', data: {entry: QUOTE_ENTRY}}],
    },
    // ❌ File header lines that no tool reads keep no citations.
    {
      code: `/**
 * @file Button.tsx
 * @position Core primitive; follows spec:AST-010 FR1.
 */
const a = 1;`,
      filename: file,
      errors: [
        {messageId: 'record', data: {entry: 'spec:AST-010'}},
        {messageId: 'claim', data: {entry: 'FR1'}},
      ],
    },
    // ❌ The Effect note keeps no citations.
    {
      code: `function C() {
  // Syncs the document title (architecture:react-component-runtime INV3).
  useEffect(() => {}, []);
}`,
      filename: file,
      errors: [
        {
          messageId: 'record',
          data: {entry: 'architecture:react-component-runtime'},
        },
        {messageId: 'claim', data: {entry: 'INV3'}},
      ],
    },
    // ❌ JSDoc inside a function body.
    {
      code: `export function C() {
  /** Follows INV3. */
  const a = 1;
  return a;
}`,
      filename: file,
      errors: [{messageId: 'claim', data: {entry: 'INV3'}}],
    },
    // ❌ JSDoc on a declaration that is not exported.
    {
      code: `/** Follows INV3. */\nfunction local() {}`,
      filename: file,
      errors: [{messageId: 'claim', data: {entry: 'INV3'}}],
    },
    // ❌ A comment before an Effect that does not name what it syncs.
    {
      code: `function C() {
  // Runs once (spec:AST-099).
  useEffect(() => {}, []);
}`,
      filename: file,
      errors: [{messageId: 'record', data: {entry: 'spec:AST-099'}}],
    },
    // ❌ The baseline allows as many sites as it lists; one more is reported.
    {
      code: `// FR4 here.\nconst a = 1;\n// FR4 again.\nconst b = 2;`,
      filename: file,
      options: baselined(['FR4']),
      errors: [{messageId: 'claim', data: {entry: 'FR4'}, line: 3}],
    },
    // ❌ A baseline entry for another file allows nothing here.
    {
      code: `// See #4290.\nconst a = 1;`,
      filename: '/repo/packages/core/src/Card/Card.tsx',
      options: baselined(['#4290']),
      errors: [{messageId: 'reference', data: {entry: '#4290'}}],
    },
  ],
});
