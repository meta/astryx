// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThemeHeading.tsx
 * @input Receives responsive alignment plus optional preview-mode state
 * @output Renders the shared Themes heading, description, docs link, and mode-control slot
 * @position Shared by the resolved theme explorer and its PPR fallback so both keep identical geometry
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Moon, Sun} from 'lucide-react';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {Button} from '@astryxdesign/core/Button';
import {Skeleton} from '@astryxdesign/core/Skeleton';

const styles = stylex.create({
  titleRow: {
    width: '100%',
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
});

interface ThemeHeadingProps {
  align?: 'start' | 'center';
  isMobile?: boolean;
  /** The fallback keeps its link out of sequential focus before replacement. */
  isLoading?: boolean;
  /** Effective preview color mode. Omit while the selected theme is loading. */
  mode?: 'light' | 'dark';
  /** Toggles preview color mode. Omit in the PPR fallback. */
  onToggleMode?: () => void;
}

/**
 * Shared page heading for both the real theme explorer and its PPR fallback.
 * The title, copy, link, spacing, and responsive type stay byte-identical; only
 * the theme-dependent mode control becomes a same-size skeleton while loading.
 */
export function ThemeHeading({
  align = 'start',
  isMobile = false,
  isLoading = false,
  mode,
  onToggleMode,
}: ThemeHeadingProps) {
  const isCentered = align === 'center';
  const modeToggleLabel =
    mode === 'dark'
      ? 'Switch preview to light mode'
      : 'Switch preview to dark mode';
  const modeToggleIcon =
    mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />;
  const modeControl: ReactNode = onToggleMode ? (
    <Button
      variant="ghost"
      size="lg"
      isIconOnly
      label={modeToggleLabel}
      tooltip={modeToggleLabel}
      icon={modeToggleIcon}
      onClick={onToggleMode}
    />
  ) : (
    <Skeleton width={36} height={36} radius="rounded" />
  );

  return (
    <VStack gap={2} hAlign={isCentered ? 'center' : undefined}>
      <HStack gap={2} vAlign="center" xstyle={styles.titleRow}>
        <Heading
          level={1}
          type={isMobile ? 'display-2' : 'display-3'}
          justify={align}
          xstyle={styles.titleText}>
          Themes
        </Heading>
        {modeControl}
      </HStack>
      <VStack gap={1} hAlign={isCentered ? 'center' : undefined}>
        <Text type="body" color="secondary" justify={align}>
          Astryx comes with a default theme built in. To make it your own, copy
          any theme you see here into a theme file you own.
        </Text>
        <Link
          type="body"
          color="secondary"
          href="/docs/theme"
          hasUnderline
          tabIndex={isLoading ? -1 : undefined}>
          Learn how theming works
        </Link>
      </VStack>
    </VStack>
  );
}
