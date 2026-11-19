// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared layout shell for every page in the docs section.
 * Owns the section padding, content container width, title and description
 * treatment, and vertical spacing. Pages supply only their unique body via
 * `children`.
 *
 * When `outline` items are provided, renders an on-this-page table of contents:
 * a sticky `Outline` aside on desktop and a `Selector` jump menu on mobile.
 * Outline anchors resolve to section ids that pages assign to their headings.
 */

'use client';

import {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Divider} from '@astryxdesign/core/Divider';
import {Selector} from '@astryxdesign/core/Selector';
import {Outline, type OutlineItem} from '@astryxdesign/core/Outline';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {layout} from '../../layout.stylex';

// Both the aside and the mobile jump-menu are styled for their side of this
// breakpoint so the initial (server) render is jank-free; useMediaQuery then
// mounts only the side the viewport needs, so the other's scroll-spy/observers
// don't run.
const TOC_BREAKPOINT = '(max-width: 1024px)';
const TOC_MEDIA_QUERY = `@media ${TOC_BREAKPOINT}`;

const styles = stylex.create({
  // Centered article when there is no outline aside (original behavior).
  sectionCentered: {
    marginInline: 'auto',
    // Article body text reads larger and airier than the app default
    // (body = 14px / 1.43). Re-assigning the body size/leading tokens here
    // scopes the change to body-typed Text *inside* an article only: the
    // title (display-1) and subtitle (large) use different tokens, and the
    // sidebar/top-nav live in a different subtree, so nothing else shifts.
    //
    // Leading follows the type scale's convention (unitless ratio = a
    // 4px-grid-snapped line box ÷ font size, per expandTypeScale's
    // computeLeading). The grid-snapped value closest to the requested ~1.7
    // at 17px is 28px ÷ 17px = 1.6470588235.
    [typeScaleVars['--text-body-size']]: '1.0625rem', // 17px
    [typeScaleVars['--text-body-leading']]: '1.6470588235', // 28px line box
  },
  // Article that shares the row with a sticky outline aside. Mirrors the
  // larger/airier article body typography from sectionCentered so pages with
  // an outline keep the same readable prose. Below the breakpoint the aside is
  // hidden, so the article re-centers to fill the row.
  sectionInRow: {
    marginInline: {
      default: 0,
      [TOC_MEDIA_QUERY]: 'auto',
    },
    flexShrink: 1,
    minWidth: 0,
    [typeScaleVars['--text-body-size']]: '1.0625rem', // 17px
    [typeScaleVars['--text-body-leading']]: '1.6470588235', // 28px line box
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 32,
    width: '100%',
  },
  aside: {
    // Desktop only — hidden below the breakpoint where the Selector takes over.
    display: {
      default: 'block',
      [TOC_MEDIA_QUERY]: 'none',
    },
    position: 'sticky',
    top: 'calc(var(--appshell-header-height, 0px) + 24px)',
    alignSelf: 'flex-start',
    flexShrink: 0,
    width: 232,
  },
  // Mobile on-this-page selector: pinned below the app header while scrolling.
  // Lives directly in the article column so its sticky range spans the article;
  // an opaque background + bottom border keep content readable as it scrolls
  // underneath. Shown only below the breakpoint.
  mobileOutline: {
    display: {
      default: 'none',
      [TOC_MEDIA_QUERY]: 'block',
    },
    position: 'sticky',
    top: 'var(--appshell-header-height, 0px)',
    zIndex: 1,
    backgroundColor: colorVars['--color-background-surface'],
    paddingBlock: spacingVars['--spacing-3'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  // Title divider. On outline pages the mobile Selector carries its own bottom
  // border, so the divider is hidden below the breakpoint to avoid a doubled
  // separator (applied only when an outline is present).
  titleDivider: {
    display: {
      default: 'block',
      [TOC_MEDIA_QUERY]: 'none',
    },
  },
});

export function DocPageLayout({
  title,
  description,
  titleDescriptionGap = 4,
  children,
  outline,
}: {
  title: string;
  description?: string;
  titleDescriptionGap?: 1 | 4;
  children: ReactNode;
  /**
   * Optional on-this-page navigation items. When non-empty, an Outline aside
   * (desktop) or Selector jump menu (mobile) is rendered. Each item id must
   * match a heading/section element id in `children`.
   */
  outline?: OutlineItem[];
}) {
  const hasOutline = outline != null && outline.length > 0;
  const isNarrow = useMediaQuery(TOC_BREAKPOINT);
  const showAside = hasOutline && !isNarrow;
  const showSelector = hasOutline && isNarrow;

  const [activeId, setActiveId] = useState<string | undefined>(
    outline?.[0]?.id,
  );

  // Track the sticky mobile selector height so anchored sections can offset
  // their scroll position by both the app header and the selector — otherwise
  // the section title lands hidden behind the pinned selector.
  const [selectorHeight, setSelectorHeight] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const selectorRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    if (node == null) {
      setSelectorHeight(0);
      return;
    }
    const measure = () => setSelectorHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      resizeObserverRef.current = observer;
    }
  }, []);

  const selectorOptions = useMemo(
    () => (outline ?? []).map(item => ({value: item.id, label: item.label})),
    [outline],
  );

  const scrollToId = useCallback((id: string) => {
    setActiveId(id);
    const target = document.getElementById(id);
    if (target != null) {
      target.scrollIntoView({behavior: 'smooth', block: 'start'});
      window.history.pushState(null, '', `#${id}`);
    }
  }, []);

  const article = (
    <Section
      maxWidth={layout.proseMaxWidth}
      padding={6}
      xstyle={hasOutline ? styles.sectionInRow : styles.sectionCentered}>
      <VStack gap={10}>
        <VStack gap={4}>
          <VStack gap={titleDescriptionGap}>
            <Heading level={1} type="display-1">
              {title}
            </Heading>
            {description ? (
              <Text type="large" weight="normal" color="secondary">
                {description}
              </Text>
            ) : null}
          </VStack>
          <Divider xstyle={hasOutline && styles.titleDivider} />
        </VStack>
        {showSelector ? (
          <div ref={selectorRef} {...stylex.props(styles.mobileOutline)}>
            <Selector
              label="On this page"
              isLabelHidden
              options={selectorOptions}
              value={activeId}
              onChange={scrollToId}
              width="100%"
            />
          </div>
        ) : null}
        {children}
      </VStack>
    </Section>
  );

  if (!hasOutline) {
    return article;
  }

  const rowProps = stylex.props(styles.row);
  const rowStyle: React.CSSProperties & Record<'--docs-anchor-offset', string> =
    {
      ...rowProps.style,
      // Consumed by anchored section headings (AnchorHeading and Markdown
      // headings) to clear the sticky mobile selector when scrolled to.
      '--docs-anchor-offset': `${selectorHeight}px`,
    };

  return (
    <div className={rowProps.className} style={rowStyle}>
      {article}
      {showAside ? (
        <aside {...stylex.props(styles.aside)}>
          <Outline
            items={outline}
            label="On this page"
            density="compact"
            onActiveIdChange={setActiveId}
          />
        </aside>
      ) : null}
    </div>
  );
}
