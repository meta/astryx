// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Divider} from '@astryxdesign/core/Divider';
import {Section} from '@astryxdesign/core/Section';
import {DocsVersionFooterLink} from './DocsVersionFooterLink';
import {
  GITHUB_REPO,
  DISCORD_URL,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  THREADS_URL,
  X_URL,
} from '../constants';
import {
  AstryxLogo,
  GitHubLogo,
  ThreadsLogo,
  XLogo,
  InstagramLogo,
  FacebookLogo,
  MetaOpenSourceLogo,
  DiscordLogo,
} from './logos';

const MOBILE = '@media (max-width: 768px)';

const styles = stylex.create({
  siteFooter: {
    // Match the section rhythm above (responsive); fall back off the home page.
    paddingTop:
      'var(--astryx-marketing-section-gap, calc(var(--spacing-12) * 2))',
  },
  astryxLogo: {
    height: 18,
    width: 'auto',
    display: 'block',
    color: 'var(--color-icon-secondary)',
  },
  socialIcon: {
    width: 16,
    height: 16,
    display: 'block',
  },
  metaOpenSourceLogo: {
    height: 14,
    width: 'auto',
    display: 'block',
    color: 'var(--color-icon-secondary)',
  },
  // Keeps the wrapped link list to a readable measure once it stacks; on
  // desktop the links sit in their own grid column and must not be clamped.
  mobileFooterLinks: {
    maxWidth: {default: 'none', [MOBILE]: 320},
  },
  // The footer is one markup at every width — the layout swaps in CSS, not in
  // JS. It used to branch on `useAppShellMobile().isMobile`, which is a
  // `useMediaQuery` whose server snapshot is always `false`: the prerendered
  // HTML therefore carried the DESKTOP grid at every width, so on a phone the
  // wordmark, the link list and the social buttons all painted on top of each
  // other in ~80px columns until hydration replaced them. A media query has
  // the right answer on the very first paint.
  //
  // Every override below RESTATES its desktop value in `default` rather than
  // leaving it `null`. `xstyle` merges after the component's own styles and a
  // `null` there *unsets* the property, so `{default: null, …}` would strip
  // VStack's gap and Grid's `display: grid` at desktop width.
  stack: {
    // VStack gap={4}
    gap: {default: 'var(--spacing-4)', [MOBILE]: 'var(--spacing-6)'},
  },
  // `grid-template-columns` (from Grid) and `grid-column` (from GridSpan) are
  // inert under `display: flex`, and `flex-direction` is inert under
  // `display: grid`, so switching `display` alone turns the row into a
  // centered column.
  row: {
    display: {default: 'grid', [MOBILE]: 'flex'},
    flexDirection: 'column',
    alignItems: 'center',
  },
  navRow: {
    gap: {default: 'normal', [MOBILE]: 'var(--spacing-6)'},
  },
  legalRow: {
    gap: {default: 'normal', [MOBILE]: 'var(--spacing-2)'},
  },
  navLinks: {
    // HStack gap={4}
    gap: {default: 'var(--spacing-4)', [MOBILE]: 'var(--spacing-3)'},
  },
  copyright: {
    // Text justify="end"
    textAlign: {default: 'end', [MOBILE]: 'center'},
  },
  social: {
    // Must stay `nowrap` on desktop: the social buttons sit in a `1fr` grid
    // track, and a track only grows past its share to fit its MIN-CONTENT — a
    // wrappable row has a one-icon min-content, so the track would stay at
    // 1/5 of the row and the icons would wrap onto a second line.
    flexWrap: {default: 'nowrap', [MOBILE]: 'wrap'},
  },
});

const FOOTER_LINKS: ReadonlyArray<{
  label: string;
  href: string;
}> = [
  {label: 'Docs', href: '/docs/getting-started'},
  {label: 'Components', href: '/components'},
  {label: 'Templates', href: '/templates'},
  {label: 'Themes', href: '/themes'},
  {label: 'Playground', href: '/playground'},
  {label: 'Storybook', href: '/storybook/'},
  {label: 'Sandbox', href: '/sandbox/'},
  {label: 'Blog', href: '/blog'},
  {label: 'Community', href: '/community'},
  {label: 'Changelog', href: '/changelog'},
];

const SOCIAL_LINKS: ReadonlyArray<{
  label: string;
  href: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}> = [
  {label: 'GitHub', href: GITHUB_REPO, Icon: GitHubLogo},
  {label: 'Discord', href: DISCORD_URL, Icon: DiscordLogo},
  {label: 'Facebook', href: FACEBOOK_URL, Icon: FacebookLogo},
  {label: 'Instagram', href: INSTAGRAM_URL, Icon: InstagramLogo},
  {label: 'Threads', href: THREADS_URL, Icon: ThreadsLogo},
  {label: 'X', href: X_URL, Icon: XLogo},
];

const LEGAL_LINKS: ReadonlyArray<{label: string; href: string}> = [
  {label: 'Terms of use', href: 'https://opensource.fb.com/legal/terms'},
  {label: 'Privacy policy', href: 'https://opensource.fb.com/legal/privacy'},
];

function NavLinks() {
  return (
    <>
      {FOOTER_LINKS.map(item => (
        <Link
          key={item.label}
          href={item.href}
          type="supporting"
          color="secondary"
          isStandalone>
          {item.label}
        </Link>
      ))}
      <DocsVersionFooterLink />
    </>
  );
}

function SocialButtons() {
  return (
    <>
      {SOCIAL_LINKS.map(social => (
        <Button
          key={social.label}
          label={social.label}
          tooltip={social.label}
          variant="secondary"
          isIconOnly
          icon={
            <social.Icon
              aria-hidden="true"
              {...stylex.props(styles.socialIcon)}
            />
          }
          href={social.href}
        />
      ))}
    </>
  );
}

function LegalLinks() {
  return (
    <>
      {LEGAL_LINKS.map(link => (
        <Link
          key={link.label}
          href={link.href}
          type="supporting"
          color="secondary"
          isStandalone
          target="_blank">
          {link.label}
        </Link>
      ))}
    </>
  );
}

export function SiteFooter({year}: {year: number}) {
  // The regex compliance check requires the year to immediately follow the
  // copyright mark — `©{year}`, no separating space. See PR description.
  const copyright = `\u00A9${year} Meta Platforms, Inc.`;

  const astryxLogo = (
    <Link href="/" label="Astryx">
      <AstryxLogo aria-hidden="true" {...stylex.props(styles.astryxLogo)} />
    </Link>
  );

  const metaOpenSourceLink = (
    <Link
      href="https://opensource.fb.com"
      label="Meta Open Source"
      target="_blank">
      <MetaOpenSourceLogo
        aria-hidden="true"
        {...stylex.props(styles.metaOpenSourceLogo)}
      />
    </Link>
  );

  return (
    <Section role="contentinfo" padding={6} xstyle={styles.siteFooter}>
      <VStack gap={4} xstyle={styles.stack}>
        <Grid columns={5} align="center" xstyle={[styles.row, styles.navRow]}>
          {astryxLogo}
          <GridSpan columns={3}>
            <HStack
              gap={4}
              wrap="wrap"
              align="center"
              hAlign="center"
              xstyle={[styles.navLinks, styles.mobileFooterLinks]}>
              <NavLinks />
            </HStack>
          </GridSpan>
          <HStack gap={2} align="center" justify="end" xstyle={styles.social}>
            <SocialButtons />
          </HStack>
        </Grid>

        <Divider />

        <Grid columns={4} align="center" xstyle={[styles.row, styles.legalRow]}>
          {metaOpenSourceLink}
          <GridSpan columns={2}>
            <HStack
              gap={4}
              wrap="wrap"
              align="center"
              hAlign="center"
              width="100%">
              <LegalLinks />
            </HStack>
          </GridSpan>
          <Text
            type="supporting"
            color="secondary"
            justify="end"
            xstyle={styles.copyright}>
            {copyright}
          </Text>
        </Grid>
      </VStack>
    </Section>
  );
}
