// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Astryx community page — channels + contribution paths + live
 * contributors.
 *
 * @input Static community content plus an hourly-cached GitHub contributor list
 * @output Community landing page with contribution paths and contributor wall
 * @position Public docsite page at /community
 *
 * Three roles in one page (modeled after how Astro, Svelte, and
 * GitHub Primer balance the same trio):
 *
 *   1. Channels   — where the community talks (GitHub Issues, X,
 *      Discord). Above the fold.
 *   2. Contribute — how to land code (visual stepper for the RFC
 *      process, plus "Start Here" no-RFC paths with effort
 *      estimates so first-timers can pick a small win).
 *   3. People     — live contributors grid pulled from GitHub.
 *
 * Resources (long-form guides, conventions, dev setup) live as a
 * compact link list near the end. Code of Conduct + License sit
 * in a small footer row so they don't compete with contribution
 * paths for visual weight.
 */

import type {ReactNode} from 'react';
import type {Metadata} from 'next';
import {cacheLife} from 'next/cache';
import {FileText, Scale} from 'lucide-react';
import {NavSurfaceMode} from './NavSurfaceMode';
import {TemplatesPreview} from '../_landing/TemplatesPreview';
import {ThemesPreview} from '../_landing/ThemesPreview';
import {pageMetadata} from '../../../lib/pageMetadata';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {Section} from '@astryxdesign/core/Section';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {getKey} from '@astryxdesign/core/utils';
import {
  AstryxLogo,
  GitHubLogo,
  DiscordLogo,
  FacebookLogo,
  FigmaLogo,
  InstagramLogo,
  ThreadsLogo,
  XLogo,
} from '../../../components/logos';
import {
  GITHUB_REPO,
  DISCORD_URL,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  THREADS_URL,
  X_URL,
} from '../../../constants';
import {layout} from '../../../layout.stylex';

const WIKI_BASE = `${GITHUB_REPO}/wiki`;

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // A plain wrapper, not Section's maxWidth prop: Section's
  // negative-inline-margin styles override margin-inline:auto.
  pageWrap: {
    maxWidth: layout.contentMaxWidth,
    marginInline: 'auto',
    width: '100%',
  },
  // 96px section gap (VStack's gap maxes out at 40px, too tight here).
  sectionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--spacing-12) * 2)',
    maxWidth: layout.contentMaxWidth,
    width: '100%',
    marginInline: 'auto',
  },
  heroGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-4)',
  },
  // flex-end aligns the CTAs to the tagline's baseline at wide widths;
  // flex-start left-aligns them under the text when stacked.
  heroRow: {
    display: 'flex',
    flexDirection: {
      default: 'row',
      '@media (max-width: 760px)': 'column',
    },
    alignItems: {
      default: 'flex-end',
      '@media (max-width: 760px)': 'flex-start',
    },
    justifyContent: 'space-between',
    gap: 'var(--spacing-6)',
  },
  heroText: {
    maxWidth: 480,
    minWidth: 0,
  },

  // -------------------------------------------------------------------------
  // ContributingSection — process list (left) + type cards (right)
  // -------------------------------------------------------------------------
  contribRow: {
    display: 'flex',
    flexDirection: {
      default: 'row',
      '@media (max-width: 900px)': 'column',
    },
    gap: 'var(--spacing-6)',
    alignItems: 'flex-start',
  },
  // flex 1 here + flex 2 on contribTypes yields the 1:2 split.
  contribProcess: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-5)',
  },
  contribTypes: {
    flex: '2 1 0',
    minWidth: 0,
    width: '100%',
  },

  processStep: {
    display: 'flex',
    flexDirection: 'row',
    gap: 'var(--spacing-3)',
    alignItems: 'flex-start',
  },
  // tabular-nums + fixed min-width keep the number column from
  // shifting between "01" and "10".
  processStepNumber: {
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    minWidth: 28,
  },

  // -------------------------------------------------------------------------
  // WallCard — wordmark + scattered contributor faces card
  // -------------------------------------------------------------------------
  wallCard: {
    // position:relative contains the absolutely-positioned avatar
    // layer; isolation:isolate keeps the z-indexed children stacking
    // within this card so the wordmark doesn't render above the
    // sticky top nav on scroll.
    isolation: 'isolate',
    position: 'relative',
    backgroundColor: 'var(--color-background-body)',
    borderColor: 'transparent',
    paddingBlock: 'var(--spacing-12)',
    paddingInline: 'var(--spacing-6)',
    overflow: 'hidden',
    minHeight: 280,
  },
  // width/height 100% are load-bearing: they give the flex column the
  // card's full box to center the wordmark within.
  wallCardCenter: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacing-3)',
  },
  wallWordmark: {
    height: 56,
    width: 'auto',
    display: 'block',
    position: 'relative',
    zIndex: 1,
    color: 'var(--color-brand)',
  },
  wallSeeContributors: {
    position: 'relative',
    zIndex: 1,
  },
  wallDescription: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 480,
    textAlign: 'center' as const,
  },
  wallAvatarLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
  // translate(-50%, -50%) positions each avatar by its center, so the
  // AVATAR_SLOTS percentages refer to where the middle of the tile sits.
  wallAvatar: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 'var(--radius-element)',
    objectFit: 'cover' as const,
  },

  // -------------------------------------------------------------------------
  // EndBlock — bottom-of-page Resources block
  // -------------------------------------------------------------------------
  // A Resources heading followed by categorized link columns
  // (Contributing / Communications / Legal).
  endBlock: {
    position: 'relative',
  },
  endBlockHeaderText: {
    maxWidth: 680,
  },
  endBlockResources: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
  },
  resourceColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-3)',
    minWidth: 0,
  },
  // The negative inline margin cancels ListItem's internal start
  // padding so the row icons sit flush with the page's left reading rail.
  resourceList: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(3, minmax(0, 1fr))',
      '@media (max-width: 900px)': 'repeat(2, minmax(0, 1fr))',
      '@media (max-width: 600px)': '1fr',
    },
    gap: 'var(--spacing-2) var(--spacing-6)',
    marginInlineStart: 'calc(-1 * var(--spacing-3))',
    width: 'calc(100% + var(--spacing-3))',
  },
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-primary)',
    flexShrink: 0,
  },
  // Clamp to 2 lines (ListItem otherwise mid-truncates string
  // descriptions to one line).
  resourceDescription: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // Categories stack vertically (rather than wrapping into grid
  // columns) so the reading order stays unambiguous.
  endBlockResourcesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
    width: '100%',
  },
  // -------------------------------------------------------------------------
  // BlockCard — feature-card-style contribution paths
  // -------------------------------------------------------------------------
  blockGrid: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(2, 1fr)',
      '@media (max-width: 720px)': '1fr',
    },
    gap: 'var(--spacing-4)',
    width: '100%',
  },
  blockCard: {
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--astryx-marketing-feature-card-bg)',
  },
  blockCardStack: {
    height: '100%',
  },
  // Bottom-anchored image; negative margins bleed it to the card edges
  // (clipped by overflow:hidden).
  blockCardImage: {
    marginTop: 'auto',
    paddingTop: 16,
    marginBottom: 'calc(var(--spacing-5) * -1)',
    marginInlineStart: 'calc(var(--spacing-5) * -1)',
    marginInlineEnd: 'calc(var(--spacing-5) * -1)',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  blockCardImageImg: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  // No bleed here: the preview components own their edge bleed via
  // internal container queries.
  blockCardPreview: {
    marginTop: 'auto',
    paddingTop: 16,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
});

// =============================================================================
// WallCard — Astryx wordmark + scattered contributor faces
// =============================================================================

// Avatar slot positions (center coordinates as % of the card; see
// wallAvatar's translate(-50%, -50%)) with a per-slot rotation. Fixed,
// not randomized, so SSR markup is deterministic (no hydration mismatch).
// Two bands (top + bottom) leave a clear channel for the wordmark.
const AVATAR_SLOTS: ReadonlyArray<{
  top: string;
  left: string;
  rotate: number;
}> = [
  {top: '10%', left: '8%', rotate: -5},
  {top: '6%', left: '24%', rotate: 3},
  {top: '12%', left: '40%', rotate: -4},
  {top: '8%', left: '60%', rotate: 5},
  {top: '11%', left: '76%', rotate: -3},
  {top: '6%', left: '92%', rotate: 6},
  {top: '88%', left: '8%', rotate: 4},
  {top: '92%', left: '24%', rotate: -6},
  {top: '86%', left: '40%', rotate: 3},
  {top: '90%', left: '60%', rotate: -4},
  {top: '88%', left: '76%', rotate: 5},
  {top: '94%', left: '92%', rotate: -3},
];

// Unsplash placeholder portraits, used when the contributors API
// returns fewer faces than there are avatar slots.
const FALLBACK_AVATARS: ReadonlyArray<string> = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1463453091185-61582044d556?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=80&h=80&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&h=80&fit=crop&crop=faces',
];

function WallCard({contributors}: {contributors: ReadonlyArray<Contributor>}) {
  // Real contributor avatars first, Unsplash placeholders for the rest.
  const avatars = AVATAR_SLOTS.map((slot, i) => ({
    src: contributors[i]?.avatar_url ?? FALLBACK_AVATARS[i],
    key: getKey(contributors[i]?.login, i),
    slot,
  }));

  return (
    <Card padding={0} xstyle={styles.wallCard}>
      <div {...stylex.props(styles.wallAvatarLayer)} aria-hidden="true">
        {avatars.map(({src, key, slot}) => (
          <img
            key={key}
            src={src}
            alt=""
            {...stylex.props(styles.wallAvatar)}
            style={{
              top: slot.top,
              left: slot.left,
              transform: `translate(-50%, -50%) rotate(${slot.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div {...stylex.props(styles.wallCardCenter)}>
        <AstryxLogo
          role="img"
          aria-label="Astryx"
          {...stylex.props(styles.wallWordmark)}
        />
        <Text type="body" color="primary" xstyle={styles.wallDescription}>
          A growing community of designers and engineers ship Astryx together.
          <br />
          Your name could be next.
        </Text>
        <Link
          label="See contributors"
          href={`${GITHUB_REPO}/graphs/contributors`}
          target="_blank"
          type="supporting"
          color="secondary"
          hasUnderline
          xstyle={styles.wallSeeContributors}>
          See contributors
        </Link>
      </div>
    </Card>
  );
}

// =============================================================================
// BlockCard — color-blocked contribution-type card
// =============================================================================

interface BlockCardProps {
  label: string;
  description: string;
  href: string;
  badge?: string;
  image?: {src: string; alt: string};
  /** Live preview rendered in place of the image; takes precedence over it. */
  preview?: ReactNode;
}

function BlockCard({
  label,
  description,
  href,
  badge,
  image,
  preview,
}: BlockCardProps) {
  const hasPreview = preview != null;
  const hasImage = !hasPreview && image != null;
  const hasMedia = hasPreview || hasImage;
  return (
    <ClickableCard
      label={`Open ${label}`}
      href={href}
      variant="transparent"
      padding={5}
      xstyle={styles.blockCard}>
      <VStack
        gap={1}
        align="start"
        xstyle={hasMedia ? styles.blockCardStack : undefined}>
        <Heading level={3} color="primary">
          {label}
        </Heading>
        <Text type="body" color="primary">
          {description}
        </Text>
        {badge && (
          <Text type="supporting" color="secondary">
            {badge}
          </Text>
        )}
        {hasPreview && (
          <div {...stylex.props(styles.blockCardPreview)}>{preview}</div>
        )}
        {hasImage && image && (
          <div {...stylex.props(styles.blockCardImage)}>
            <img
              src={image.src}
              alt={image.alt}
              {...stylex.props(styles.blockCardImageImg)}
            />
          </div>
        )}
      </VStack>
    </ClickableCard>
  );
}

// =============================================================================
// Data
// =============================================================================

// A titled link in the Resources grid (guides, legal, and channels).
// The SVG icon type lets Lucide icons and the brand logos interchange.
interface Resource {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

// Communications channels, using the same brand logos as the footer.
const CHANNELS: ReadonlyArray<Resource> = [
  {
    title: 'GitHub Issues',
    description:
      'File bugs and feature requests. Triaged weekly with response within a few days.',
    href: `${GITHUB_REPO}/issues`,
    icon: GitHubLogo,
  },
  {
    title: 'Discord',
    description:
      'Hang out with the community in real time. Ask questions, share work, and trade ideas.',
    href: DISCORD_URL,
    icon: DiscordLogo,
  },
  {
    title: 'Facebook',
    description:
      'Follow the page for announcements, milestones, and community highlights.',
    href: FACEBOOK_URL,
    icon: FacebookLogo,
  },
  {
    title: 'Instagram',
    description:
      'See design work, behind-the-scenes, and visual inspiration from the team.',
    href: INSTAGRAM_URL,
    icon: InstagramLogo,
  },
  {
    title: 'Threads',
    description:
      'Join the conversation and keep up with updates as they happen.',
    href: THREADS_URL,
    icon: ThreadsLogo,
  },
  {
    title: 'X',
    description:
      'Follow along for release notes, design notes, and behind-the-scenes from the team.',
    href: X_URL,
    icon: XLogo,
  },
];

// RFC stepper steps — the "from idea to shipped" contribution journey.
interface StepperStep {
  number: string;
  title: string;
  description: string;
}

const RFC_STEPS: ReadonlyArray<StepperStep> = [
  {
    number: '01',
    title: 'Share a proposal',
    description:
      'Describe the problem you ran into and what you think should change. We respond within a week.',
  },
  {
    number: '02',
    title: 'Shape it together',
    description:
      'We co-explore research, use cases, and design options until the right shape becomes obvious.',
  },
  {
    number: '03',
    title: 'Ship it experimentally',
    description:
      'New components ship in @astryxdesign/lab first, where the team and real users put them through their paces.',
  },
  {
    number: '04',
    title: 'Make it official',
    description:
      'Once battle-tested and refined, the work graduates from @astryxdesign/lab into @astryxdesign/core for everyone to use.',
  },
];

// Start Here paths — no-RFC contributions, each with an effort badge.
interface StartHerePath {
  title: string;
  description: string;
  href: string;
  effort: string;
  image?: {src: string; alt: string};
  /** Live preview rendered in place of the image. */
  preview?: ReactNode;
}

const START_HERE: ReadonlyArray<StartHerePath> = [
  {
    title: 'Fix a bug',
    description:
      'Spot something broken? File an issue to confirm it, then submit a change with a clear reproduction.',
    href: `${GITHUB_REPO}/issues/new?template=bug.yml`,
    effort: '~2 hours',
    image: {
      src: '/feature-bug.png',
      alt: 'Bug report illustration with issue tracker and code snippet',
    },
  },
  {
    title: 'Improve the docs',
    description:
      'Fix typos, improve examples, and fill gaps. Reviewed for correctness and clarity.',
    href: `${GITHUB_REPO}/issues/new/choose`,
    effort: '~30 min',
    image: {
      src: '/feature-docs.png',
      alt: 'Docs page preview showing the Astryx documentation site',
    },
  },
  {
    title: 'Add a template',
    description:
      'Show components in realistic context. Templates are training signal for both humans and LLMs.',
    href: `${WIKI_BASE}/Contributing-Templates`,
    effort: '~half day',
    preview: <TemplatesPreview maxRows={2} />,
  },
  {
    title: 'Build a theme',
    description:
      'Full visual control through defineTheme(). Tokens, component overrides, and mode switching.',
    href: '/docs/theme',
    effort: '~1 day',
    preview: <ThemesPreview />,
  },
];

interface ResourceCategory {
  label: string;
  items: ReadonlyArray<Resource>;
}

const RESOURCE_CATEGORIES: ReadonlyArray<ResourceCategory> = [
  {
    label: 'Contributing',
    items: [
      {
        title: 'Contributing Guide',
        description:
          'The full process, what we accept, and how proposals get reviewed.',
        href: `${WIKI_BASE}/Contributing`,
        icon: FileText,
      },
      {
        title: 'Contributing with AI',
        description:
          'How to use AI assistants effectively within Astryx conventions.',
        href: `${WIKI_BASE}/Contributing-with-AI-Assistants`,
        icon: FileText,
      },
      {
        title: 'Dev Setup',
        description: 'Clone, install, build, and run Storybook locally.',
        href: '/docs/getting-started',
        icon: FileText,
      },
      {
        title: 'API Conventions',
        description:
          'How components in Astryx are named, shaped, and composed.',
        href: `${WIKI_BASE}/API-Conventions`,
        icon: FileText,
      },
      {
        title: 'API Arbitration',
        description: 'How we settle design disagreements using vibe testing.',
        href: `${WIKI_BASE}/API-Arbitration`,
        icon: FileText,
      },
    ],
  },
  {
    label: 'Design',
    items: [
      {
        title: 'Astryx Library',
        description: 'Official Figma library, by Meta (@meta).',
        href: 'https://www.figma.com/community/file/1659998707120781098',
        icon: FigmaLogo,
      },
      {
        title: 'Astryx for Figma',
        description: 'Community-built by AItoPeople (@aitopeople).',
        href: 'https://www.figma.com/community/file/1655939158795671259/astryx-for-figma',
        icon: FigmaLogo,
      },
      {
        title: 'Astryx Design System for Figma v0.1',
        description: 'Community-built by Adrian Stefan (@stefdrian).',
        href: 'https://www.figma.com/community/file/1661363854016665156/astryx-design-system-for-figma-v0-1',
        icon: FigmaLogo,
      },
    ],
  },
  {
    label: 'Communications',
    items: CHANNELS,
  },
  {
    label: 'Legal',
    items: [
      {
        title: 'Code of Conduct',
        description:
          'Our standards for respectful collaboration and how we handle reports.',
        href: `${GITHUB_REPO}/blob/main/CODE_OF_CONDUCT.md`,
        icon: Scale,
      },
      {
        title: 'MIT License',
        description:
          'Astryx is open source under the MIT License. Free to use.',
        href: `${GITHUB_REPO}/blob/main/LICENSE`,
        icon: Scale,
      },
    ],
  },
];

// =============================================================================
// Live data
// =============================================================================

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
}

// Contributor list for the wall card. Points at facebook/stylex —
// the public foundation Astryx is built on — as a stand-in for the
// Astryx contributor set. Falls back to Unsplash placeholders if the
// request fails.
async function fetchContributors(): Promise<Contributor[]> {
  'use cache';
  cacheLife('hours');

  try {
    const res = await fetch(
      'https://api.github.com/repos/facebook/stylex/contributors?per_page=50',
    );
    if (!res.ok) {
      return [];
    }
    return res.json();
  } catch {
    return [];
  }
}

// =============================================================================
// Page
// =============================================================================

export const metadata: Metadata = pageMetadata({
  title: 'Community',
  description:
    'Join the Astryx community: contribute on GitHub, follow updates, and meet the people building the design system.',
  path: '/community',
});

export default async function CommunityPage() {
  const contributors = await fetchContributors();

  return (
    <div {...stylex.props(styles.pageWrap)}>
      <NavSurfaceMode />
      <Section padding={6}>
        <div {...stylex.props(styles.sectionStack)}>
          <div {...stylex.props(styles.heroGroup)}>
            <div {...stylex.props(styles.heroRow)}>
              <VStack gap={1} xstyle={styles.heroText}>
                <Heading level={1} type="display-1" color="primary">
                  Build with us
                </Heading>
                <Text type="body" size="base" color="secondary">
                  A friendly community of designers and engineers shaping the
                  system together.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  variant="secondary"
                  size="md"
                  label="Browse Issues"
                  href={`${GITHUB_REPO}/issues`}
                />
                <Button
                  variant="primary"
                  size="md"
                  label="Start Contributing"
                  href={`${WIKI_BASE}/Contributing`}
                />
              </HStack>
            </div>

            <WallCard contributors={contributors} />
          </div>

          {/* How we build together — heading + numbered process on the
              left, contribution-type cards on the right. */}
          <div {...stylex.props(styles.contribRow)}>
            <div {...stylex.props(styles.contribProcess)}>
              <VStack gap={1}>
                <Heading level={2} type="display-3">
                  How we build together
                </Heading>
                <Text type="body" color="secondary">
                  Contributing to Astryx means contributing to the system, not
                  to a single component. Each step has a clear gate, so you
                  always know what comes next.
                </Text>
              </VStack>
              {RFC_STEPS.map(step => (
                <div key={step.number} {...stylex.props(styles.processStep)}>
                  <Text
                    type="body"
                    weight="semibold"
                    color="secondary"
                    xstyle={styles.processStepNumber}>
                    {step.number}
                  </Text>
                  <VStack gap={1}>
                    <Heading level={3}>{step.title}</Heading>
                    <Text type="supporting" color="secondary">
                      {step.description}
                    </Text>
                  </VStack>
                </div>
              ))}
            </div>
            <div {...stylex.props(styles.contribTypes)}>
              <div {...stylex.props(styles.blockGrid)}>
                {START_HERE.map(path => (
                  <BlockCard
                    key={path.title}
                    label={path.title}
                    description={path.description}
                    href={path.href}
                    badge={path.effort}
                    image={path.image}
                    preview={path.preview}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* End-of-page Resources block — Contributing, Communications,
              and Legal links in one categorized list grid. */}
          <div {...stylex.props(styles.endBlock)}>
            <div {...stylex.props(styles.endBlockResources)}>
              <Heading
                level={2}
                type="display-2"
                xstyle={styles.endBlockHeaderText}>
                Resources
              </Heading>
              <div {...stylex.props(styles.endBlockResourcesGrid)}>
                {RESOURCE_CATEGORIES.map(category => (
                  <div
                    key={category.label}
                    {...stylex.props(styles.resourceColumn)}>
                    <Heading level={4} color="primary">
                      {category.label}
                    </Heading>
                    <List xstyle={styles.resourceList}>
                      {category.items.map(resource => {
                        const Icon = resource.icon;
                        // Open external links in a new tab; internal docs
                        // routes navigate in place via the framework router.
                        const isExternal = resource.href.startsWith('http');
                        return (
                          <ListItem
                            key={resource.title}
                            label={resource.title}
                            // Span (not a plain string) so ListItem skips its
                            // single-line truncation; clamped via the style.
                            description={
                              <span
                                {...stylex.props(styles.resourceDescription)}>
                                {resource.description}
                              </span>
                            }
                            href={resource.href}
                            target={isExternal ? '_blank' : undefined}
                            startContent={
                              <span {...stylex.props(styles.iconTile)}>
                                <Icon
                                  width={18}
                                  height={18}
                                  aria-hidden="true"
                                />
                              </span>
                            }
                          />
                        );
                      })}
                    </List>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
