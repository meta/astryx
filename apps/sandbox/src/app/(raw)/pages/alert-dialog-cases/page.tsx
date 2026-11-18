// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=` (one of the ids in caseIds.ts; the first by default)
 * @output A bare page with one AlertDialog case above rows that make the
 *   document scroll
 * @position A raw page, with no sandbox chrome, for checking the cases on a
 *   phone. The page scrolls with the document, as an app's page does.
 */

import {Suspense} from 'react';
import {useSearchParams} from 'react-router-dom';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';
import {AlertDialogCase} from './cases';
import {
  ALERT_DIALOG_CASE_LABELS,
  ALERT_DIALOG_CASES,
  parseAlertDialogCase,
} from './caseIds';

const ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

function AlertDialogCases() {
  const [searchParams] = useSearchParams();
  const id = parseAlertDialogCase(searchParams.get('case'));
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>AlertDialog cases</Heading>
        <Text color="secondary">{ALERT_DIALOG_CASE_LABELS[id]}</Text>
        <HStack gap={3}>
          {ALERT_DIALOG_CASES.map(caseId => (
            <Link key={caseId} href={`?case=${caseId}`}>
              {caseId}
            </Link>
          ))}
        </HStack>
      </VStack>
      <AlertDialogCase key={id} id={id} />
      <VStack gap={2}>
        {ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}

export default function AlertDialogCasesPage() {
  return (
    <Suspense>
      <AlertDialogCases />
    </Suspense>
  );
}
