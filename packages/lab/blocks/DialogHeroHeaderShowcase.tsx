// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DialogHeroHeaderShowcase.tsx
 * @input DialogHeroHeader composed with Dialog and Layout
 * @output A dismissible onboarding preview with full-bleed decorative media
 * @position Canary Lab showcase shared by CLI discovery, docsite, and Storybook
 */

import {useId, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {DialogHeroHeader} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const styles = stylex.create({
  artwork: {
    display: 'block',
  },
});

export default function DialogHeroHeaderShowcase() {
  const [isOpen, setIsOpen] = useState(true);
  const gradientId = useId();

  return isOpen ? (
    <Dialog isOpen isInline onOpenChange={setIsOpen}>
      <Layout
        header={
          <DialogHeroHeader
            title="Make room for your next idea"
            media={
              <svg
                viewBox="0 0 480 180"
                width="100%"
                height="180"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
                {...stylex.props(styles.artwork)}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1c2340" />
                    <stop offset="100%" stopColor="#3b2d5e" />
                  </linearGradient>
                </defs>
                <rect width="480" height="180" fill={`url(#${gradientId})`} />
                <circle cx="390" cy="40" r="70" fill="#8ba7ff" opacity="0.35" />
                <circle cx="70" cy="170" r="90" fill="#8ba7ff" opacity="0.25" />
                <circle cx="240" cy="90" r="42" fill="#8ba7ff" opacity="0.55" />
              </svg>
            }
            mediaMode="dark"
            onOpenChange={setIsOpen}
          />
        }
        content={
          <LayoutContent>
            <Text type="body">
              Bring your notes, projects, and collaborators together in one
              workspace. You can make it your own as you go.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Button
              label="Get started"
              variant="primary"
              onClick={() => setIsOpen(false)}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  ) : (
    <Button
      label="Preview welcome dialog"
      variant="secondary"
      onClick={() => setIsOpen(true)}
    />
  );
}
