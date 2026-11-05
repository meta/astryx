// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Components gallery index — browse all showcases.
 */

'use client';

import {Fragment, useMemo} from 'react';
import {FlaskConical} from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Grid} from '@astryxdesign/core/Grid';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Icon} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {Button} from '@astryxdesign/core/Button';
import {Popover} from '@astryxdesign/core/Popover';
import {Card} from '@astryxdesign/core/Card';
import {CodeExampleBlock} from '../../../components/CodeExampleBlock';
import {components as componentRegistry} from '../../../generated/componentRegistry';
import {packages} from '../../../generated/packageRegistry';
import {showcaseRegistry} from '../../../generated/showcaseRegistry';
import {ShowcaseThumbnail} from '../../../components/ShowcaseThumbnail';
import {
  DEPRECATED_LABEL,
  DeprecatedBadge,
} from '../../../components/Deprecation';
import {normalizeComponentCategory} from '../../../lib/componentCategories';
import {layout} from '../../../layout.stylex';

const FIGMA_LIBRARY_URL =
  'https://www.figma.com/community/file/1659998707120781098/astryx-library-community';

/**
 * Category display order for the overview page.
 * Sourced from component .doc.mjs `category` fields.
 */
const CATEGORIES = [
  'Action',
  'Chat',
  'Container',
  'Content',
  'Data Visualization',
  'Feedback & Status',
  'Form Controls',
  'Layout',
  'Navigation',
  'Overlay',
  'Table & List',
  'Utility',
] as const;

/**
 * Which components have a showcase to put in their tile.
 *
 * `showcaseRegistry` is a map of lazy loaders, so reading its keys costs
 * nothing — none of the showcase chunks are pulled in by this.
 */
const SHOWCASE_NAMES = new Set(Object.keys(showcaseRegistry));

const packageDisplayNames = new Map(
  packages.map(pkg => [pkg.name, pkg.displayName]),
);

const styles = stylex.create({
  heroTitle: {
    textAlign: 'center' as const,
  },
  section: {
    marginInline: 'auto',
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '16/10',
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-container)',
  },
});

interface CategoryItem {
  name: string;
  displayName: string;
  description: string;
  href: string;
  category: string;
  /** Whether a showcase block exists to render in this component's tile */
  hasShowcase: boolean;
  packageName: string;
  isReady: boolean;
  /** Whether the component's doc marks it deprecated. */
  isDeprecated: boolean;
}

function ComponentGrid({items}: {items: CategoryItem[]}) {
  return (
    <Grid columns={{minWidth: 300, repeat: 'fill'}} gap={3} rowGap={4}>
      {items.map(item => (
        <VStack key={`${item.packageName}:${item.name}`} gap={1}>
          <ClickableCard
            label={
              item.isDeprecated
                ? `${item.displayName} (${DEPRECATED_LABEL})`
                : item.displayName
            }
            href={item.href}
            padding={0}
            variant="transparent">
            {item.hasShowcase ? (
              <ShowcaseThumbnail name={item.name} />
            ) : (
              <div {...stylex.props(styles.cardImage)} />
            )}
          </ClickableCard>
          <HStack gap={2} vAlign="center">
            <Text type="supporting">{item.displayName}</Text>
            {item.isDeprecated && <DeprecatedBadge />}
          </HStack>
        </VStack>
      ))}
    </Grid>
  );
}

export default function ComponentsGalleryPage() {
  /** All categorized components (excluding hidden, hooks, and utilities) */
  const categorizedItems = useMemo(() => {
    const items: CategoryItem[] = [];

    for (const [packageName, packageComponents] of Object.entries(
      componentRegistry,
    )) {
      for (const comp of packageComponents) {
        // Skip components explicitly hidden from overview
        if (comp.isHiddenFromOverview) {
          continue;
        }
        // Skip hidden components
        if (comp.hidden) {
          continue;
        }
        // Skip hooks (they appear in the Utilities section)
        if (comp.name.startsWith('use')) {
          continue;
        }
        // Skip components without a category
        if (!comp.category) {
          continue;
        }
        // Skip utilities group
        if (comp.group === 'Utilities') {
          continue;
        }

        items.push({
          name: comp.name,
          displayName: comp.displayName,
          description: comp.description,
          href: `/components/${comp.name}`,
          category: normalizeComponentCategory(comp.category),
          hasShowcase: SHOWCASE_NAMES.has(comp.name),
          packageName,
          isReady: comp.isReady,
          isDeprecated: comp.deprecated != null,
        });
      }
    }

    return items;
  }, []);

  /** Group ready items by functional category. */
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, []);
    }
    for (const item of categorizedItems.filter(item => item.isReady)) {
      const list = map.get(item.category);
      if (list) {
        list.push(item);
      }
    }
    return map;
  }, [categorizedItems]);

  /** Group canary items by owning package; readiness appears on the category. */
  const canaryCategories = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    for (const item of categorizedItems.filter(item => !item.isReady)) {
      const list = map.get(item.packageName) ?? [];
      list.push(item);
      map.set(item.packageName, list);
    }
    return [...map.entries()]
      .map(([packageName, items]) => ({
        packageName,
        displayName: packageDisplayNames.get(packageName) ?? packageName,
        items: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [categorizedItems]);

  return (
    <Section
      maxWidth={layout.contentMaxWidth}
      padding={6}
      xstyle={styles.section}>
      <VStack gap={10}>
        <VStack gap={4} hAlign="center">
          <VStack gap={2} style={{alignItems: 'center'}}>
            <Text type="display-1" xstyle={styles.heroTitle}>
              Browse the library
            </Text>
            <Text type="body" color="secondary" xstyle={styles.heroTitle}>
              Every component, with copy-ready examples for every variant,
              state, and pattern.
            </Text>
          </VStack>
          <HStack gap={3} vAlign="center">
            <Popover
              width={360}
              content={
                <VStack gap={3}>
                  <VStack gap={1}>
                    <Text type="body" weight="bold">
                      1. Install the package
                    </Text>
                    <Card padding={0}>
                      <CodeExampleBlock
                        code="npm install @astryxdesign/core"
                        language="bash"
                        hasCopyButton
                      />
                    </Card>
                  </VStack>
                  <VStack gap={1}>
                    <Text type="body" weight="bold">
                      2. Import a component
                    </Text>
                    <Card padding={0}>
                      <CodeExampleBlock
                        code="import {...} from '@astryxdesign/core/ComponentName';"
                        language="typescript"
                        hasCopyButton
                      />
                    </Card>
                  </VStack>
                </VStack>
              }>
              <Button
                variant="primary"
                size="lg"
                label="Install core library"
              />
            </Popover>
            <Button
              variant="secondary"
              size="lg"
              label="View Figma"
              href={FIGMA_LIBRARY_URL}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </VStack>

        {CATEGORIES.map(cat => {
          const items = groupedByCategory.get(cat) ?? [];
          if (items.length === 0) {
            return null;
          }

          return (
            <Fragment key={cat}>
              <Divider />
              <VStack gap={4}>
                <Heading level={2}>{cat}</Heading>
                <ComponentGrid items={items} />
              </VStack>
            </Fragment>
          );
        })}

        {canaryCategories.map(category => (
          <Fragment key={category.packageName}>
            <Divider />
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Heading level={2}>{category.displayName}</Heading>
                <Icon icon={FlaskConical} label="Canary" size="sm" />
              </HStack>
              <ComponentGrid items={category.items} />
            </VStack>
          </Fragment>
        ))}
      </VStack>
    </Section>
  );
}
