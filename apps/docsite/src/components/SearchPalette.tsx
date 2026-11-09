// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Renders CLI-ranked site-search results as readable destination rows.
 * @input The palette open state and results from createCliSearchSource().
 * @output Search navigation with concise titles, type/location context, and icons.
 * @position Mounted by the shared docsite top navigation.
 */

import {useMemo, useCallback} from 'react';
import {useRouter} from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {trackSearch} from '../lib/analytics';
import {createCliSearchSource, searchTarget} from '../lib/cliSearchSource';
import {searchResultPresentation} from '../lib/cliSearchPresentation';

const styles = stylex.create({
  result: {
    minWidth: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
});

interface SearchPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The site's search: `astryx search`, run by the site's search API
 * (app/api/search/route.ts), so it answers what the CLI answers.
 */
export function SearchPalette({isOpen, onOpenChange}: SearchPaletteProps) {
  const router = useRouter();

  const searchSource = useMemo(() => createCliSearchSource(), []);

  const handleValueChange = useCallback(
    (id: string) => {
      const result = searchSource.item(id)?.auxiliaryData;
      if (!result) {
        return;
      }
      trackSearch({target: 'select', ...searchTarget(result.href)});
      router.push(result.href);
      onOpenChange(false);
    },
    [searchSource, router, onOpenChange],
  );

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      searchSource={searchSource}
      renderItem={item => {
        const result = item.auxiliaryData;
        const {
          title,
          context,
          icon: ResultIcon,
        } = searchResultPresentation(result);
        return (
          <HStack gap={3} vAlign="center" width="100%" xstyle={styles.result}>
            <Icon icon={ResultIcon} size="sm" color="secondary" />
            <VStack gap={0} xstyle={styles.copy}>
              <Text type="label" weight="semibold" maxLines={1}>
                {title}
              </Text>
              <Text type="supporting" color="secondary" maxLines={1}>
                {context}
              </Text>
            </VStack>
          </HStack>
        );
      }}
      label="Search docs, components, and templates"
      value=""
      onValueChange={handleValueChange}
    />
  );
}
