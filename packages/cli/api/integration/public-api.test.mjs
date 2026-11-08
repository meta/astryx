// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import * as api from '../index.mjs';

describe('integration authoring public API', () => {
  it('exports the generic dispatcher, every per-kind writer, and pack-check', () => {
    for (const name of [
      'integrationAdd',
      'integrationAddComponent',
      'integrationAddDoc',
      'integrationAddTemplate',
      'integrationAddCodemod',
      'integrationAddAgentDoc',
      'integrationAddTheme',
      'integrationPackCheck',
    ]) {
      expect(api[name], name).toBeTypeOf('function');
    }
  });
});
