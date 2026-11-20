// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Pagination} from '@astryxdesign/core/Pagination';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Layout';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Icon} from '@astryxdesign/core/Icon';
import {StarIcon} from '@astryxdesign/template-icons/24/solid';

const REVIEWS = [
  {
    name: 'Jeannie Grant',
    date: 'June 01, 2025',
    stars: 5,
    quote:
      'A thorough report was done on our financial situation. Better deals were found and processed on our behalf, which took a lot of stress away.',
  },
  {
    name: 'Derval Russell',
    date: 'November 09, 2025',
    stars: 5,
    quote:
      'I have been a client for 8 years now and have always found the advice provided excellent. They take the time to explain things clearly.',
  },
  {
    name: 'Claire Dawson',
    date: 'October 15, 2025',
    stars: 5,
    quote:
      'Constantly professional and concise. Our mortgage process was smooth from start to finish thanks to their dedicated team.',
  },
  {
    name: 'Marcus Webb',
    date: 'September 22, 2025',
    stars: 4,
    quote:
      'Great service overall. The team was responsive and knowledgeable. Would definitely recommend to anyone looking for solid financial advice.',
  },
];

function Stars({count}: {count: number}) {
  return (
    <Stack direction="horizontal" gap={0}>
      {Array.from({length: count}, (_, i) => (
        <Icon key={i} icon={StarIcon} size="sm" color="warning" />
      ))}
    </Stack>
  );
}

export default function PaginationDotsCarousel() {
  const [page, setPage] = useState(1);
  const review = REVIEWS[page - 1];

  return (
    <Stack direction="vertical" gap={3} style={{maxWidth: 480, width: '100%'}}>
      <Card padding={5}>
        <Stack direction="vertical" gap={3}>
          <Stars count={review.stars} />
          <Text type="body">{review.quote}</Text>
          <Stack direction="horizontal" gap={3} vAlign="center" hAlign="start">
            <Avatar name={review.name} size="md" />
            <Stack direction="vertical" gap={0}>
              <Text type="supporting" weight="bold">
                {review.name}
              </Text>
              <Text type="supporting" color="secondary">
                {review.date}
              </Text>
            </Stack>
          </Stack>
        </Stack>
      </Card>
      <Pagination
        page={page}
        onChange={setPage}
        totalPages={REVIEWS.length}
        variant="dots"
        style={{justifyContent: 'center', paddingTop: 4}}
      />
    </Stack>
  );
}
