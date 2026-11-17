// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=` (one of the ids in caseIds.ts; the first by default)
 * @output A bare page with one swipe actions case, a mail List long enough
 *   that the document scrolls, and the sandbox's theme and mode controls
 * @position A raw page, with no sandbox chrome, for checking swipe actions on
 *   a phone. The page scrolls with the document, as an app's page does.
 */

import {Suspense} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {useSearchParams} from 'react-router-dom';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';
import {SANDBOX_THEMES, useThemeControls} from '../../../providers';
import {SwipeActionsCase} from './cases';
import {
  parseSwipeActionsCase,
  SWIPE_ACTIONS_CASE_LABELS,
  SWIPE_ACTIONS_CASES,
} from './caseIds';

/** The sandbox theme and mode, as the sandbox's own pages offer them. */
function ThemeControls() {
  const {themeName, setThemeName, mode, setMode} = useThemeControls();
  return (
    <HStack gap={2}>
      <DropdownMenu
        button={{
          label: `Theme: ${
            SANDBOX_THEMES.find(theme => theme.id === themeName)?.label ??
            themeName
          }`,
          variant: 'secondary',
          size: 'sm',
        }}
        hasChevron
        items={SANDBOX_THEMES.map(({id, label}) => ({
          label,
          onClick: () => setThemeName(id),
        }))}
      />
      <Button
        label={mode === 'light' ? 'Dark mode' : 'Light mode'}
        variant="secondary"
        size="sm"
        onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
      />
    </HStack>
  );
}

function SwipeActionsCases() {
  const [searchParams] = useSearchParams();
  const id = parseSwipeActionsCase(searchParams.get('case'));
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Swipe actions</Heading>
        <ThemeControls />
        <Text color="secondary">{SWIPE_ACTIONS_CASE_LABELS[id]}</Text>
        <HStack gap={3}>
          {SWIPE_ACTIONS_CASES.map(caseId => (
            <Link key={caseId} href={`?case=${caseId}`}>
              {caseId}
            </Link>
          ))}
        </HStack>
      </VStack>
      <SwipeActionsCase key={id} id={id} />
    </VStack>
  );
}

export default function SwipeActionsCasesPage() {
  return (
    <Suspense>
      <SwipeActionsCases />
    </Suspense>
  );
}
