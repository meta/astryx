// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {formatHookCompact, formatHookFull} from './hook-format.mjs';

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
