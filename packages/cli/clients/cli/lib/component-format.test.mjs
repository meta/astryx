// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  formatBestPractices,
  formatBrief,
  formatCompact,
  formatFull,
  formatProps,
} from './component-format.mjs';

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

    expect(out).toContain('XDSRadioListItem');
    expect(out).not.toContain('undefined');
    // Points the reader at the sub-component's own docs instead of a blank.
    expect(out).toMatch(
      /^See `(?:\S+ )*(?:astryx|@astryxdesign\/cli(?:@\S+)?) component XDSRadioListItem` for its props and usage\.$/m,
    );
    expect(out).not.toContain('### XDSRadioListItem');
  });

  it('names consecutive bare sub-components on one line, in order', () => {
    const docs = {
      name: 'Table',
      description: 'Rows and columns.',
      components: [
        {name: 'TableHeader'},
        {name: 'TableBody'},
        {name: 'TableRow', description: 'One row of cells.'},
        {name: 'TableCell'},
        {name: 'useTableSortable'},
      ],
    };
    for (const out of [formatFull(docs), formatCompact(docs, 'Table', '')]) {
      const lines = out.split('\n');
      const shared = lines.filter(l => l.startsWith('Read each with'));
      expect(shared).toHaveLength(2);
      expect(shared[0]).toMatch(/: TableHeader, TableBody\.$/);
      expect(shared[1]).toMatch(/: TableCell, useTableSortable\.$/);
      expect(out).not.toContain('### TableHeader');
      // A sub-component with its own text keeps its heading, between the two runs.
      const row = lines.indexOf('### TableRow');
      expect(row).toBeGreaterThan(lines.indexOf(shared[0]));
      expect(row).toBeLessThan(lines.indexOf(shared[1]));
    }
  });

  it('renders a full props list for a sub-component that has inline props', () => {
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
    expect(out).toContain(
      '- `label`: `string` **(required)** - Accessible label.',
    );
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

describe('prop lists keep union types whole', () => {
  // A prop type is a union, spelled with `|`. In a list item the pipes are
  // plain text, so the type, default and description stay on one line as
  // written, with nothing escaped.
  it('prints a union-typed prop on one line with its default and description', () => {
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
    const line = formatFull(docs)
      .split('\n')
      .find(l => l.startsWith('- `gap`'));

    expect(line).toBe(
      '- `gap`: `0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10` = `2` - Spacing between all items.',
    );
  });

  it('prints no separator or placeholder for a prop with no description', () => {
    const docs = {
      name: 'Tag',
      description: 'A tag.',
      props: [{name: 'label', type: 'string', required: true}],
    };
    const line = formatFull(docs)
      .split('\n')
      .find(l => l.startsWith('- `label`'));

    expect(line).toBe('- `label`: `string` **(required)**');
  });

  it('keeps pipes in a description as written', () => {
    const docs = {
      name: 'AppShell',
      description: 'A shell.',
      props: [
        {
          name: 'mobileNav',
          type: 'ReactNode',
          description:
            "Collapses below breakpoint 'sm' | 'md' | 'lg' | 'none'.",
        },
      ],
    };
    const line = formatFull(docs)
      .split('\n')
      .find(l => l.startsWith('- `mobileNav`'));

    expect(line).toBe(
      "- `mobileNav`: `ReactNode` - Collapses below breakpoint 'sm' | 'md' | 'lg' | 'none'.",
    );
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

describe('component icon slots', () => {
  const docs = {
    name: 'CodeBlock',
    description: 'Code.',
    props: [],
    theming: {
      targets: [{className: 'astryx-code-block'}],
      componentIcons: [
        {
          slot: 'code-block-copy',
          description: 'The copy button icon.',
          fallback: '`copy`; `check` while copied',
          state: [
            {
              name: 'copied',
              type: 'boolean',
              description: 'True while copied.',
            },
          ],
          whenNull: 'Hides the glyph.',
        },
        {
          slot: 'code-block-example',
          description: 'A stateless slot.',
          fallback: '`info`',
          whenNull: 'Hides the icon.',
        },
      ],
    },
  };

  it('lists each slot with its state, fallback, role, and null behavior in full output', () => {
    const out = formatFull(docs);
    expect(out).toContain('**Component icon slots**');
    expect(out).toContain(
      '| `code-block-copy` | `copied: boolean` True while copied. | `copy`; `check` while copied | The copy button icon. | Hides the glyph. |',
    );
    expect(out).toContain(
      '| `code-block-example` | none | `info` | A stateless slot. | Hides the icon. |',
    );
  });

  it('keeps the slots in compact and brief output', () => {
    expect(formatCompact(docs, 'CodeBlock')).toContain(
      '## Component Icon Slots',
    );
    expect(formatBrief(docs, 'CodeBlock')).toContain(
      'Icon slots: code-block-copy {copied: boolean}; code-block-example',
    );
  });

  it('prints no slot section for a component without slots', () => {
    const {componentIcons: _omitted, ...theming} = docs.theming;
    expect(formatFull({...docs, theming})).not.toContain(
      'Component icon slots',
    );
  });
});

describe('example kind', () => {
  const docs = {
    name: 'Widget',
    description: 'A widget.',
    props: [],
    examples: [
      {label: 'Wrap the app', kind: 'setup', code: 'createWidgetStore(config)'},
      {label: 'Basic', code: '<Widget label="Hi" />'},
    ],
  };

  it('labels a setup example as code only in full output', () => {
    const out = formatFull(docs);
    expect(out).toContain('### Wrap the app (setup, code only)');
    expect(out).toContain('### Basic\n');
    expect(out).not.toContain('Basic (setup');
  });

  it('labels a setup example in compact output', () => {
    expect(formatCompact(docs, 'Widget')).toContain(
      '### Wrap the app (setup, code only)',
    );
  });

  it('names an unlabeled setup example "Setup"', () => {
    const out = formatFull({
      ...docs,
      examples: [{kind: 'setup', code: 'createWidgetStore(config)'}],
    });
    expect(out).toContain('### Setup (setup, code only)');
  });

  it('shows a demo example, not a setup one, as the brief usage line', () => {
    const out = formatBrief(docs, 'Widget');
    expect(out).toContain('<Widget label="Hi" />');
    expect(out).not.toContain('createWidgetStore');
  });
});

describe('prop descriptions in a component read', () => {
  const long =
    'Whether the details collapse. On by default, starting collapsed. `false` keeps them always visible, with no toggle and no animation, in every layout and at every size. `{defaultIsOpen: true}` starts open, and `{isOpen, onOpenChange}` makes it controlled, like any other collapsible region in the system.';
  const docs = {
    name: 'Notice',
    description: 'A notice.',
    props: [
      {
        name: 'collapsible',
        type: 'boolean',
        default: 'true',
        description: long,
      },
      {name: 'title', type: 'string', description: 'The main message.'},
    ],
  };
  const propsCommand = 'component Notice --props';

  it('prints the first sentence and names the command that prints them whole', () => {
    const out = formatFull(docs, {propsCommand});

    expect(out).toContain(
      '- `collapsible`: `boolean` = `true` - Whether the details collapse.\n',
    );
    expect(out).toContain('- `title`: `string` - The main message.');
    expect(out).toMatch(
      /Each prop description's first sentence; `.* component Notice --props` prints them whole\./,
    );
  });

  it('prints every description whole in the --props view', () => {
    expect(formatProps(docs, 'Notice')).toContain(
      `- \`collapsible\`: \`boolean\` = \`true\` - ${long}`,
    );
  });

  it('prints descriptions whole when the read names no --props command', () => {
    const out = formatFull(docs);

    expect(out).toContain(long);
    expect(out).not.toContain('first sentence');
  });

  it('prints descriptions whole when the cut saves less than the pointer costs', () => {
    const short = {
      ...docs,
      props: [
        {name: 'title', type: 'string', description: 'The message. Short.'},
      ],
    };
    const out = formatFull(short, {propsCommand});

    expect(out).toContain('- `title`: `string` - The message. Short.');
    expect(out).not.toContain('first sentence');
  });
});

describe('formatBestPractices', () => {
  it("labels each run of Do and Don't items and keeps their order", () => {
    const lines = formatBestPractices([
      {guidance: true, description: 'Use one primary action.'},
      {guidance: true, description: 'Write clear labels.'},
      {guidance: false, description: 'Stack two primary buttons.'},
      {guidance: true, description: 'Show progress.'},
    ]);

    expect(lines).toEqual([
      '## Best Practices\n',
      'Do:',
      '- Use one primary action.',
      '- Write clear labels.',
      '',
      "Don't:",
      '- Stack two primary buttons.',
      '',
      'Do:',
      '- Show progress.',
      '',
    ]);
  });

  it('prints nothing when there are no practices', () => {
    expect(formatBestPractices([])).toEqual([]);
    expect(formatBestPractices(undefined)).toEqual([]);
  });
});
