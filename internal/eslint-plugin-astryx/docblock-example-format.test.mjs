// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docblock-example-format.test.mjs
 * Tests for the docblock-example-format ESLint rule.
 */

import {describe, it} from 'vitest';
import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import docblockExampleFormatRule from './docblock-example-format.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
    },
  },
});

describe('docblock-example-format', () => {
ruleTester.run('docblock-example-format', docblockExampleFormatRule, {
  valid: [
    // Pattern 1: @example on its own line, ``` on next line
    {
      code: `
/**
 * A button component.
 *
 * @example
 * \`\`\`
 * <Button label="Click" />
 * \`\`\`
 */
function Button() {}
      `,
    },
    // @example with ```tsx language tag
    {
      code: `
/**
 * @example
 * \`\`\`tsx
 * <Button label="Click" />
 * \`\`\`
 */
function Button() {}
      `,
    },
    // No @example at all — perfectly fine
    {
      code: `
/**
 * A simple helper function.
 */
function helper() {}
      `,
    },
    // @example with blank line before fence — still valid
    {
      code: `
/**
 * @example
 *
 * \`\`\`
 * <Button />
 * \`\`\`
 */
function Button() {}
      `,
    },
    // Multiple valid @example blocks
    {
      code: `
/**
 * @example
 * \`\`\`
 * <Button variant="primary" />
 * \`\`\`
 *
 * @example
 * \`\`\`
 * <Button variant="ghost" />
 * \`\`\`
 */
function Button() {}
      `,
    },
  ],

  invalid: [
    // Inline: @example with code on the same line
    {
      code: `
/**
 * @example getInitials('John Doe') // 'JD'
 */
function getInitials() {}
      `,
      errors: [{messageId: 'inlineExample'}],
    },
    // Inline: @example with JSX on same line
    {
      code: `
/**
 * @example <Button label="Click" />
 */
function Button() {}
      `,
      errors: [{messageId: 'inlineExample'}],
    },
    // Inline: @example with string on same line
    {
      code: `
/**
 * @example "mod+k", "mod+shift+p"
 */
function Shortcut() {}
      `,
      errors: [{messageId: 'inlineExample'}],
    },
    // Missing fence: @example then code without ```
    {
      code: `
/**
 * @example
 * <Button label="Click" />
 */
function Button() {}
      `,
      errors: [{messageId: 'missingFence'}],
    },
    // Missing fence: @example then comment without ```
    {
      code: `
/**
 * @example
 * // Default usage
 * <Button label="Click" />
 */
function Button() {}
      `,
      errors: [{messageId: 'missingFence'}],
    },
    // Mixed: one valid, one inline
    {
      code: `
/**
 * @example
 * \`\`\`
 * <Button />
 * \`\`\`
 *
 * @example dividers={['top']}
 */
function Section() {}
      `,
      errors: [{messageId: 'inlineExample'}],
    },
    // Prop-level docblock with inline example
    {
      code: `
interface Props {
  /**
   * @example dividers={['top', 'bottom']}
   */
  dividers?: string[];
}
      `,
      errors: [{messageId: 'inlineExample'}],
    },
  ],
});
});
