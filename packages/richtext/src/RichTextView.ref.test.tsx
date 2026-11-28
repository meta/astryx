// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {markdownToEditorStateJSON} from './markdownSerializers';
import {RichTextView} from './RichTextView';

describe('RichTextView ref', () => {
  it('reaches the view root element', () => {
    const ref = createRef<HTMLDivElement>();
    const {container} = render(
      <RichTextView ref={ref} value={markdownToEditorStateJSON('Hello')} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toBe(container.firstElementChild);
  });

  it('reaches the root element that shows the error fallback', () => {
    const ref = createRef<HTMLDivElement>();
    const {container} = render(
      <RichTextView
        ref={ref}
        value="not json"
        errorFallback={<span>Unavailable</span>}
      />,
    );
    expect(ref.current).toBe(container.firstElementChild);
    expect(ref.current?.textContent).toBe('Unavailable');
  });
});
