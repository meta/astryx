// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import Link from '../router';
import * as stylex from '@stylexjs/stylex';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Stack';
import {shadowVars} from '@astryxdesign/core/theme/tokens.stylex';
import type {SandboxPage} from './sandboxPages';

const styles = stylex.create({
  link: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
  },
  cardStyles: {
    width: '100%',
    cursor: 'pointer',
    boxShadow: {
      default: 'none',
      ':hover': shadowVars['--shadow-med'],
    },
  },
});

export function ProjectCard({page}: {page: SandboxPage}) {
  return (
    <Link href={page.href} {...stylex.props(styles.link)}>
      <Card xstyle={styles.cardStyles}>
        <VStack gap={1}>
          <Heading level={3} maxLines={1}>
            {page.name}
          </Heading>
          <Text type="body" size="sm" color="secondary" maxLines={2}>
            {page.description}
          </Text>
        </VStack>
      </Card>
    </Link>
  );
}
