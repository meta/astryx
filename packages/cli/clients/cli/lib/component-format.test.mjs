// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {formatBrief, formatCompact, formatFull} from './component-format.mjs';

describe('component accessibility guidance', () => {
  const docs = {
    name: 'Button',
    description: 'An action.',
    usage: {
      accessibility: [
        {
          name: 'Loading',
          description: 'Expose aria-busy and block duplicate activation.',
        },
      ],
    },
    props: [],
  };

  it('renders a dedicated section in full output', () => {
    const out = formatFull(docs);
    expect(out).toContain('## Accessibility');
    expect(out).toContain(
      '- **Loading:** Expose aria-busy and block duplicate activation.',
    );
  });

  it('keeps accessibility guidance in compact agent output', () => {
    const out = formatCompact(docs, 'Button');
    expect(out).toContain('## Accessibility');
    expect(out).toContain('Expose aria-busy and block duplicate activation.');
  });

  it('omits the section when a component has no authored requirements', () => {
    expect(formatFull({...docs, usage: {}})).not.toContain('## Accessibility');
  });

  it('ignores legacy non-array accessibility content', () => {
    const legacyDocs = {
      ...docs,
      usage: {accessibility: 'Follow WCAG guidance.'},
    };

    expect(() => formatFull(legacyDocs)).not.toThrow();
    expect(formatFull(legacyDocs)).not.toContain('## Accessibility');
    expect(formatCompact(legacyDocs, 'Button')).not.toContain(
      '## Accessibility',
    );
  });
});

describe('formatFull sub-component rendering', () => {
  // Regression guard: sub-components are sometimes declared as a bare
  // reference, e.g. {name: 'XDSRadioListItem'}, with props/description in
  // their own .doc.mjs. Previously `comp.description` was undefined and got
  // printed as the literal string "undefined", and the props area was blank.
  it('does not print "undefined" for a bare {name} sub-component', () => {
    const docs = {
      name: 'RadioList',
      description: 'Radio group container.',
      components: [{name: 'XDSRadioListItem'}],
    };
    const out = formatFull(docs);

    expect(out).toContain('### XDSRadioListItem');
    expect(out).not.toContain('undefined');
    // Points the reader at the sub-component's own docs instead of a blank.
    expect(out).toMatch(
      /(?:astryx|@astryxdesign\/cli(?:@\S+)?) component XDSRadioListItem/,
    );
  });

  it('renders a full props table for a sub-component that has inline props', () => {
    const docs = {
      name: 'ButtonGroup',
      description: 'Groups buttons.',
      components: [
        {
          name: 'XDSButtonGroup',
          description: 'Connected button styling.',
          props: [
            {
              name: 'label',
              type: 'string',
              description: 'Accessible label.',
              required: true,
            },
          ],
        },
      ],
    };
    const out = formatFull(docs);

    expect(out).toContain('### XDSButtonGroup');
    expect(out).toContain('Connected button styling.');
    expect(out).toContain('| `label` |');
    expect(out).not.toContain('undefined');
    // With real props, it should NOT emit the "see docs" pointer.
    expect(out).not.toContain('astryx component XDSButtonGroup');
  });
});

describe('formatFull theming override keys', () => {
  // Regression guard: the `defineTheme` component-override key is the stable
  // class name with the `astryx-` prefix stripped — `generateThemeRules`
  // re-adds the prefix to build the `.astryx-*` selector. targetKey() used to
  // strip a dead `xds-` prefix (from before the astryx rename), so the printed
  // example advertised `astryx-*` keys. Those double-prefix to
  // `.astryx-astryx-*` at runtime and silently match nothing. See issue #3458.
  it('prints override keys without the astryx- prefix (single-word component)', () => {
    const docs = {
      name: 'Button',
      description: 'A button.',
      theming: {
        targets: [{className: 'astryx-button', visualProps: ['variant']}],
      },
    };
    const out = formatFull(docs);

    expect(out).toContain("'button': {");
    // The full DOM class must not appear as an override key.
    expect(out).not.toContain("'astryx-button': {");
  });

  it('prints override keys without the astryx- prefix (compound Table classes)', () => {
    const docs = {
      name: 'Table',
      description: 'A table.',
      theming: {
        targets: [
          {className: 'astryx-table-header'},
          {className: 'astryx-table-cell'},
        ],
      },
    };
    const out = formatFull(docs);

    // Correct keys: class name minus the astryx- prefix.
    expect(out).toContain("'table-header': {");
    expect(out).toContain("'table-cell': {");
    // The verbatim DOM class names must not be advertised as override keys.
    expect(out).not.toContain("'astryx-table-header': {");
    expect(out).not.toContain("'astryx-table-cell': {");
  });
});

/** Pipes that actually separate cells — a `\|` is content, not a separator. */
function cellPipes(row) {
  return (row.match(/(?<!\\)\|/g) || []).length;
}

describe('markdown table cells escape their pipes', () => {
  // A prop type is a union, and a union is spelled with `|` — the very
  // character GFM uses to separate cells. Backticks do not protect it: a row
  // with more cells than the header has columns gets its excess *discarded*,
  // so an unescaped `gap: 0 | 0.5 | ...` silently eats its own Default and
  // Description columns. See packages/core/src/Markdown/parser.ts, which
  // splits on unescaped pipes and preserves `\|` as literal.
  it('keeps a union-typed prop row at four cells', () => {
    const docs = {
      name: 'Grid',
      description: 'A grid.',
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          default: '2',
          description: 'Spacing between all items.',
        },
      ],
    };
    const row = formatFull(docs)
      .split('\n')
      .find(l => l.startsWith('| `gap`'));

    // A 4-column row has exactly 5 separators. Unescaped, this row had 15.
    expect(cellPipes(row)).toBe(5);
    expect(row).toContain('\\|');
    // The columns the unescaped pipes were swallowing.
    expect(row).toContain('`2`');
    expect(row).toContain('Spacing between all items.');
  });

  it('escapes pipes in a description too', () => {
    const docs = {
      name: 'AppShell',
      description: 'A shell.',
      props: [
        {
          name: 'mobileNav',
          type: 'ReactNode',
          description: "Config. breakpoint is 'sm' | 'md' | 'lg' | 'none'.",
        },
      ],
    };
    const row = formatFull(docs)
      .split('\n')
      .find(l => l.startsWith('| `mobileNav`'));

    expect(cellPipes(row)).toBe(5);
  });
});

describe('formatBrief signature stays terse', () => {
  // `--detail brief` exists to be token-cheap. It hoists union-typed props into
  // the signature because a short enum reads at a glance — but an 11-member
  // spacing scale does not, and Stack carries four of them (gap, padding,
  // paddingInline, paddingBlock), so the same scale got printed four times.
  // Long unions stay in the terse prop list, exactly as they did when the type
  // was still the bare name `SpacingStep`.
  it('hoists a short enum but not a long scale', () => {
    const docs = {
      name: 'HStack',
      description: 'A stack.',
      props: [
        {
          name: 'gap',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description: 'Gap.',
        },
        {
          name: 'wrap',
          type: "'nowrap' | 'wrap' | 'wrap-reverse'",
          description: 'Wrap.',
        },
        {
          name: 'hAlign',
          type: "'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'",
          description: 'Align.',
        },
      ],
    };
    const signature = formatBrief(docs, 'HStack', '').split('\n')[0];

    // Short enums still earn their place in the signature.
    expect(signature).toContain('wrap: nowrap|wrap|wrap-reverse');
    expect(signature).toContain(
      'hAlign: start|center|end|between|around|evenly',
    );
    // The long scale does not.
    expect(signature).not.toContain('0|0.5|1|1.5|2|3|4|5|6|8|10');
    // But the prop is still named, so it is not lost.
    expect(formatBrief(docs, 'HStack', '')).toContain('gap');
  });
});
