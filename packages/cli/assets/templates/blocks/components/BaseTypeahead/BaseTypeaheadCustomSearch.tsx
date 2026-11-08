// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BaseTypeahead, createStaticSource} from '@astryxdesign/core/Typeahead';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

const frameworks: SearchableItem[] = [
  {id: 'react', label: 'React'},
  {id: 'vue', label: 'Vue'},
  {id: 'angular', label: 'Angular'},
  {id: 'svelte', label: 'Svelte'},
  {id: 'solid', label: 'SolidJS'},
  {id: 'remix', label: 'Remix'},
  {id: 'next', label: 'Next.js'},
  {id: 'nuxt', label: 'Nuxt'},
];

const source = createStaticSource(frameworks);

const styles = stylex.create({
  root: {
    width: '100%',
    maxWidth: 360,
  },
  field: {
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: borderVars['--border-width'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-2'],
    outlineColor: {
      default: 'transparent',
      ':has(input:focus-visible)': focusVars['--focus-outline-color'],
    },
    outlineOffset: focusVars['--focus-outline-offset'],
    outlineStyle: 'solid',
    outlineWidth: {
      default: '0',
      ':has(input:focus-visible)': focusVars['--focus-outline-width'],
    },
  },
});

export default function BaseTypeaheadCustomSearch() {
  const [value, setValue] = useState<SearchableItem | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <VStack gap={3} xstyle={styles.root}>
      <HStack ref={wrapperRef} gap={2} vAlign="center" xstyle={styles.field}>
        <Icon icon={MagnifyingGlassIcon} size="sm" color="secondary" />
        <BaseTypeahead
          aria-label="Search frameworks"
          searchSource={source}
          value={value}
          onChange={setValue}
          anchorRef={wrapperRef}
          placeholder="Search frameworks…"
          hasEntriesOnFocus
          debounceMs={0}
        />
      </HStack>
      <Text type="supporting" color="secondary">
        {value != null ? `Selected: ${value.label}` : 'No selection'}
      </Text>
    </VStack>
  );
}
