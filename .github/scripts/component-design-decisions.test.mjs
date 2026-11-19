// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  DESIGN_DECISIONS_COLUMNS,
  classifyDesignDecisionChange,
  parseDesignDecisionsBlock,
  validateDesignDecisionsBlock,
} = require('./component-design-decisions.cjs');

function record({
  kind = 'component',
  authority = 'current',
  before = 'Body.',
  decisions = null,
  after = 'More body.',
} = {}) {
  const block =
    decisions === null
      ? ''
      : `\n\n### Design decisions\n\n<!-- design-decisions:v1 -->\n\n| ${DESIGN_DECISIONS_COLUMNS.join(' | ')} |\n| --- | --- | --- | --- | --- |${decisions
          .map(row => `\n| ${row.join(' | ')} |`)
          .join('')}`;
  return `---\nkind: ${kind}\nauthority: ${authority}\n---\n\n# Record\n\n## Design relationships\n\n${before}${block}\n\n### Theming anatomy\n\n${after}\n`;
}

const row = [
  'DD1',
  'Keep the label visually quiet.',
  'The primary action remains easiest to scan.',
  'Default label',
  'Theme token substitutions may preserve contrast.',
];

describe('parseDesignDecisionsBlock', () => {
  it('accepts an absent optional block', () => {
    const parsed = parseDesignDecisionsBlock(record());
    expect(parsed).toMatchObject({present: false, valid: true, rows: []});
    expect(validateDesignDecisionsBlock(parsed)).toEqual([]);
  });

  it('parses the exact columns and stable IDs', () => {
    const parsed = parseDesignDecisionsBlock(record({decisions: [row]}));
    expect(parsed.valid).toBe(true);
    expect(parsed.rows).toEqual([
      {
        id: 'DD1',
        decision: row[1],
        intentOrReason: row[2],
        appliesTo: row[3],
        allowedVariation: row[4],
      },
    ]);
    expect(validateDesignDecisionsBlock(parsed)).toEqual([]);
  });

  it('allows a header-only template but not an authored record', () => {
    const parsed = parseDesignDecisionsBlock(record({decisions: []}));
    expect(
      validateDesignDecisionsBlock(parsed, {allowHeaderOnly: true}),
    ).toEqual([]);
    expect(validateDesignDecisionsBlock(parsed).join('\n')).toMatch(
      /requires at least one decision row/,
    );
  });

  it.each([
    {
      name: 'wrong parent',
      mutate: value =>
        value.replace(
          '## Design relationships',
          '## Behavior\n\nBody.\n\n## Other',
        ),
      expected: /subsection of "Design relationships"/,
    },
    {
      name: 'duplicate subsection',
      mutate: value => `${value}\n### Design decisions\n`,
      expected: /duplicate "Design decisions"/,
    },
    {
      name: 'missing marker',
      mutate: value => value.replace('<!-- design-decisions:v1 -->', ''),
      expected: /requires exactly one/,
    },
    {
      name: 'wrong columns',
      mutate: value => value.replace('Intent or reason', 'Rationale'),
      expected: /columns must be exactly/,
    },
    {
      name: 'empty cell',
      mutate: value => value.replace(row[2], ''),
      expected: /non-empty cells/,
    },
    {
      name: 'invalid id',
      mutate: value => value.replace('| DD1 |', '| DEC-1 |'),
      expected: /must match DD1/,
    },
    {
      name: 'duplicate id',
      mutate: value =>
        value.replace(
          `| ${row.join(' | ')} |`,
          `| ${row.join(' | ')} |\n| ${row.join(' | ')} |`,
        ),
      expected: /duplicate design-decision id DD1/,
    },
    {
      name: 'trailing prose',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\nTrailing prose.\n\n### Theming anatomy',
        ),
      expected: /must contain only its marker/,
    },
    {
      name: 'a deeper heading',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\n#### Hidden section\n\n### Theming anatomy',
        ),
      expected: /must contain only its marker/,
    },
    {
      name: 'a second table',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\n| Other | Table |\n| --- | --- |\n\n### Theming anatomy',
        ),
      expected: /every design-decision row/,
    },
    {
      name: 'a row after a blank',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          `\n\n| ${row.join(' | ')} |\n\n### Theming anatomy`,
        ),
      expected: /must contain only its marker/,
    },
    {
      name: 'a code fence trick',
      mutate: value =>
        value.replace(
          '<!-- design-decisions:v1 -->',
          '```md\n<!-- design-decisions:v1 -->\n```',
        ),
      expected: /must contain only its marker/,
    },
    {
      name: 'a comment trick',
      mutate: value =>
        value.replace(
          '<!-- design-decisions:v1 -->',
          '<!-- hidden -->\n<!-- design-decisions:v1 -->',
        ),
      expected: /must contain only its marker/,
    },
  ])('rejects $name', ({mutate, expected}) => {
    const parsed = parseDesignDecisionsBlock(
      mutate(record({decisions: [row]})),
    );
    expect(validateDesignDecisionsBlock(parsed).join('\n')).toMatch(expected);
  });
});

describe('classifyDesignDecisionChange', () => {
  const path = 'docs/specs/components/Button/Button.spec.md';

  it('stays dependency-free for trusted workflow loading', () => {
    const source = readFileSync(
      fileURLToPath(
        new URL('./component-design-decisions.cjs', import.meta.url),
      ),
      'utf8',
    );
    const mod = {exports: {}};
    new Function('module', 'exports', 'require', source)(
      mod,
      mod.exports,
      () => {
        throw new Error(
          'component-design-decisions.cjs must stay dependency-free',
        );
      },
    );
    expect(typeof mod.exports.classifyDesignDecisionChange).toBe('function');
  });

  it('classifies unrelated edits as no DD change', () => {
    expect(
      classifyDesignDecisionChange({
        basePath: path,
        headPath: path,
        baseContent: record(),
        headContent: record({before: 'Changed body.'}),
      }).classification,
    ).toBe('no-dd-change');
  });

  it('classifies a valid current component block edit as DD-only', () => {
    expect(
      classifyDesignDecisionChange({
        basePath: path,
        headPath: path,
        baseContent: record({decisions: [row]}),
        headContent: record({
          decisions: [
            [...row.slice(0, 1), 'Use a quiet label.', ...row.slice(2)],
          ],
        }),
      }).classification,
    ).toBe('dd-only');
  });

  it('classifies a valid current module block edit as DD-only', () => {
    const modulePath =
      'docs/specs/components/Table/plugins/rowStatus/useTableRowStatus.spec.md';
    expect(
      classifyDesignDecisionChange({
        basePath: modulePath,
        headPath: modulePath,
        baseContent: record({kind: 'module', decisions: [row]}),
        headContent: record({
          kind: 'module',
          decisions: [['DD1', 'Use a quiet module label.', ...row.slice(2)]],
        }),
      }).classification,
    ).toBe('dd-only');
  });

  it('classifies adding the optional block as DD-only when every outside byte matches', () => {
    expect(
      classifyDesignDecisionChange({
        basePath: path,
        headPath: path,
        baseContent: record(),
        headContent: record({decisions: [row]}),
      }).classification,
    ).toBe('dd-only');
  });

  it.each([
    {
      name: 'outside bytes also change',
      input: {
        baseContent: record({decisions: [row]}),
        headContent: record({
          before: 'Changed body.',
          decisions: [
            ['DD1', 'Keep the label visually subtle.', ...row.slice(2)],
          ],
        }),
      },
    },
    {
      name: 'authority changes',
      input: {
        baseContent: record({authority: 'draft'}),
        headContent: record({authority: 'current', decisions: [row]}),
      },
    },
    {
      name: 'kind changes',
      input: {
        baseContent: record(),
        headContent: record({kind: 'module', decisions: [row]}),
      },
    },
    {
      name: 'block is malformed',
      input: {
        baseContent: record(),
        headContent: record({decisions: [row]}).replace('| DD1 |', '| bad |'),
      },
    },
    {
      name: 'an authored block has no rows',
      input: {
        baseContent: record(),
        headContent: record({decisions: []}),
      },
    },
  ])('fails closed when $name', ({input}) => {
    expect(
      classifyDesignDecisionChange({basePath: path, headPath: path, ...input})
        .classification,
    ).toBe('mixed');
  });

  it.each([
    {
      name: 'trailing prose',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\nTrailing prose.\n\n### Theming anatomy',
        ),
    },
    {
      name: 'a deeper heading',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\n#### Hidden section\n\n### Theming anatomy',
        ),
    },
    {
      name: 'a second table',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          '\n| Other | Table |\n| --- | --- |\n\n### Theming anatomy',
        ),
    },
    {
      name: 'a row after a blank',
      mutate: value =>
        value.replace(
          '\n\n### Theming anatomy',
          `\n\n| ${row.join(' | ')} |\n\n### Theming anatomy`,
        ),
    },
    {
      name: 'a code fence trick',
      mutate: value =>
        value.replace(
          '<!-- design-decisions:v1 -->',
          '```md\n<!-- design-decisions:v1 -->\n```',
        ),
    },
    {
      name: 'a comment trick',
      mutate: value =>
        value.replace(
          '<!-- design-decisions:v1 -->',
          '<!-- hidden -->\n<!-- design-decisions:v1 -->',
        ),
    },
  ])('classifies $name as mixed', ({mutate}) => {
    const result = classifyDesignDecisionChange({
      basePath: path,
      headPath: path,
      baseContent: record(),
      headContent: mutate(record({decisions: [row]})),
    });
    expect(result.classification).toBe('mixed');
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('fails closed on a rename even when the bytes are unchanged', () => {
    expect(
      classifyDesignDecisionChange({
        basePath: path,
        headPath: 'packages/core/src/Action/Action.spec.md',
        baseContent: record(),
        headContent: record(),
      }).classification,
    ).toBe('mixed');
  });
});
