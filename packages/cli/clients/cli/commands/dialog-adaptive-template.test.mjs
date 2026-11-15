// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../../../api/component/component.mjs')} */
const {component} = require('../../../api/component/component.mjs');

const CWD = {cwd: '.'};

// Resolves built-in block templates by walking the source tree.
const SCAN_TIMEOUT = 30_000;

describe(
  'Dialog adaptive presentation template',
  () => {
    it('is listed as a Dialog example block', async () => {
      const result = await component('Dialog', {
        ...CWD,
        blocks: true,
      });
      const exampleNames = result.data.examples.map(b => b.name);
      expect(exampleNames).toContain('DialogAdaptivePresentation');
    });
  },
  SCAN_TIMEOUT,
);
