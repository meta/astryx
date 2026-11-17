// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionOverlayXstyle.test.tsx
 * @input interactionOverlayStyles and an Astryx component's `xstyle` prop
 * @output Every overlay variant is a StyleX style that a component's `xstyle`
 *   accepts. The type check is the proof: `pnpm typecheck` compiles this file.
 * @position Type test of packages/core/src/utils/interactionOverlay.stylex.ts
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {Card} from '../Card/Card';
import {interactionOverlayStyles} from './interactionOverlay.stylex';

describe('interactionOverlayStyles', () => {
  it('fits the xstyle prop of an Astryx component', () => {
    render(
      <>
        <Card
          data-testid="variant"
          xstyle={interactionOverlayStyles.backgroundColor}
        />
        <Card
          data-testid="variant"
          xstyle={interactionOverlayStyles.backgroundImage}
        />
        <Card
          data-testid="variant"
          xstyle={interactionOverlayStyles.backgroundImageOnNeutral}
        />
        <Card
          data-testid="variant"
          xstyle={interactionOverlayStyles.pressedBackgroundColor}
        />
        <Card
          data-testid="variant"
          xstyle={interactionOverlayStyles.pressedAlpha}
        />
      </>,
    );
    expect(screen.getAllByTestId('variant')).toHaveLength(
      Object.keys(interactionOverlayStyles).length,
    );
  });
});
