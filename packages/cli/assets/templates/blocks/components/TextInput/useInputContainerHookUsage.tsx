// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useInputContainer} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseInputContainerHookUsage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const {onClick, onMouseUp} = useInputContainer({containerRef, inputRef});

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <div
          ref={containerRef}
          onClick={onClick}
          onMouseUp={onMouseUp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid',
          }}>
          <Icon icon="search" color="inherit" />
          <input
            ref={inputRef}
            value={value}
            aria-label="Search"
            placeholder="Click the icon or the padding…"
            onChange={event => setValue(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
          {value !== '' && (
            <Button
              label="Clear"
              size="sm"
              variant="secondary"
              onClick={() => setValue('')}
            />
          )}
        </div>
        <Text type="body" color="secondary">
          Icon and padding clicks focus the field; the nested Clear button keeps
          its own click.
        </Text>
      </VStack>
    </Card>
  );
}
