// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment node

/**
 * @file attachReorderable.server.test.ts
 * @input createReorderable, imported where no DOM exists
 * @output Importing the module and creating an object touch no DOM, so a
 *   server render can import them
 * @position Unit test of reorderable/attachReorderable.ts and
 *   reorderable/createReorderable.ts
 */

import {describe, expect, it} from 'vitest';

describe('createReorderable on a server', () => {
  it('imports and creates an object with no DOM', async () => {
    expect(typeof document).toBe('undefined');
    const {createReorderable} = await import('./createReorderable');
    const reorderable = createReorderable({onReorder: () => {}});
    expect(typeof reorderable.attach).toBe('function');
    expect(typeof reorderable.start).toBe('function');
  });
});
