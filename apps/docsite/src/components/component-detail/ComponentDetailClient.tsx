// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Composes a generated component's overview, examples, and detail tabs.
 * @input Component metadata (including its stability), package metadata, and
 *   its showcase block.
 * @output The interactive component detail article with stable example targets.
 * @position Client content for /components/[name].
 */

import * as stylex from '@stylexjs/stylex';
import {Suspense} from 'react';
import {useSearchParams, useRouter, usePathname} from 'next/navigation';
import {Badge, type BadgeVariant} from '@astryxdesign/core/Badge';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Card} from '@astryxdesign/core/Card';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Divider} from '@astryxdesign/core';
import {typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';
import {CodeExampleBlock} from '../CodeExampleBlock';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {ShowcasePreview} from './ShowcasePreview';
import {ExampleAnchor} from './ExampleAnchor';
import {ComponentPreviewTheme} from './ComponentPreviewTheme';
import {Anatomy} from './Anatomy';
import {BestPractices} from './BestPractices';
import {Theming} from './Theming';
import {Accessibility} from './Accessibility';
import {HookSignature} from './HookSignature';
import {ExampleBlock} from './ExampleBlock';
import {MarkdownText} from '../MarkdownText';
import {
  InteractivePreviewStage,
  useInteractiveState,
} from './InteractivePreview';
import {hasInteractivePlayground} from './interactiveState';
import {hasThemingContent} from './themingHelpers';
import {CURRENT_TARGET} from '../../lib/docsVersions';
import {PlaygroundPropsTable} from './PlaygroundPropsTable';
import {PropsTable} from './PropsTable';
import type {ComponentEntry} from '../../generated/componentRegistry';
import type {BlockEntry} from '../../generated/blockRegistry';
import {showcaseRegistry} from '../../generated/showcaseRegistry';
import {exampleRegistry} from '../../generated/exampleRegistry';
import {
  shadcnRegistryIsPreview,
  shadcnRegistryOrigin,
} from '../../generated/shadcnRegistry';
import {trackNavigate} from '../../lib/analytics';
import {exampleAnchorId} from '../../lib/exampleAnchor.mjs';
import {
  shadcnComponentItemPath,
  shadcnInstallCommand,
} from '../../lib/shadcnRegistry.mjs';

const styles = stylex.create({
  section: {
    marginInline: 'auto',
  },
  // Match the docs article body treatment (16px / 1.75) from DocPageLayout,
  // scoped to the Overview prose only — the dense Properties props table keeps
  // its compact body size. Live previews in the Overview are isolated inside
  // ComponentPreviewTheme (a nested Theme that re-declares the type-scale
  // tokens), so this override never leaks into them. The Usage/Examples
  // descriptions (large) use different tokens and are unaffected.
  overviewProse: {
    [typeScaleVars['--text-body-size']]: '1rem', // 16px
    [typeScaleVars['--text-body-leading']]: '1.75', // 28px line box
  },
  previewStage: {
    position: 'sticky',
    top: 44,
    zIndex: 10,
    backgroundColor: 'var(--color-background-page)',
    backdropFilter: 'blur(16px)',
    maxHeight: {default: 400, '@media (max-width: 768px)': 250},
    overflow: 'auto',
    borderWidth: 'var(--border-width, 1px)',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    borderRadius: 'var(--radius-container)',
  },
  // Reserve enough of the article to keep the footer below the viewport while
  // Next streams the query-dependent tab panel. The named skeleton shapes
  // mirror the tab row, live preview, heading and prose rather than presenting
  // the empty Suspense hole that previously caused the 0.23 CLS.
  loadingContent: {
    minHeight: {default: 900, '@media (max-width: 768px)': 680},
  },
  loadingPreview: {
    height: {default: 320, '@media (max-width: 768px)': 220},
  },
});

interface ComponentDetailClientProps {
  comp: ComponentEntry;
  pkg: string | undefined;
  pkgVersion: string | undefined;
  showcase: BlockEntry | undefined;
}

/** The header badge for each stability other than stable, which shows none. */
const STABILITY_BADGES: Record<
  NonNullable<ComponentEntry['stability']>,
  {label: string; variant: BadgeVariant}
> = {
  experimental: {label: 'Experimental', variant: 'orange'},
  lab: {label: 'Lab', variant: 'purple'},
};

function OverviewContent({
  comp,
  pkg,
  pkgVersion,
  showcase,
  hasShowcase,
}: ComponentDetailClientProps & {hasShowcase: boolean}) {
  const isHook = comp.params != null;
  const importFrom = comp.importPath ?? `${pkg}/${comp.directory}`;
  const importPath = `import {${comp.moduleName}} from '${importFrom}'`;

  return (
    <VStack gap={8} xstyle={styles.overviewProse}>
      {hasShowcase && (
        <ExampleAnchor
          id={showcase ? exampleAnchorId(showcase.dirName) : undefined}>
          <ComponentPreviewTheme>
            <Card variant="muted" padding={0}>
              <ShowcasePreview name={comp.name} />
            </Card>
          </ComponentPreviewTheme>
        </ExampleAnchor>
      )}

      {comp.usage && (
        <VStack gap={4}>
          <Heading level={2} type="display-3">
            Usage
          </Heading>
          <MarkdownText type="large" weight="normal">
            {comp.usage.description}
          </MarkdownText>

          <CodeExampleBlock
            code={importPath}
            language="ts"
            width="100%"
            hasCopyButton
          />

          {/* Anatomy before best practices, matching the CLI's section order
              in clients/cli/lib/component-format.mjs. */}
          {comp.usage.anatomy && comp.usage.anatomy.length > 0 && (
            <Anatomy elements={comp.usage.anatomy} />
          )}

          {comp.usage.bestPractices && comp.usage.bestPractices.length > 0 && (
            <BestPractices practices={comp.usage.bestPractices} />
          )}
        </VStack>
      )}

      {isHook && comp.params && comp.returns && (
        <HookSignature
          params={comp.params}
          returns={comp.returns}
          typeDefs={comp.typeDefs}
        />
      )}

      {!isHook && !hasInteractivePlayground(comp) && comp.props.length > 0 && (
        <PropsTable props={comp.props} heading="Props" />
      )}

      {(exampleRegistry[comp.name] || []).length > 0 && (
        <>
          <VStack gap={4}>
            <Heading level={2} type="display-3">
              Examples
            </Heading>
            <Text type="large" weight="normal">
              Common configurations, variations, and states.
            </Text>
          </VStack>
          <VStack gap={10}>
            {(exampleRegistry[comp.name] || []).map((entry, i) => (
              <ExampleBlock key={i} entry={entry} componentName={comp.name} />
            ))}
          </VStack>
        </>
      )}

      {CURRENT_TARGET === 'canary' && pkg && pkgVersion && (
        <>
          <Divider />
          <VStack gap={2}>
            <Heading level={2} type="display-3">
              Use with shadcn
            </Heading>
            <MarkdownText type="body">
              Already using the shadcn registry workflow? Install the real
              Astryx package and a local public re-export. Component
              implementation source stays in Astryx.
            </MarkdownText>
            {shadcnRegistryIsPreview && (
              <Text type="supporting" color="secondary">
                This install URL expires with the draft preview.
              </Text>
            )}
            <CodeExampleBlock
              code={shadcnInstallCommand(
                shadcnComponentItemPath(pkg, comp.name, isHook, comp.registry),
                shadcnRegistryOrigin,
              )}
              language="bash"
              width="100%"
              hasCopyButton
            />
          </VStack>
        </>
      )}
    </VStack>
  );
}

interface ComponentDetailTabsProps extends ComponentDetailClientProps {
  hasPlayground: boolean;
  hasThemingTab: boolean;
  hasAccessibilityTab: boolean;
  hasShowcase: boolean;
}

/**
 * Query-dependent portion of the page. Keeping this below the nearest
 * Suspense boundary lets the page heading and every component with no tabs
 * remain in the prerendered shell while preserving `useSearchParams()` as the
 * source of truth for deep links and soft navigation.
 */
function ComponentDetailTabs({
  comp,
  pkg,
  pkgVersion,
  showcase,
  hasPlayground,
  hasThemingTab,
  hasAccessibilityTab,
  hasShowcase,
}: ComponentDetailTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const accessibilityRequirements = comp.usage?.accessibility ?? [];
  const accessibilityThemeCoverage =
    comp.usage?.accessibilityThemeCoverage ?? [];

  const requestedTab = searchParams.get('tab') ?? 'overview';
  // Clamp to a tab that actually exists for this component so a stale or
  // hand-edited `?tab=` never lands on a blank panel.
  const tab =
    (requestedTab === 'properties' && hasPlayground) ||
    (requestedTab === 'theming' && hasThemingTab) ||
    (requestedTab === 'accessibility' && hasAccessibilityTab)
      ? requestedTab
      : 'overview';
  const setTab = (value: string) => {
    trackNavigate({
      page: 'components',
      target: 'tab',
      tab: value,
      item: comp.name,
    });
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, {scroll: false});
  };

  const {knobs, state, setProp, missingRequiredProps} = useInteractiveState(
    comp.name,
    comp.props,
    comp.playground,
  );

  return (
    <>
      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab value="overview" label="Overview" />
        {hasPlayground && <Tab value="properties" label="Properties" />}
        {hasThemingTab && <Tab value="theming" label="Theming" />}
        {hasAccessibilityTab && (
          <Tab value="accessibility" label="Accessibility" />
        )}
      </TabList>

      {tab === 'overview' && (
        <OverviewContent
          comp={comp}
          pkg={pkg}
          pkgVersion={pkgVersion}
          showcase={showcase}
          hasShowcase={hasShowcase}
        />
      )}

      {tab === 'properties' && hasPlayground && (
        <VStack gap={4}>
          <div {...stylex.props(styles.previewStage)}>
            <InteractivePreviewStage
              name={comp.name}
              state={state}
              knobs={knobs}
              playground={comp.playground}
              missingRequiredProps={missingRequiredProps}
              onPropChange={setProp}
              embedded
              canControlOpenState={
                comp.props.some(prop => prop.name === 'isOpen') &&
                comp.props.some(prop => prop.name === 'onOpenChange')
              }
            />
          </div>

          {comp.props.length > 0 && (
            <Section>
              <VStack gap={3}>
                <Heading level={3}>Props</Heading>
                <PlaygroundPropsTable
                  props={comp.props}
                  typeDefs={comp.typeDefs}
                  knobs={knobs}
                  state={state}
                  onPropChange={setProp}
                />
              </VStack>
            </Section>
          )}
        </VStack>
      )}

      {tab === 'theming' && comp.theming && (
        <Theming theming={comp.theming} props={comp.props} />
      )}

      {tab === 'accessibility' && hasAccessibilityTab && (
        <Accessibility
          componentName={comp.name}
          requirements={accessibilityRequirements}
          themeCoverage={accessibilityThemeCoverage}
        />
      )}
    </>
  );
}

function ComponentDetailFallback({hasShowcase}: {hasShowcase: boolean}) {
  return (
    <div
      role="status"
      aria-label="Loading component documentation"
      {...stylex.props(styles.loadingContent)}>
      <VStack gap={8}>
        <Skeleton width="100%" height={40} radius={0} index={0} />
        {hasShowcase && (
          <div {...stylex.props(styles.loadingPreview)}>
            <Skeleton width="100%" height="100%" index={1} />
          </div>
        )}
        <VStack gap={3}>
          <Skeleton width={180} height={32} index={2} />
          <Skeleton width="92%" height={18} index={3} />
          <Skeleton width="68%" height={18} index={4} />
          <Skeleton width="100%" height={72} index={5} />
        </VStack>
      </VStack>
    </div>
  );
}

export function ComponentDetailClient({
  comp,
  pkg,
  pkgVersion,
  showcase,
}: ComponentDetailClientProps) {
  const hasShowcase = comp.name in showcaseRegistry;
  const hasPlayground = hasInteractivePlayground(comp);
  const hasThemingTab =
    CURRENT_TARGET === 'canary' && hasThemingContent(comp.theming);
  const accessibilityRequirements = comp.usage?.accessibility ?? [];
  const accessibilityThemeCoverage =
    comp.usage?.accessibilityThemeCoverage ?? [];
  const hasAccessibilityTab =
    accessibilityRequirements.length > 0 ||
    accessibilityThemeCoverage.length > 0;
  const hasTabs = hasPlayground || hasThemingTab || hasAccessibilityTab;
  const stabilityBadge =
    comp.stability != null ? STABILITY_BADGES[comp.stability] : null;

  return (
    <Section
      maxWidth={960}
      padding={6}
      variant="transparent"
      xstyle={styles.section}>
      <VStack gap={4}>
        {/* This heading is independent of the URL and belongs in the static
            shell. Only the tab row and panel below need request state. */}
        <VStack gap={2}>
          <Text type="display-1">{comp.displayName}</Text>
          <Text type="supporting" color="secondary">
            {!comp.isReady ? 'Canary · ' : ''}
            {pkg}
            {pkgVersion ? ` v${pkgVersion}` : ''} · {comp.moduleName}
            {stabilityBadge && (
              <>
                {' '}
                <Badge
                  label={stabilityBadge.label}
                  variant={stabilityBadge.variant}
                />
              </>
            )}
            {!comp.isReady && pkg ? ` · npm install ${pkg}@canary` : ''}
          </Text>
        </VStack>

        {hasTabs ? (
          <Suspense
            fallback={<ComponentDetailFallback hasShowcase={hasShowcase} />}>
            <ComponentDetailTabs
              comp={comp}
              pkg={pkg}
              pkgVersion={pkgVersion}
              showcase={showcase}
              hasPlayground={hasPlayground}
              hasThemingTab={hasThemingTab}
              hasAccessibilityTab={hasAccessibilityTab}
              hasShowcase={hasShowcase}
            />
          </Suspense>
        ) : (
          <>
            <Divider />
            <OverviewContent
              comp={comp}
              pkg={pkg}
              pkgVersion={pkgVersion}
              showcase={showcase}
              hasShowcase={hasShowcase}
            />
          </>
        )}
      </VStack>
    </Section>
  );
}
