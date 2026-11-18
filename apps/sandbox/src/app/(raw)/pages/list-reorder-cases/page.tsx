// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=` (one of the ids in caseIds.ts; the first by default)
 * @output A bare page with one List reorder case above rows that make the
 *   document scroll
 * @position A raw page, with no sandbox chrome, for checking the cases on a
 *   phone. The page scrolls with the document, as an app's page does.
 */

import {Suspense} from 'react';
import {useSearchParams} from 'react-router-dom';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';
import {ListReorderCase} from './cases';
import {
  LIST_REORDER_CASE_LABELS,
  LIST_REORDER_CASES,
  parseListReorderCase,
} from './caseIds';

const ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

function ListReorderCases() {
  const [searchParams] = useSearchParams();
  const id = parseListReorderCase(searchParams.get('case'));
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>List reorder cases</Heading>
        <Text color="secondary">{LIST_REORDER_CASE_LABELS[id]}</Text>
        <HStack gap={3}>
          {LIST_REORDER_CASES.map(caseId => (
            <Link key={caseId} href={`?case=${caseId}`}>
              {caseId}
            </Link>
          ))}
        </HStack>
      </VStack>
      <ListReorderCase key={id} id={id} />
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

export default function ListReorderCasesPage() {
  return (
    <Suspense>
      <ListReorderCases />
    </Suspense>
  );
}
