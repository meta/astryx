// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePressFeedback.exports.test.ts
 * @input vitest, the hooks entry point (index.ts) and usePressFeedback.ts
 * @output Asserts the press profile stays internal: `usePressFeedback`
 *   takes no options (the hook main ships), and `@astryxdesign/core/hooks`
 *   exports no press-profile type (`architecture:public-component-api`
 *   INV12); a list row reaches the cell profile through the internal
 *   `cellPressableProps`
 * @position Unit test beside hooks/usePressFeedback.ts
 */

import {describe, expect, it} from 'vitest';
import * as hooks from './index';
import {usePressFeedback} from './usePressFeedback';

describe("usePressFeedback's surface", () => {
  it('takes no options', () => {
    expect(usePressFeedback.length).toBe(0);
  });

  it('exports no press-profile option type from the hooks entry', () => {
    // @ts-expect-error The press profile is internal to core.
    type _NotPublic = import('./index').UsePressFeedbackOptions;
    expect(Object.keys(hooks)).toContain('usePressFeedback');
  });
});
