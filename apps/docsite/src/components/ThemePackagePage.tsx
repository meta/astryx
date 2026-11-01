// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {AnchorHTMLAttributes} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {usePathname, useRouter} from 'next/navigation';
import {Sun, Moon} from 'lucide-react';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Carousel} from '@astryxdesign/core/Carousel';
import {Theme} from '@astryxdesign/core/theme';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Popover} from '@astryxdesign/core/Popover';
import {LinkProvider} from '@astryxdesign/core/Link';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {ThemeShowcaseStore} from '../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {getThemeShowcaseContent} from './themeShowcaseContent';
import {buildPlaygroundHref} from './playgroundLink';
import {packages} from '../generated/packageRegistry';
import {themeObjects} from '../generated/themeRegistry';
import {templates} from '../generated/templateRegistry';
import {trackCopy, trackOpenPlayground, trackToggle} from '../lib/analytics';
import {useThemeMode} from '../app/providers';
import {ThemeHeading} from './ThemeHeading';
import {
  ThemeExplorerActions,
  ThemeExplorerLayout,
  ThemeExplorerMobileBar,
  ThemeExplorerMobileCarousel,
  ThemeExplorerMobileCarouselItem,
  ThemeExplorerMobileContext,
  ThemeExplorerPreview,
  ThemeExplorerRightColumn,
  ThemeExplorerSidebar,
  ThemeExplorerSidebarContent,
  ThemeExplorerSidebarSurface,
} from './ThemeExplorerLayout';

// Raw source of the theme-showcase page template (embedded as a string in
// the generated template registry). Used to prepopulate the playground's
// code editor when the user clicks "Open in Playground" from a theme.
const THEME_SHOWCASE_SOURCE =
  templates.find(t => t.slug === 'theme-showcase')?.source ?? '';

// Per-theme picker banners are self-hosted under the docsite's /public/images
// dir (same location as the showcase product photos).

// Gallery order — themes are listed in the same canonical visual-
// closeness order used elsewhere (most restrained → most expressive).
// Lives here so the sidebar's theme list reads in the same order as
// /themes (Neutral → Stone → Gothic → Matcha → Y2K → Butter). Any
// theme not in this list falls to the end alphabetically.
const THEME_ORDER: ReadonlyArray<string> = [
  '@astryxdesign/theme-neutral',
  '@astryxdesign/theme-stone',
  '@astryxdesign/theme-gothic',
  '@astryxdesign/theme-matcha',
  '@astryxdesign/theme-y2k',
  '@astryxdesign/theme-butter',
];

// The package whose selection corresponds to the canonical bare
// `/themes` URL (no `?theme=` query string). Must agree with the
// `DEFAULT_THEME_PACKAGE` constant in `app/(site)/themes/page.tsx`,
// which uses the same value to seed the page when no query param
// is present — if these drift, the picker will round-trip the URL
// (selecting the "default" theme would write a query that the
// server then strips on reload, etc.).
const DEFAULT_THEME_PACKAGE = '@astryxdesign/theme-neutral';

// The CLI command that copies a theme into the consumer's project as
// editable source (see `astryx theme add`). The destination defaults to
// `src/themes/<slug>/`. We invoke the scoped package (`@astryxdesign/cli`)
// rather than the bare `astryx` bin so the copy-paste command works even when
// the CLI isn't installed yet — bare `npx astryx` would resolve to an
// unrelated package on the npm registry.
function themeScaffoldCommand(slug: string): string {
  return `npx @astryxdesign/cli theme add ${slug}`;
}

// Strip "Theme: " prefix and " Theme" suffix from the registered
// displayName so the switcher labels read as the brand wordmark
// ("Neutral", "Butter") rather than the redundant decorations.
// Mirrors the same helper used on the /themes overview page.
function themeLabel(displayName: string): string {
  return displayName.replace(/^Theme:\s*/, '').replace(/\s*Theme$/, '');
}

// Strip the `@astryxdesign/theme-` prefix so the slug matches the URL form
// used by both the dynamic redirect route (`/themes/<slug>`) and
// the explorer's `?theme=<slug>` query param. Mirrored from the
// helper on the server-side page.tsx so the encode/decode stays in
// sync at a single import boundary.
function packageNameToSlug(packageName: string): string {
  return packageName.replace(/^@astryxdesign\/theme-/, '');
}

// Inert anchor for the showcase preview — preventDefaults clicks so demo
// href="#" links don't scroll the docsite to the top.
function PreviewAnchor({
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      onClick={e => {
        e.preventDefault();
        onClick?.(e);
      }}
    />
  );
}

const styles = stylex.create({
  // Make every action button (hero CTAs, mode toggle, Open in Playground)
  // stretch to the sidebar width and left-align its label
  // (Button's default is centered, which looks off in a vertical
  // nav-style list).
  themeListButton: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  // The two stacked action buttons, full-width.
  actionButton: {
    width: '100%',
  },
  // The command snippet in the popover — CodeBlock with container="section"
  // (no border/radius of its own), so paint the muted inset here. CodeBlock
  // keeps its headerless copy button in a column beside the code.
  commandBlock: {
    width: '100%',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  // Themed theme-row card. The SelectableCard wrapper itself
  // stays variant="transparent" + padding=0 so it doesn't paint a
  // surface from the OUTER docsite theme; the inner themedSurface
  // div (rendered inside its own <Theme>) does the painting using
  // the theme being represented. That way each card reads as a
  // miniature brand preview rather than a docsite-Astryx card with
  // theme-colored text on top.
  themeCard: {
    width: '100%',
  },
  // Inner card surface — lives inside the per-card <Theme>
  // wrapper so the theme's heading typography (used by the
  // wordmark) + brand color tokens (used by the gradient) all
  // resolve to the represented theme's values. Each card becomes
  // a mood tile: soft multi-radial gradient backdrop made from
  // the theme's accent + categorical hues, with the wordmark
  // centered on top in the theme's heading font.
  //
  // Fixed height so every card lines up identically regardless of
  // the theme's heading font (cursive themes render glyphs taller
  // than sans-serif themes). 120px reads as a hero tile rather
  // than a list row.
  //
  // Gradient is a stack of 5 radial gradients placed at the
  // corners + center, using semi-transparent theme colors so they
  // blend into each other (rather than stacking as discrete
  // blobs). Mixed with surface as the base so light + dark themes
  // both get a soft, painterly look.
  themedSurface: {
    height: 120,
    padding: 'var(--spacing-4)',
    // Hardcoded radius rather than var(--radius-container) so each
    // card matches the others regardless of the represented theme's
    // own container radius. (Matcha uses a smaller container
    // radius than Neutral, which would otherwise visibly differ
    // when its card lives in the picker beside the others.) The
    // outer SelectableCard's selected-state inset shadow uses
    // the same radius implicitly via its own borderRadius, so this
    // value should stay in sync with the docsite's container
    // radius (12px in Astryx).
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface)',
    backgroundImage: [
      // Top-left: accent
      'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--color-accent) 65%, transparent), transparent 60%)',
      // Top-right: orange categorical
      'radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-background-orange) 70%, transparent), transparent 60%)',
      // Bottom-left: green categorical
      'radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--color-background-green) 70%, transparent), transparent 60%)',
      // Bottom-right: blue categorical
      'radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--color-background-blue) 70%, transparent), transparent 60%)',
      // Center: accent-muted bloom that softens everything else
      'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-accent-muted) 50%, transparent), transparent 70%)',
    ].join(', '),
  },
  // Per-theme bespoke picker artwork — one rule per theme that
  // has a custom photo (vs. the multi-radial-gradient default).
  // Each rule sets the picker card's background to a dedicated
  // theme-<slug>-picker.png banner self-hosted under /public/images.
  // These are SEPARATE files from the
  // theme-<slug>-preview.png images used on the /themes overview +
  // detail page hero — these picker assets are sized and
  // art-directed for the small 120px-tall picker card.
  // background-size:cover so each image always fills the card
  // regardless of the source's intrinsic dimensions.
  surfaceButter: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-butter-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  surfaceGothic: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-gothic-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  surfaceY2k: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-y2k-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  surfaceStone: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-stone-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  surfaceNeutral: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-neutral-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  surfaceMatcha: {
    backgroundColor: 'transparent',
    backgroundImage: `url(/images/theme-matcha-picker.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  // Per-theme wordmark color override. Most image-backed cards use
  // --color-accent for the wordmark so the brand signature reads
  // as the dominant text element on top of the photo backdrop
  // (the default --color-text-primary often disappears into a
  // busy image, whereas the theme's accent provides natural
  // contrast against the rest of the brand-colored artwork).
  // The token resolves inside each card's own <Theme> wrapper,
  // so each card picks up its theme's accent — Butter's brand
  // blue, Gothic's accent, etc.
  labelAccent: {
    color: 'var(--color-accent)',
  },
  // Theme name on top of the gradient — rendered in the theme's
  // heading font so the wordmark previews the brand at a glance.
  // Color uses --color-text-primary so it reads against the soft
  // gradient backdrop in both light and dark themes.
  //
  // Fixed fontSize (24px desktop / 20px narrow) overrides each theme's own
  // heading type-scale so the picker reads at a uniform size across all 6 cards.
  // Without this, themes with larger heading defaults (e.g. Gothic's
  // Manufacturing Consent display family) render noticeably bigger
  // than themes with smaller defaults. Wide-glyph cursive fonts
  // (e.g. Matcha's script) still render visually wider than sans-
  // serif fonts at the same nominal size — that's a function of
  // the font's character widths, not the size — so we add ellipsis
  // truncation as a defensive measure for the longest wordmarks.
  //
  // position:relative + zIndex:1 keeps the wordmark sitting cleanly
  // on top of the multi-gradient stack underneath.
  themeCardLabel: {
    // Don't pin fontFamily — let each theme's type:display-3
    // component override drive the typography. That way Butter
    // renders in Sarina (cursive), Gothic in Manufacturing Consent
    // (distressed display), and themes without a display family
    // override fall back to their heading font (Outfit, system,
    // etc.). The Text below uses type="display-3" so the
    // .astryx-text[data-type="display-3"] selector in each theme's @scope'd CSS
    // applies the right family per card.
    fontSize: 24,
    lineHeight: 1.2,
    color: 'var(--color-text-primary)',
    maxWidth: '100%',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    position: 'relative' as const,
    zIndex: 1,
  },
  mobileThemeCardLabel: {
    fontSize: 20,
  },

  // Showcase card — clips the theme-showcase template's own
  // backgrounds (top nav, sections) to the card's rounded corners.
  // The card's default variant supplies the border + radius; the
  // template paints its own themed body background inside.
  showcaseCard: {
    overflow: 'hidden',
  },
});

// Per-theme override registry for the picker cards. Themes without
// an entry here render with the default radial-gradient backdrop
// + default --color-text-primary wordmark. Themes WITH an entry
// can swap the card's `surface` (background image) and the `label`
// color (most use labelAccent so the wordmark reads as a brand
// signature on top of the photo). Adding artwork for a new theme
// is a two-step addition: add a theme-<slug>-picker.png banner under
// /public/images + add a `surface<Name>` rule into the
// styles block above, then reference both here.
const PICKER_OVERRIDES: Record<
  string,
  {surface: StyleXStyles; label?: StyleXStyles}
> = {
  '@astryxdesign/theme-butter': {
    surface: styles.surfaceButter,
    label: styles.labelAccent,
  },
  '@astryxdesign/theme-gothic': {
    surface: styles.surfaceGothic,
    label: styles.labelAccent,
  },
  '@astryxdesign/theme-y2k': {
    surface: styles.surfaceY2k,
    label: styles.labelAccent,
  },
  '@astryxdesign/theme-stone': {
    surface: styles.surfaceStone,
    label: styles.labelAccent,
  },
  '@astryxdesign/theme-neutral': {
    surface: styles.surfaceNeutral,
    label: styles.labelAccent,
  },
  '@astryxdesign/theme-matcha': {
    surface: styles.surfaceMatcha,
    label: styles.labelAccent,
  },
};

interface ThemeActionsProps {
  selectedPkgName: string;
  /** Playground deep link for the selected theme + showcase source. */
  customizeHref: string;
}

// Shared action cluster for the desktop sidebar and the mobile context
// block. The primary action ("Use this theme") opens a popover with the
// CLI command that copies the theme into the consumer's project; "Try in
// Playground" is secondary. The preview mode toggle lives beside the page
// title (ThemeHeading), not here.
function ThemeActions({selectedPkgName, customizeHref}: ThemeActionsProps) {
  const slug = packageNameToSlug(selectedPkgName);
  const command = themeScaffoldCommand(slug);
  // Capitalize the slug for the popover copy — some theme packages have no
  // registered displayName, so the slug is lowercase (e.g. "matcha").
  const displayName = slug.charAt(0).toUpperCase() + slug.slice(1);

  return (
    <ThemeExplorerActions>
      <Popover
        width={300}
        label="Use this theme"
        content={
          <VStack gap={2}>
            <Text type="body">
              Run this in a terminal in your project to add {displayName} as a
              theme file you can edit.
            </Text>
            <CodeBlock
              code={command}
              language="bash"
              size="sm"
              container="section"
              width="100%"
              isWrapped
              hasLanguageLabel={false}
              xstyle={styles.commandBlock}
              onCopy={() => {
                trackCopy({
                  page: 'themes',
                  target: 'cli_command',
                  item: selectedPkgName,
                });
              }}
            />
          </VStack>
        }>
        {/* Render-prop trigger: no inline-flex anchor wrapper, so the
            Button fills the column width as a direct flex child. */}
        {triggerProps => (
          <Button
            {...triggerProps}
            variant="primary"
            size="lg"
            label="Use this theme"
            xstyle={styles.actionButton}
          />
        )}
      </Popover>

      <Button
        variant="secondary"
        size="lg"
        label="Try in Playground"
        href={customizeHref}
        xstyle={styles.actionButton}
        onClick={() => {
          trackOpenPlayground({
            page: 'themes',
            item: selectedPkgName,
            source: 'theme-showcase',
          });
        }}
      />
    </ThemeExplorerActions>
  );
}

interface ThemePackagePageProps {
  /** Full npm package name — seeds the initial selected theme. */
  packageName: string;
  theme: DefinedTheme;
}

export function ThemePackagePage({packageName, theme}: ThemePackagePageProps) {
  // Preview color mode. `siteMode` is the docsite's already-resolved concrete
  // light/dark — the provider maps its default `system` to the OS preference
  // (falling back to light on the first paint), so the preview never sees
  // `system`. `localMode` is null until the user toggles the preview's own
  // control; the effective mode falls through to `siteMode` until then, so
  // opening /themes in dark mode shows the demos in dark mode without an effect.
  const {mode: siteMode} = useThemeMode();
  const [localMode, setLocalMode] = useState<'light' | 'dark' | null>(null);
  const mode: 'light' | 'dark' = localMode ?? siteMode;

  const handleToggleMode = useCallback(() => {
    setLocalMode(mode === 'light' ? 'dark' : 'light');
  }, [mode]);
  // Selected theme — seeded once from the parent's `packageName`
  // prop (the /themes page resolves it from the `?theme=<slug>`
  // query param, or Neutral if absent), then user-mutable via the
  // sidebar / mobile dropdown. State is locally owned; the URL is
  // an OUTPUT that we update imperatively in `handleSelectPkg`
  // below — we intentionally do NOT subscribe to `useSearchParams`
  // here, since that would create a feedback loop (URL change →
  // state sync → URL change → ...).
  const [selectedPkgName, setSelectedPkgName] = useState<string>(packageName);
  const router = useRouter();
  const pathname = usePathname();

  // Ref for the mobile theme carousel — observed by IntersectionObserver
  // to toggle the floating toolbar visibility.
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showMobileBar, setShowMobileBar] = useState(false);

  // Show the floating toolbar when the carousel scrolls out of view.
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowMobileBar(!entry.isIntersecting);
      },
      {threshold: 0},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sync the URL with the active picker selection so it can be
  // copied, bookmarked, reloaded, or shared. The default theme
  // (DEFAULT_THEME_PACKAGE) renders as the bare `/themes` URL —
  // the seed the server uses when no query param is present — and
  // every other theme renders as `/themes?theme=<slug>`. Matches
  // the canonical URL the deep-link redirect at /themes/[name]
  // sends users to, so internal links, share URLs, and the
  // picker-driven URL all agree.
  //
  // `replace` (not `push`): theme selection reads as a filter on
  // the explorer, not a navigation step. Rapid clicks shouldn't
  // pollute the back stack — one Back press should exit the
  // explorer entirely (matching how Vercel / Linear / Sentry
  // handle in-page filters), not rewind through every preview
  // the user skimmed.
  //
  // `scroll: false`: the sidebar is sticky and the right pane is
  // tall, so we don't want a picker click to yank the user back
  // to the top of the page.
  const handleSelectPkg = useCallback(
    (nextPkgName: string) => {
      setSelectedPkgName(nextPkgName);
      const url =
        nextPkgName === DEFAULT_THEME_PACKAGE
          ? pathname
          : `${pathname}?theme=${encodeURIComponent(packageNameToSlug(nextPkgName))}`;
      router.replace(url, {scroll: false});
    },
    [router, pathname],
  );

  // Sorted list of all theme packages — feeds the sidebar list and
  // the mobile dropdown. Order matches the /themes overview gallery.
  const themePackages = useMemo(() => {
    return packages
      .filter(p => p.name.startsWith('@astryxdesign/theme-'))
      .sort((a, b) => {
        const ai = THEME_ORDER.indexOf(a.name);
        const bi = THEME_ORDER.indexOf(b.name);
        if (ai === -1 && bi === -1) {
          return a.name.localeCompare(b.name);
        }
        if (ai === -1) {
          return 1;
        }
        if (bi === -1) {
          return -1;
        }
        return ai - bi;
      });
  }, []);

  // Resolve the currently-selected theme object. Falls back to the
  // SSR-seeded prop if the lookup ever misses (shouldn't happen —
  // the selector only offers options sourced from the same packages
  // list — but the guard keeps the page from crashing if the
  // registry drifts).
  const selectedTheme = themeObjects[selectedPkgName] ?? theme;

  // Mobile dropdown options — mirror the sidebar list. Value is the
  // full @astryxdesign/theme-<slug> package name (matches state), label is
  // the friendly brand wordmark ("Neutral", "Butter").
  const switcherOptions = useMemo(
    () =>
      themePackages.map(p => ({
        value: p.name,
        label: themeLabel(p.displayName) || p.displayName,
      })),
    [themePackages],
  );

  // Mode toggle + analytics — used by the toggle beside the title
  // (ThemeHeading). The bare floating toolbar uses the untracked
  // handleToggleMode above.
  const handleToggleModeTracked = useCallback(() => {
    const next = mode === 'light' ? 'dark' : 'light';
    trackToggle({
      page: 'themes',
      target: 'mode',
      item: selectedPkgName,
      value: next,
    });
    setLocalMode(next);
  }, [mode, selectedPkgName]);

  // Shared action cluster reused by both the sidebar (vertical
  // stack) and the mobile bar (inline row). Hoisted so the two
  // placements stay byte-identical — adding a button updates both.
  const modeToggleLabel =
    mode === 'light'
      ? 'Switch preview to dark mode'
      : 'Switch preview to light mode';
  const modeToggleIcon =
    mode === 'light' ? <Moon size={16} /> : <Sun size={16} />;

  // Open in Playground destination: the main /playground seeded with
  // the theme-showcase template in the code editor (#code) and the
  // selected theme in the theme editor (?theme=<slug>). Navigation goes
  // through the framework — Button's href renders the docsite's Next
  // <Link> (via LinkProvider), so this is a soft, client-side
  // transition rather than a full-page reload. The playground reads the
  // seeded code from window.location.hash in a mount effect (the
  // App-Router-safe way to read a fragment — useSearchParams only sees
  // the query string), which runs after the navigation has committed the
  // new URL, so the hash is reliably present when it's read.
  const customizeHref = buildPlaygroundHref(
    THEME_SHOWCASE_SOURCE,
    packageNameToSlug(selectedPkgName),
  );

  return (
    <ThemeExplorerLayout>
      {/* Sidebar — sticky on desktop, hidden on narrow viewports
          (the mobile bar in the right column takes over). Holds:
          hero block (heading + description + Open in Playground CTA + mode
          toggle), divider, and the theme picker (one card per
          theme). */}
      <ThemeExplorerSidebar>
        <ThemeExplorerSidebarSurface>
          <ThemeExplorerSidebarContent
            heading={
              <ThemeHeading
                mode={mode}
                onToggleMode={handleToggleModeTracked}
              />
            }
            actions={
              <ThemeActions
                selectedPkgName={selectedPkgName}
                customizeHref={customizeHref}
              />
            }
            themes={
              <>
                {themePackages.map(pkg => {
                  const cardTheme = themeObjects[pkg.name];
                  const isActive = pkg.name === selectedPkgName;
                  const label = themeLabel(pkg.displayName) || pkg.displayName;
                  const override = PICKER_OVERRIDES[pkg.name];
                  return (
                    <SelectableCard
                      key={pkg.name}
                      label={`Preview ${label} theme`}
                      isSelected={isActive}
                      onChange={() => handleSelectPkg(pkg.name)}
                      padding={0}
                      variant="transparent"
                      xstyle={styles.themeCard}>
                      {cardTheme ? (
                        <Theme theme={cardTheme} mode="light">
                          <div
                            {...stylex.props(
                              styles.themedSurface,
                              override?.surface ?? false,
                            )}>
                            <Text
                              type="display-3"
                              weight="bold"
                              xstyle={[
                                styles.themeCardLabel,
                                override?.label ?? false,
                              ]}>
                              {label}
                            </Text>
                          </div>
                        </Theme>
                      ) : (
                        <div {...stylex.props(styles.themedSurface)}>
                          <Text
                            type="display-3"
                            weight="bold"
                            xstyle={styles.themeCardLabel}>
                            {label}
                          </Text>
                        </div>
                      )}
                    </SelectableCard>
                  );
                })}
              </>
            }
          />
        </ThemeExplorerSidebarSurface>
      </ThemeExplorerSidebar>

      {/* Right column — themed preview + card showcase. The mobile
          bar lives at the top of this column and takes over for the
          hidden sidebar at narrow viewports. */}
      <ThemeExplorerRightColumn>
        {/* Mobile floating toolbar — hidden until the carousel scrolls
            out of view, then animates in from below. Contains the theme
            selector dropdown + mode toggle so users always have access
            to theme switching as they scroll the long preview. */}
        <ThemeExplorerMobileBar
          isVisible={showMobileBar}
          selector={
            <Selector
              label="Theme"
              isLabelHidden
              size="sm"
              placement="above"
              options={switcherOptions}
              value={selectedPkgName}
              onChange={handleSelectPkg}
            />
          }
          modeToggle={
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              label={modeToggleLabel}
              tooltip={modeToggleLabel}
              icon={modeToggleIcon}
              onClick={handleToggleMode}
            />
          }
        />

        {/* Mobile context heading — visible only at narrow viewports.
            Mirrors the sidebar's hero: heading, description, and
            action buttons (Open in Playground + mode toggle). */}
        <ThemeExplorerMobileContext>
          <ThemeHeading
            align="center"
            isMobile
            mode={mode}
            onToggleMode={handleToggleModeTracked}
          />
          <ThemeActions
            selectedPkgName={selectedPkgName}
            customizeHref={customizeHref}
          />
        </ThemeExplorerMobileContext>

        {/* Mobile theme carousel — horizontal row of theme cards.
            When this scrolls out of view, the floating toolbar appears.
            Carousel owns scroll behavior and snap affordances. */}
        <ThemeExplorerMobileCarousel>
          {mobileCarouselStyle => (
            <Carousel
              ref={carouselRef}
              gap={3}
              hasButtons={false}
              hasSnap
              aria-label="Themes"
              xstyle={mobileCarouselStyle}>
              {themePackages.map(pkg => {
                const cardTheme = themeObjects[pkg.name];
                const isActive = pkg.name === selectedPkgName;
                const label = themeLabel(pkg.displayName) || pkg.displayName;
                const override = PICKER_OVERRIDES[pkg.name];
                return (
                  <ThemeExplorerMobileCarouselItem key={pkg.name}>
                    <SelectableCard
                      label={`Preview ${label} theme`}
                      isSelected={isActive}
                      onChange={() => handleSelectPkg(pkg.name)}
                      padding={0}
                      variant="transparent">
                      {cardTheme ? (
                        <Theme theme={cardTheme} mode="light">
                          <div
                            {...stylex.props(
                              styles.themedSurface,
                              override?.surface ?? false,
                            )}>
                            <Text
                              type="display-3"
                              weight="bold"
                              xstyle={[
                                styles.themeCardLabel,
                                styles.mobileThemeCardLabel,
                                override?.label ?? false,
                              ]}>
                              {label}
                            </Text>
                          </div>
                        </Theme>
                      ) : (
                        <div {...stylex.props(styles.themedSurface)}>
                          <Text
                            type="display-3"
                            weight="bold"
                            xstyle={[
                              styles.themeCardLabel,
                              styles.mobileThemeCardLabel,
                            ]}>
                            {label}
                          </Text>
                        </div>
                      )}
                    </SelectableCard>
                  </ThemeExplorerMobileCarouselItem>
                );
              })}
            </Carousel>
          )}
        </ThemeExplorerMobileCarousel>

        {/* Themed preview — the theme-showcase template rendered with
            the selected theme, wrapped in a bordered, rounded card so
            it reads as a contained app surface against the docsite
            chrome. overflow:hidden (showcaseCard) clips the template's
            own backgrounds (top nav, sections) to the card's radius.
            LinkProvider keeps demo href="#" clicks from scrolling the
            page to the top (see PreviewAnchor). */}
        <ThemeExplorerPreview>
          <Card padding={0} xstyle={styles.showcaseCard}>
            <Theme theme={selectedTheme} mode={mode}>
              <LinkProvider component={PreviewAnchor}>
                {/* Bespoke per-theme content (e.g. Matcha's café menu); falls
                    back to the template's neutral defaults when undefined. */}
                <ThemeShowcaseStore
                  {...getThemeShowcaseContent(
                    selectedPkgName.replace('@astryxdesign/theme-', ''),
                  )}
                />
              </LinkProvider>
            </Theme>
          </Card>
        </ThemeExplorerPreview>
      </ThemeExplorerRightColumn>
    </ThemeExplorerLayout>
  );
}
