// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {useInputContainer} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {MagnifyingGlassIcon, XMarkIcon} from '@heroicons/react/24/outline';

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
      {...stylex.props(styles.field, focusOutlineStyles.focusWithin)}>
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
        <Button
          label="Clear"
          variant="ghost"
          size="sm"
          icon={<Icon icon={XMarkIcon} />}
          isIconOnly
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
