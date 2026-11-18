// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  formatHookCompact,
  formatHookFull,
  formatHookParams,
} from './hook-format.mjs';

describe('hook accessibility guidance', () => {
  const docs = {
    name: 'useButton',
    usage: {
      description: 'Provides button behavior.',
      accessibility: [
        {
          name: 'Keyboard activation',
          description: 'Preserve Enter and Space activation.',
        },
      ],
    },
    params: [],
    returns: [],
  };

  it('renders accessibility guidance in full output', () => {
    const out = formatHookFull(docs);

    expect(out).toContain('## Accessibility');
    expect(out).toContain('- **Keyboard activation:** Preserve Enter and Space activation.');
  });

  it('renders accessibility guidance in compact output', () => {
    const out = formatHookCompact(docs);

    expect(out).toContain('## Accessibility');
    expect(out).toContain('Preserve Enter and Space activation.');
  });
});

describe('hook types', () => {
  const docs = {
    name: 'useThing',
    usage: {description: 'Shows a thing.'},
    params: [],
    returns: [{name: 'show', type: '(options: ThingOptions) => void'}],
    types: [
      {
        name: 'ThingOptions',
        import: "import type { ThingOptions } from '@acme/ui/Thing';",
        members: [{name: 'body', type: 'string', optional: false}],
      },
    ],
  };
  const section = [
    '## Types\n',
    '### ThingOptions\n',
    "`import type { ThingOptions } from '@acme/ui/Thing';`\n- `body`: `string` **(required)**\n",
  ].join('\n');

  it('prints the Types section after the returns in every hook view', () => {
    for (const out of [
      formatHookCompact(docs, '@acme/ui/Thing'),
      formatHookFull(docs),
      formatHookParams(docs),
    ]) {
      expect(out).toContain(section);
    }
    const compact = formatHookCompact(docs, '@acme/ui/Thing');
    expect(compact.indexOf('## Types')).toBeGreaterThan(
      compact.indexOf('## Returns'),
    );
  });

  it('prints none when the hook has no types', () => {
    const plain = {...docs, types: undefined};
    expect(formatHookCompact(plain, '@acme/ui/Thing')).not.toContain(
      '## Types',
    );
    expect(formatHookParams(plain)).toBe(
      'No parameters documentation found for useThing.\n',
    );
  });
});
