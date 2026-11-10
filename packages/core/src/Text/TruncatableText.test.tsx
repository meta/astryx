// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TruncatableText.test.tsx
 * @input Uses @testing-library/react, Text, Heading
 * @output Tests that Text and Heading keep their element and children mounted
 *   when a caller changes `maxLines` or `hasTruncateTooltip` in a client render
 * @position Testing; validates that a client render of Text.tsx and Heading.tsx
 *   always takes the TruncatableText client part
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {Text, type TextProps} from './Text';
import {Heading, type HeadingProps} from '../Heading/Heading';

type TruncationProps = Pick<TextProps, 'maxLines' | 'hasTruncateTooltip'>;

/** Show more / less, tooltip on / off, and back to no `maxLines`. */
const TOGGLES: TruncationProps[] = [
  {maxLines: 3},
  {maxLines: 0},
  {},
  {maxLines: 1},
  {maxLines: 2, hasTruncateTooltip: false},
  {maxLines: 2, hasTruncateTooltip: 'below'},
  {hasTruncateTooltip: false},
  {},
];

describe('truncation changes keep the element mounted', () => {
  it('Text keeps its element and children', () => {
    const renderText = (props: TruncationProps) => (
      <Text {...props}>
        A long <b>paragraph</b>
      </Text>
    );
    const {container, rerender} = render(renderText({}));
    const element = container.firstElementChild;
    const child = container.querySelector('b');
    for (const props of TOGGLES) {
      rerender(renderText(props));
      expect(container.firstElementChild, JSON.stringify(props)).toBe(element);
      expect(container.querySelector('b'), JSON.stringify(props)).toBe(child);
    }
  });

  it('Heading keeps its element and children', () => {
    const renderHeading = (props: Partial<HeadingProps>) => (
      <Heading level={2} {...props}>
        A long <b>title</b>
      </Heading>
    );
    const {container, rerender} = render(renderHeading({}));
    const element = container.firstElementChild;
    const child = container.querySelector('b');
    for (const props of TOGGLES) {
      rerender(renderHeading(props));
      expect(container.firstElementChild, JSON.stringify(props)).toBe(element);
      expect(container.querySelector('b'), JSON.stringify(props)).toBe(child);
    }
  });
});
