// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useClickableContainer} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';

const PROJECT_HREF = '#project-design-tokens';

export default function UseClickableContainerHookUsage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const projectLinkRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const [openCount, setOpenCount] = useState(0);
  const [isStarred, setIsStarred] = useState(false);
  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    interactiveRef: projectLinkRef,
    href: PROJECT_HREF,
  });

  return (
    <VStack gap={3}>
      <Card
        ref={containerRef}
        onClick={onClick}
        onMouseUp={onMouseUp}
        width={360}
        padding={4}>
        <VStack gap={2}>
          <HStack gap={2} justify="between" vAlign="center">
            <Heading level={4}>
              <Link
                ref={projectLinkRef}
                href={PROJECT_HREF}
                type="inherit"
                onClick={() => setOpenCount(count => count + 1)}>
                Design tokens
              </Link>
            </Heading>
            <Button
              label={isStarred ? 'Starred' : 'Star'}
              variant="secondary"
              onClick={() => setIsStarred(starred => !starred)}
            />
          </HStack>
          <Text type="body" color="secondary">
            Color, spacing and type tokens shared by every product surface.
          </Text>
          <Text type="supporting" color="secondary">
            Owned by{' '}
            <Link href="#team-design-systems" type="inherit">
              Design Systems
            </Link>
          </Text>
        </VStack>
      </Card>
      <Text type="supporting">
        Project opened {openCount} {openCount === 1 ? 'time' : 'times'}
      </Text>
    </VStack>
  );
}
