// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The generated audit, the published guidance, the lab store
 * @output Degrade or delete, with the sweep's worklist attached
 * @position /motion/reduced-motion
 *
 * The page's primary control is the rail's Reduced motion switch, not anything
 * rendered here. It drives the real policy for every demo in the lab, so the
 * argument is made by flipping it and watching rather than by reading a
 * caption about what would happen.
 */

import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Grid} from '@astryxdesign/core/Grid';
import {Link} from '@astryxdesign/core/Link';
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
import {LabPage} from '../PageFrame';
import {ComparePanes, DemoBody, DemoCard} from '../LabPrimitives';
import {LoopRig, TintRig} from '../LabDemos';
import {useMotionLab, type ReducedMotionMode} from '../MotionLabStore';
import {
  AUDIT_COUNTS,
  HARDCODED_SITES,
  NO_REDUCED_MOTION,
} from '../__generated__/motionAudit';
import {GUIDANCE_CONFLICTS, PUBLISHED_PAGE_URL} from '../publishedGuidance';

const sx = stylex.create({
  full: {width: '100%'},
  mono: {fontFamily: 'var(--font-family-code)', fontSize: '12px'},
  quote: {
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border)',
    paddingInlineStart: '12px',
    maxWidth: '64ch',
  },
});

const BRIEF_FIGURE = 39;

const MODE_LABEL: Readonly<Record<ReducedMotionMode, string>> = {
  off: 'Off',
  degrade: 'Degrade',
  delete: 'Delete',
};

/** The sweep's worklist: every animated file with no reduced-motion branch. */
const WORKLIST = [
  ...NO_REDUCED_MOTION.reduce((acc, row) => {
    const files = acc.get(row.component) ?? [];
    files.push(row.file);
    acc.set(row.component, files);
    return acc;
  }, new Map<string, string[]>()),
].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const INSTANT_ESCAPES = HARDCODED_SITES.filter(site => site.value === '0.01s');

const POLICIES: ReadonlyArray<{
  readonly policy: string;
  readonly survives: string;
  readonly forIt: string;
  readonly againstIt: string;
  readonly status: string;
}> = [
  {
    policy: 'Delete',
    survives:
      'Nothing. Transitions collapse to zero, loops stop, the end state arrives on the same frame as the change.',
    forIt:
      'Safest reading of the accessibility guidance: a user who asked for no motion gets no motion, with no argument about which motion was the harmful kind. Trivially lintable, and it is one line per file.',
    againstIt:
      'Deletes feedback that happens to be implemented as a transition. A hover tint, a focus ring fade and a spinner all disappear together, and the spinner leaves nothing behind that says "working".',
    status:
      'What the published page instructs today, and what most of core does.',
  },
  {
    policy: 'Degrade',
    survives:
      'Opacity and colour. Movement multipliers go to zero; loops stop and are replaced with a determinate state.',
    forIt:
      'Keeps state feedback while removing the vestibular trigger, which is what both of the project\u2019s references recommend. The thing that hurts is movement, not the fact that a colour took 175ms to arrive.',
    againstIt:
      'Needs a judgement per component about which half is movement, so it is not a one-line sweep. Gets it wrong quietly: a fade that survives on a surface that also travels is still motion.',
    status:
      'What rubric criterion 10 proposes. A change of published policy, not a bug fix.',
  },
];

const CSS_RULE = `/* Movement is a multiplier, so the policy has one place to land. */
.surface {
  --motion-translate: 1;
  --motion-scale: 1;
  transform: translateY(calc(8px * var(--motion-translate)))
             scale(calc(1 - 0.06 * var(--motion-scale)));
  transition:
    transform var(--duration-enter) var(--ease-entry),
    opacity var(--duration-enter) var(--ease-entry),
    background-color var(--duration-state) var(--ease-state);
}

/* Degrade: movement goes, opacity and colour stay. Not display: none for
   motion — the feedback is the point, the travel is the problem. */
@media (prefers-reduced-motion: reduce) {
  .surface {
    --motion-translate: 0;
    --motion-scale: 0;
  }

  /* Loops stop. They do not slow down: slower vestibular motion is still
     vestibular motion, and a 3s spinner reads as a hung interface. */
  .spinner,
  .progressIndeterminate {
    animation: none;
  }
}

/* Hover motion is gated on a fine pointer as well. A touch device fires a
   hover on tap, so an un-gated hover animation runs on every tap. */
@media (hover: hover) and (pointer: fine) {
  .row:hover {
    transform: translateY(calc(-1px * var(--motion-translate)));
  }
}

/* An app with its own reduce-motion setting can flip a JS library but cannot
   flip a media query, so the same rules answer to an attribute too. */
[data-reduced-motion='reduce'] .surface {
  --motion-translate: 0;
  --motion-scale: 0;
}`;

const HOOK = `/**
 * The JS half of the same policy. Charts, canvas and any motion library read
 * this; CSS reads the media query. They have to agree, or a chart animates
 * while the interface around it does not.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // The app-level override, so a product setting can force the policy on
  // without touching the OS. Same attribute the CSS above answers to.
  const forced = useContext(MotionPreferenceContext);
  return forced ?? reduced;
}`;

export default function ReducedMotionPage() {
  const {reducedMotion} = useMotionLab();
  const conflict = GUIDANCE_CONFLICTS.find(
    c => c.id === 'reduced-motion-delete',
  );

  return (
    <LabPage
      title="Reduced motion"
      intro="Degrade or delete. Everything else in the sweep is blocked on this answer, because the branch gets written once per file and there are 36 of them."
      badges={
        <>
          <Badge variant="error" label="Criterion 10 — Blocker" />
          <Badge
            variant="warning"
            label={`Rail: ${MODE_LABEL[reducedMotion]}`}
          />
        </>
      }
      decides="Degrade or delete. The decision the 36-file sweep is waiting on.">
      <Banner
        status="info"
        title="Use the Reduced motion switch in the rail above"
        description={
          <Text>
            It is the page&rsquo;s primary control, not a caption: it drives the
            real policy for every demo in the lab, on this page and every other
            one. Set it to <strong>Delete</strong>, then{' '}
            <strong>Degrade</strong>, and watch the same components under each.
            Right now it is set to <strong>{MODE_LABEL[reducedMotion]}</strong>.
          </Text>
        }
      />

      <VStack gap={3}>
        <Heading level={2}>The sweep&rsquo;s worklist</Heading>
        <Text color="secondary">
          {AUDIT_COUNTS.filesWithoutReducedMotion} of{' '}
          {AUDIT_COUNTS.animatedFiles} animated files have no{' '}
          <code>prefers-reduced-motion</code> branch at all — measured against
          the installed package. The brief says {BRIEF_FIGURE}; the gap is
          counting method rather than a disagreement worth chasing, but the list
          below is the one to work from because it names the files.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Component</TableHeaderCell>
                <TableHeaderCell>Files</TableHeaderCell>
                <TableHeaderCell>Paths</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WORKLIST.map(([component, files]) => (
                <TableRow key={component}>
                  <TableCell>
                    <Text weight="semibold">{component}</Text>
                  </TableCell>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {files.length}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {files.join('  ·  ')}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Text type="supporting" color="secondary">
          {WORKLIST[0]?.[0]} carries {WORKLIST[0]?.[1].length} of them and{' '}
          {WORKLIST[1]?.[0]} {WORKLIST[1]?.[1].length}, so two components are
          more than a quarter of the sweep. Both are also the components where a
          wrong answer is most visible.
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Degrade or delete</Heading>
        <Card padding={0}>
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Policy</TableHeaderCell>
                <TableHeaderCell>What survives</TableHeaderCell>
                <TableHeaderCell>For</TableHeaderCell>
                <TableHeaderCell>Against</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {POLICIES.map(row => (
                <TableRow key={row.policy}>
                  <TableCell>
                    <VStack gap={1}>
                      <Text weight="semibold">{row.policy}</Text>
                      <Text type="supporting" color="secondary">
                        {row.status}
                      </Text>
                    </VStack>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting">{row.survives}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.forIt}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {row.againstIt}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {conflict != null && (
          <Card padding={4}>
            <VStack gap={2}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Text weight="semibold">
                  This is a change of published policy, not a bug fix
                </Text>
                <Badge variant="error" label="Reversal" />
              </HStack>
              <VStack gap={1} {...stylex.props(sx.quote)}>
                <Text type="supporting" color="secondary">
                  &ldquo;{conflict.published}&rdquo; — {conflict.section},
                  published today
                </Text>
              </VStack>
              <Text type="supporting">{conflict.reading}</Text>
              <Text type="supporting" color="secondary">
                {conflict.resolution}
              </Text>
              <Text type="supporting" color="secondary">
                <Link href="/pages/motion-lab/published/">
                  The conflicts, side by side
                </Link>{' '}
                ·{' '}
                <Link
                  href={PUBLISHED_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer">
                  the published page
                </Link>
              </Text>
            </VStack>
          </Card>
        )}
      </VStack>

      <DemoCard
        title="The three policies, running"
        question="A spinner, a pulse and an indeterminate bar under each answer. Which of these still tells you the system is working?">
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Today — loops slow to 3s',
              content: <LoopRig policy="today" />,
            },
            {
              tone: 'neutral',
              label: 'Delete — the published answer',
              content: <LoopRig policy="delete" />,
            },
            {
              tone: 'after',
              label: 'Degrade — the proposed answer',
              content: <LoopRig policy="degrade" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting" color="secondary">
            Slowing a loop is the one answer nobody is arguing for and the one
            the code does today. Between the other two, the question is not
            whether the spinner keeps spinning — it does not, either way — but
            whether anything replaces it.
          </Text>
        </DemoBody>
      </DemoCard>

      <DemoCard
        title="Hover the rows, then flip the rail"
        question="The tint is state feedback that happens to be implemented as a transition. Does the policy take the feedback or only the fade?">
        <ComparePanes
          panes={[
            {
              tone: 'before',
              label: 'Hardcoded 150ms',
              content: <TintRig mode="before" />,
            },
            {
              tone: 'after',
              label: 'Tokenised --duration-state',
              content: <TintRig mode="after" />,
            },
            {
              tone: 'neutral',
              label: 'No transition',
              content: <TintRig mode="none" />,
            },
          ]}
        />
        <DemoBody>
          <Text type="supporting">
            Set the rail to <strong>Degrade</strong> and hover: movement stops
            across the lab and the tokenised rows keep their fade. Colour is not
            movement, and this tint is exactly the feedback degrade exists to
            preserve — which is why delete is defensible on a hover tint and
            indefensible on a spinner, where the motion <em>is</em> the message.
          </Text>
          <Text type="supporting" color="secondary">
            The left pane makes the token argument at the same time: it
            hardcodes 150ms, so it fades identically under every policy. A
            literal cannot be reached by a switch, a media query or a sweep.
          </Text>
          <Text type="supporting" color="secondary">
            <strong>Try it: </strong>on <strong>Degrade</strong> the tokenised
            pane keeps its tint and loses only movement — the state feedback
            survives. On <strong>Delete</strong> the tint snaps, and the
            affordance goes with it. That is the whole decision, in one hover.
            (This behaviour was itself a bug in the lab until the policy was
            moved out of the stylesheet: the store writes the duration aliases
            inline, and an inline custom property outranks any selector, so the
            delete rule looked right and did nothing.) With the device set to
            reduce motion, the tokenised pane changes at once on every rail
            setting (design:reduced-motion DR3); turn that setting off to see
            the rail&apos;s policies on it.
          </Text>
        </DemoBody>
      </DemoCard>

      <VStack gap={3}>
        <Heading level={2}>
          The <code>0.01s</code> finding
        </Heading>
        <Text color="secondary">
          {INSTANT_ESCAPES.length} of the {AUDIT_COUNTS.hardcodedTotal}{' '}
          hardcoded values are <code>0.01s</code>, and every one is a
          reduced-motion escape in BottomSheet, DateInput or MobileNav. This is
          load-bearing, not sloppiness: a zero duration fires no{' '}
          <code>transitionend</code>, so anything sequencing off that event — an
          unmount, a focus return, a scroll lock release — never runs. The idiom
          is a component author working around the platform.
        </Text>
        <Card padding={0}>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Component</TableHeaderCell>
                <TableHeaderCell>Property</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INSTANT_ESCAPES.map(site => (
                <TableRow key={`${site.file}:${site.line}`}>
                  <TableCell>
                    <Text
                      {...stylex.props(
                        sx.mono,
                      )}>{`${site.file}:${site.line}`}</Text>
                  </TableCell>
                  <TableCell>
                    <Text type="supporting" color="secondary">
                      {site.component}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text {...stylex.props(sx.mono)} color="secondary">
                      {site.prop}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Grid columns={{minWidth: 300}} gap={3}>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">
                <code>--duration-instant</code> cannot be assumed to be 0
              </Text>
              <Text type="supporting" color="secondary">
                Ship it as <code>0.01ms</code> and every existing sequencing
                path keeps working, at a cost no user can perceive. Ship it as{' '}
                <code>0</code> and these ten sites have to be rewritten to await
                something else in the same change — which is a different, larger
                piece of work than the sweep is scoped for.
              </Text>
            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={1.5}>
              <Text weight="semibold">
                Decide it before the sweep, not during
              </Text>
              <Text type="supporting" color="secondary">
                The sweep rewrites these ten lines whichever way the token goes.
                Deciding halfway through means two idioms in the codebase and a
                lint rule that cannot tell which one it is looking at.
              </Text>
            </VStack>
          </Card>
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>The rule, as code</Heading>
        <Text color="secondary">
          What a component author copies. Movement is a multiplier so the policy
          lands in one place; loops stop rather than slow; hover motion is gated
          on a fine pointer because touch fires a hover on tap; and the
          attribute branch exists because an app with its own reduce-motion
          setting can flip a JS library but cannot flip a media query.
        </Text>
        <CodeBlock
          language="css"
          title="The degrade branch"
          code={CSS_RULE}
          hasCopyButton
          maxHeight={420}
        />
        <CodeBlock
          language="tsx"
          title="useReducedMotion() — the JS half of the same policy"
          code={HOOK}
          hasCopyButton
          maxHeight={420}
        />
        <Text type="supporting" color="secondary">
          Both halves ship together or the system disagrees with itself: a chart
          that animates while the interface around it has stopped is worse than
          either policy applied consistently.
        </Text>
      </VStack>
    </LabPage>
  );
}
