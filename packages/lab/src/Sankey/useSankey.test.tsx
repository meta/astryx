// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSankey.test.tsx
 * @input A component calling useSankey with no surrounding SankeyChart
 * @output Pins the outside-provider guard and its message (#4295)
 * @position Colocated test for SankeyContext.ts
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {useSankey} from './SankeyContext';

describe('useSankey', () => {
  it('throws when used outside <SankeyChart>', () => {
    function Probe() {
      useSankey();
      return null;
    }

    expect(() => render(<Probe />)).toThrow(
      'Sankey components must be used inside <SankeyChart>',
    );
  });
});
