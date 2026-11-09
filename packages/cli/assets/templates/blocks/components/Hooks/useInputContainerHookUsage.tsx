// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {InputClearButton} from '@astryxdesign/core/Field';
import {useInputContainer} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

const styles = stylex.create({
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: 320,
    minHeight: 40,
    paddingInline: spacingVars['--spacing-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
    cursor: 'text',
    outlineWidth: {
      default: 0,
      ':has(> input:focus-visible)': focusVars['--focus-outline-width'],
    },
    outlineStyle: {
      default: 'none',
      ':has(> input:focus-visible)': focusVars['--focus-outline-style'],
    },
    outlineColor: {
      default: null,
      ':has(> input:focus-visible)': focusVars['--focus-outline-color'],
    },
    outlineOffset: {
      default: 0,
      ':has(> input:focus-visible)': focusVars['--focus-outline-offset'],
    },
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    borderStyle: 'none',
    outlineStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
});

export default function UseInputContainerHookUsage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const {onClick, onMouseUp} = useInputContainer({containerRef, inputRef});

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseUp={onMouseUp}
      {...stylex.props(styles.field)}>
      <Icon icon={MagnifyingGlassIcon} color="secondary" />
      <input
        ref={inputRef}
        type="text"
        aria-label="Search"
        placeholder="Search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        {...stylex.props(styles.input)}
      />
      {query !== '' && (
        <InputClearButton
          label="Clear search"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
