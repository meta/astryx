// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Templates gallery index.
 * @input Uses generated template metadata, URL preview state, live thumbnails, and a lazy preview dialog.
 * @output Renders a wide, three-column filterable gallery with scaled 1440×900 previews and loads the query-synced preview dialog on first open.
 * @position Public `/templates` docsite route.
 */

'use client';

import {Suspense, lazy, useCallback, useEffect, useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {useSearchParams, useRouter, usePathname} from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {useAppShellMobile} from '@astryxdesign/core/AppShell';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Button} from '@astryxdesign/core/Button';
import {Overlay} from '@astryxdesign/core/Overlay';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {templateMetadata as templates} from '../../../generated/templateMetadataRegistry';
import {TemplateThumbnail} from '../../../components/TemplateThumbnail';
import {buildTemplatePlaygroundHref} from '../../../components/playgroundLink';
import {buildTemplatePreviewHref} from '../../../components/templatePreviewUrl';
import {sortTemplatesByTitle} from '../../../components/templateGalleryOrder';
import type {TemplatePreviewItem} from '../../../components/TemplatePreviewDialog';
import {trackOpenPlayground, trackView} from '../../../lib/analytics';

const LazyTemplatePreviewDialog = lazy(() =>
  import('../../../components/TemplatePreviewDialog').then(module => ({
    default: module.TemplatePreviewDialog,
  })),
);

const CARD_STYLE: CSSProperties & {'--color-overlay': string} = {
  '--color-overlay':
    'color-mix(in srgb, var(--color-on-light) 78%, transparent)',
};

const OVERLAY_CLICK_LAYER_STYLE: CSSProperties = {
  height: '100%',
  width: '100%',
  cursor: 'pointer',
};

const styles = stylex.create({
  categoryFilter: {
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  galleryGrid: {
    width: '100%',
  },
});

/** Display order for the top-level category groups. Groups not listed here
 *  are appended alphabetically; untagged templates fall under 'Other'. */
const GROUP_ORDER = [
  'Dashboard',
  'Table',
  'Form',
  'Settings',
  'Login',
  'Tools',
  'Content',
  'AI Chat',
  'Gallery',
  'Shell',
];

const OTHER_GROUP = 'Other';

/** Derive the group heading from a category string. The group is the text
 *  before the first ' - ' separator (e.g. 'Dashboard - Analytics' → 'Dashboard').
 *  Standalone categories without a separator (e.g. 'Settings') are their own
 *  group. Untagged templates fall under 'Other'. */
function groupOf(category: string): string {
  if (!category) {
    return OTHER_GROUP;
  }
  const idx = category.indexOf(' - ');
  return idx === -1 ? category : category.slice(0, idx);
}

/** Sort rank for a category group: GROUP_ORDER first, then 'Other' last. */
function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group);
  if (i !== -1) {
    return i;
  }
  return group === OTHER_GROUP ? Number.MAX_SAFE_INTEGER : GROUP_ORDER.length;
}

interface TemplateItem {
  name: string;
  description: string;
  slug: string;
  href: string;
  category: string;
}

export default function TemplatesPage() {
  return <TemplatesGallery />;
}

interface TemplatePreviewURLSyncProps {
  indexBySlug: Map<string, number>;
  onSlugChange: (slug: string | null) => void;
}

/**
 * Keeps `?preview=` authoritative for deep links and soft navigation without
 * making the visible gallery part of the query-dependent PPR hole.
 */
function TemplatePreviewURLSync({
  indexBySlug,
  onSlugChange,
}: TemplatePreviewURLSyncProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const previewSlug = searchParams.get('preview');
  const openSlug =
    previewSlug != null && indexBySlug.has(previewSlug) ? previewSlug : null;

  useEffect(() => {
    onSlugChange(openSlug);
    if (previewSlug != null && openSlug == null) {
      router.replace(
        buildTemplatePreviewHref(pathname, searchParams.toString(), null),
        {scroll: false},
      );
    }
  }, [onSlugChange, openSlug, pathname, previewSlug, router, searchParams]);

  return null;
}

function TemplatesGallery() {
  const {isMobile} = useAppShellMobile();

  // Flat, display-ordered list of available templates. Ordered by category
  // group (per GROUP_ORDER) then name, so the single grid stays stable.
  const items = useMemo<TemplateItem[]>(() => {
    const visible = templates.filter(t => t.isReady && !t.isHiddenFromOverview);

    return visible
      .map(t => ({
        name: t.name,
        description: t.description,
        slug: t.slug,
        href: `/templates/${t.slug}`,
        category: t.category,
      }))
      .sort((a, b) => {
        const ga = groupOf(a.category);
        const gb = groupOf(b.category);
        return (
          groupRank(ga) - groupRank(gb) ||
          ga.localeCompare(gb) ||
          a.name.localeCompare(b.name)
        );
      });
  }, []);

  const [activeCategory, setActiveCategory] = useState('All');

  // Filter options: 'All' plus each category group present, in display order.
  const categories = useMemo(() => {
    const present = [...new Set(items.map(i => groupOf(i.category)))].sort(
      (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b),
    );
    return ['All', ...present];
  }, [items]);

  const filteredItems = useMemo(() => {
    const visibleItems =
      activeCategory === 'All'
        ? items
        : items.filter(i => groupOf(i.category) === activeCategory);
    return sortTemplatesByTitle(visibleItems);
  }, [items, activeCategory]);

  // Flattened display-order list backing the preview dialog's prev/next
  // navigation, plus a slug -> index lookup for opening at a given card.
  const flatItems = useMemo<TemplatePreviewItem[]>(
    () =>
      filteredItems.map(i => ({
        slug: i.slug,
        name: i.name,
        description: i.description,
        category: groupOf(i.category),
      })),
    [filteredItems],
  );
  const indexBySlug = useMemo(() => {
    const m = new Map<string, number>();
    flatItems.forEach((it, i) => m.set(it.slug, i));
    return m;
  }, [flatItems]);

  const router = useRouter();
  const pathname = usePathname();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [hasLoadedPreview, setHasLoadedPreview] = useState(false);
  const handlePreviewSlugChange = useCallback((slug: string | null) => {
    if (slug !== null) {
      setHasLoadedPreview(true);
    }
    setOpenSlug(slug);
  }, []);
  const openIndex =
    openSlug != null ? (indexBySlug.get(openSlug) ?? null) : null;

  const setOpenIndex = useCallback(
    (index: number | null) => {
      const nextSlug = index !== null ? (flatItems[index]?.slug ?? null) : null;
      if (nextSlug !== null) {
        setHasLoadedPreview(true);
      }
      setOpenSlug(nextSlug);
      router.replace(
        buildTemplatePreviewHref(pathname, window.location.search, nextSlug),
        {scroll: false},
      );
    },
    [flatItems, router, pathname],
  );

  const openPreview = useCallback(
    (slug: string) => {
      const i = indexBySlug.get(slug);
      if (i !== undefined) {
        const item = flatItems[i];
        trackView({
          page: 'templates',
          item: item.slug,
          category: item.category,
        });
        setOpenIndex(i);
      }
    },
    [indexBySlug, setOpenIndex, flatItems],
  );

  return (
    <Section maxWidth={1600} padding={6} style={{marginInline: 'auto'}}>
      <VStack gap={10}>
        {/* Header */}
        <VStack gap={6} align="stretch">
          <VStack gap={2}>
            <Heading level={1} type="display-1" justify="center">
              Templates
            </Heading>
            <Text type="body" color="secondary" justify="center">
              Ready-to-use page templates to kickstart your project.
            </Text>
          </VStack>
          <ToggleButtonGroup
            label="Filter templates by category"
            value={activeCategory}
            onChange={value => setActiveCategory(value ?? 'All')}
            xstyle={styles.categoryFilter}>
            {categories.map(category => (
              <ToggleButton key={category} label={category} value={category} />
            ))}
          </ToggleButtonGroup>
        </VStack>

        {/* Body */}
        <Grid
          columns={{minWidth: isMobile ? 280 : 360, max: 3}}
          gap={6}
          width="100%">
          {filteredItems.map(item => {
            const templateContent = (
              <TemplateThumbnail
                slug={item.slug}
                renderWidth={1440}
                aspectRatio="16/10"
              />
            );

            return (
              <ClickableCard
                key={item.slug}
                padding={0}
                width="100%"
                maxWidth="100%"
                label={`Preview ${item.name}`}
                onClick={() => openPreview(item.slug)}
                style={CARD_STYLE}>
                {isMobile ? (
                  templateContent
                ) : (
                  <Overlay
                    showOn="hover"
                    scrim="dark"
                    content={
                      <VStack
                        role="presentation"
                        onClick={() => openPreview(item.slug)}
                        justify="end"
                        align="start"
                        height="100%"
                        width="100%"
                        gap={4}
                        style={{...OVERLAY_CLICK_LAYER_STYLE, padding: 8}}>
                        <VStack gap={0.5}>
                          <Heading level={3}>{item.name}</Heading>
                          <Text maxLines={2}>{item.description}</Text>
                        </VStack>
                        <HStack gap={2}>
                          <Button
                            label="Preview"
                            variant="secondary"
                            onClick={() => openPreview(item.slug)}
                          />
                          <Button
                            label="Open in Playground"
                            variant="secondary"
                            href={buildTemplatePlaygroundHref(item.slug)}
                            onClick={e => {
                              e.stopPropagation();
                              trackOpenPlayground({
                                page: 'templates',
                                item: item.slug,
                                category: groupOf(item.category),
                              });
                            }}
                          />
                        </HStack>
                      </VStack>
                    }>
                    {templateContent}
                  </Overlay>
                )}
              </ClickableCard>
            );
          })}
        </Grid>
      </VStack>

      <Suspense fallback={null}>
        <TemplatePreviewURLSync
          indexBySlug={indexBySlug}
          onSlugChange={handlePreviewSlugChange}
        />
      </Suspense>

      {hasLoadedPreview ? (
        <Suspense fallback={null}>
          <LazyTemplatePreviewDialog
            items={flatItems}
            index={openIndex ?? 0}
            isOpen={openIndex !== null}
            onOpenChange={open => {
              if (!open) {
                setOpenIndex(null);
              }
            }}
            onIndexChange={setOpenIndex}
            variant={isMobile ? 'fullscreen' : undefined}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
