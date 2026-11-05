// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {forwardRef, useEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';

type AutoGrowTextAreaProps = {
  value: string;
  onChange: (value: string) => void;
};

// Forwards the caller's ref and also keeps its own ref to measure
// scrollHeight; useMergedRefs attaches both to the same textarea.
const AutoGrowTextArea = forwardRef<HTMLTextAreaElement, AutoGrowTextAreaProps>(
  function AutoGrowTextArea({value, onChange}, forwardedRef) {
    const keptRef = useRef<HTMLTextAreaElement>(null);
    const mergedRef = useMergedRefs(forwardedRef, keptRef);

    // Syncs the textarea's inline height with the committed value.
    // scrollHeight is right only after React writes the new text.
    useEffect(() => {
      const el = keptRef.current;
      if (!el) {
        return;
      }
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    return (
      <textarea
        ref={mergedRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={1}
        aria-label="Auto-growing message"
        placeholder="Type — the box grows itself"
        style={{
          width: '100%',
          padding: 8,
          borderRadius: 8,
          border: '1px solid',
          resize: 'none',
          overflow: 'hidden',
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: '20px',
          color: 'inherit',
          background: 'transparent',
        }}
      />
    );
  },
);

export default function UseMergedRefsHookUsage() {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(
    'This box keeps its own ref to measure and grow. The button focuses it through the forwarded ref.',
  );

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <AutoGrowTextArea ref={areaRef} value={value} onChange={setValue} />
        <Button
          label="Focus via forwarded ref"
          size="sm"
          onClick={() => areaRef.current?.focus()}
        />
      </VStack>
    </Card>
  );
}
