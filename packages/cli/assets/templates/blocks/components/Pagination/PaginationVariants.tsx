// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Pagination} from '@astryxdesign/core/Pagination';
import {Stack} from '@astryxdesign/core/Layout';

export default function PaginationVariants() {
  const [pagesPage, setPagesPage] = useState(3);
  const [countPage, setCountPage] = useState(2);
  const [compactPage, setCompactPage] = useState(5);
  const [dotsPage, setDotsPage] = useState(3);

  return (
    <Stack direction="vertical" gap={5} hAlign="center" style={{width: '100%'}}>
      <Pagination
        label="Dots pagination"
        page={dotsPage}
        onChange={setDotsPage}
        totalPages={8}
        variant="dots"
      />
      <Pagination
        label="Compact pagination"
        page={compactPage}
        onChange={setCompactPage}
        totalPages={10}
        variant="compact"
      />
      <Pagination
        label="Count pagination"
        page={countPage}
        onChange={setCountPage}
        totalItems={200}
        pageSize={20}
        variant="count"
      />
      <Pagination
        label="Pages pagination"
        page={pagesPage}
        onChange={setPagesPage}
        totalItems={200}
        pageSize={10}
        variant="pages"
      />
    </Stack>
  );
}
