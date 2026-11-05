// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input libraryCompat.ts and the generated audit
 * @output The three blockers between Astryx and motion.dev, in order
 * @position /motion/library
 *
 * The recommendation is to stay CSS-first and become explicitly compatible.
 * Nothing on this page argues for taking the dependency; it argues about what
 * a consumer who takes it themselves runs into, which is a different and much
 * cheaper list than the brief assumed.
 */

import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Link as AstryxLink} from '@astryxdesign/core/Link';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {
  AUDIT_COUNTS,
  TRANSFORM_TRANSITIONS,
} from '../__generated__/motionAudit';
import {ComparePanes, DemoBody, DemoCard} from '../LabPrimitives';
import {PressRig} from '../LabDemos';
import {LabPage} from '../PageFrame';
import {
  ALREADY_RIGHT,
  BLOCKERS,
  CHEAP_WINS,
  MOTION_BUNDLE_KB,
  buttonFindings,
} from '../libraryCompat';

function Detail({label, children}: {label: string; children: string}) {
  return (
    <VStack gap={1}>
      <Text type="label" weight="semibold">
        {label}
      </Text>
      <Text color="secondary">{children}</Text>
    </VStack>
  );
}

export default function MotionLibraryPage() {
  const button = buttonFindings();
  const transformComponents = new Set(
    TRANSFORM_TRANSITIONS.map(site => site.component),
  );

  return (
    <LabPage
      title="Motion library compatibility"
      intro="What a team that installs motion.dev runs into today, and the smallest set of changes that makes Astryx compose with it. Three blockers, in the order they bite."
      badges={<Badge variant="info" label="CSS-first" />}
      decides="The three blockers, and whether Button keeps its press transition.">
      <Banner
        status="info"
        title="Stay CSS-first and become explicitly compatible"
        description={
          <Text>
            {`Astryx should not ship Motion: ~${MOTION_BUNDLE_KB}KB and a runtime on every consumer, to fix nothing the CSS path is failing at. But a consumer who installs it themselves should find that Astryx composes cleanly, and today three things stop that. Two of the three are already on the roadmap under other names.`}
          </Text>
        }
      />

      {BLOCKERS.map((blocker, index) => (
        <DemoCard
          key={blocker.id}
          title={`${index + 1}. ${blocker.title}`}
          question={blocker.symptom}
          badges={<Badge variant="error" label={blocker.severity} />}>
          {blocker.id === 'transform-transitions' ? (
            <VStack gap={0}>
              <ComparePanes
                panes={[
                  {
                    tone: 'before',
                    label: 'transition: transform — today',
                    content: <PressRig technique="transform" />,
                  },
                  {
                    tone: 'neutral',
                    label: 'transition: scale — the middle path',
                    content: <PressRig technique="scale" />,
                  },
                  {
                    tone: 'after',
                    label: 'no transition — what the brief proposes',
                    content: <PressRig technique="none" />,
                  },
                ]}
              />
              <DemoBody>
                <Detail label="Cause">{blocker.cause}</Detail>
                <Detail label="Fix">{blocker.fix}</Detail>
                <Banner
                  status="warning"
                  title={`Measured: ${AUDIT_COUNTS.transformTransitions} sites across ${AUDIT_COUNTS.transformTransitionComponents} components — the brief's "20+" was right`}
                  description={
                    <Text>
                      {button.transformSites.length > 0
                        ? `Button is in the list, at ${button.transformSites
                            .map(site => `${site.file}:${site.line}`)
                            .join(
                              ', ',
                            )}: it declares transform in its transition property list and takes scale(0.98) on :active. The brief calls it the worst case because it is the most-wrapped component, and the measurement agrees. Two earlier versions of the audit script reported far fewer sites and no Button at all — a wrapped value and a nested StyleX rule each hid matches. The brief was closer than the tool twice.`
                        : 'Button is absent from the measured data, which contradicts the brief. Re-check the scanner before acting on this.'}
                    </Text>
                  }
                />
                <Card padding={0}>
                  <Table density="compact">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Component</TableHeaderCell>
                        <TableHeaderCell>Site</TableHeaderCell>
                        <TableHeaderCell>Declaration</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TRANSFORM_TRANSITIONS.map(site => (
                        <TableRow key={`${site.file}:${site.line}`}>
                          <TableCell>
                            <Text weight="semibold">{site.component}</Text>
                          </TableCell>
                          <TableCell>
                            <Text type="code">{`${site.file}:${site.line}`}</Text>
                          </TableCell>
                          <TableCell>
                            <Text type="code" color="secondary">
                              {site.decl ?? '\u2014'}
                            </Text>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
                <Text type="supporting" color="secondary">
                  {`${transformComponents.size} components, and the shape of the list is chevrons and menus rather than roots: ${[...transformComponents].join(', ')}. A consumer animating a chevron is rare; a consumer animating a Button is not, which is why the brief's framing mattered and why the correction changes the priority.`}
                </Text>
                <Detail label="Cost">{blocker.cost}</Detail>
              </DemoBody>
            </VStack>
          ) : (
            <DemoBody>
              <Detail label="Cause">{blocker.cause}</Detail>
              <Detail label="Fix">{blocker.fix}</Detail>
              <Detail label="Cost">{blocker.cost}</Detail>
              {blocker.id === 'overlay-exit' && (
                <Text type="supporting" color="secondary">
                  Same mechanism as the CSS exit gap:{' '}
                  <AstryxLink href="/pages/motion-lab/exit-gap/">
                    see it fail natively
                  </AstryxLink>
                  . One fix closes both, and doing them apart means solving
                  top-layer retention twice.
                </Text>
              )}
            </DemoBody>
          )}
        </DemoCard>
      ))}

      <VStack gap={3}>
        <Heading level={2}>Cheap wins</Heading>
        <Text color="secondary">
          What moves Astryx from &ldquo;wrappable with caveats&rdquo; to
          Motion-friendly for everything except overlay exits. None of these
          needs the composition decision.
        </Text>
        <Grid columns={{minWidth: 280}} gap={3}>
          {CHEAP_WINS.map(win => (
            <Card key={win.id} padding={4}>
              <VStack gap={1.5}>
                <Text weight="semibold">{win.title}</Text>
                <Text type="supporting" color="secondary">
                  {win.detail}
                </Text>
                {win.evidence != null && <Badge label={win.evidence} />}
              </VStack>
            </Card>
          ))}
        </Grid>
        <Text type="supporting" color="secondary">
          The ref gap is the one number on this page the lab cannot check: the
          audit reads the built package&rsquo;s styles, not its prop types, so
          the brief&rsquo;s &ldquo;eight overlay components&rdquo; is unverified
          here.
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>What already works</Heading>
        <Text color="secondary">
          Astryx is structurally better placed for this than most CSS-first
          systems, and the part that usually needs a rewrite is the part that is
          already right.
        </Text>
        <Grid columns={{minWidth: 260}} gap={3}>
          {ALREADY_RIGHT.map(item => (
            <Card key={item.title} padding={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Badge variant="success" label="ok" />
                  <Text weight="semibold">{item.title}</Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  {item.detail}
                </Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      </VStack>
    </LabPage>
  );
}
