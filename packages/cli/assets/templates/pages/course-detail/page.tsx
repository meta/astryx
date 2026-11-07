// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  Layout,
  LayoutContent,
  Section,
  VStack,
  HStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core/Divider';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Link} from '@astryxdesign/core/Link';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Slider} from '@astryxdesign/core/Slider';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {rtlStyles} from '@astryxdesign/core/utils';
import type {CSSProperties, ReactNode} from 'react';

// Custom CSS here is limited to what Astryx components can't express today:
// - image fill + corner radius (no Image primitive — #2582)
// - the sticky enroll rail (no sticky prop on Astryx layout primitives — #2613)
const stickyRail: CSSProperties = {
  position: 'sticky',
  top: 'var(--spacing-8)',
  alignSelf: 'start',
};
const posterImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'var(--radius-container)',
};

import {
  PlayIcon,
  CheckIcon,
  StarIcon,
  ClockIcon,
  UsersIcon,
  GlobeAltIcon,
  BoltIcon,
  ArrowRightIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import {StarIcon as StarIconSolid} from '@heroicons/react/24/solid';

// ─── Data ────────────────────────────────────────────────────────────────────
const COURSE = {
  title: 'Applied AI: Build with Language Models',
  level: 'Intermediate',
  language: 'English',
  rating: 4.8,
  ratingCount: 1284,
  learnerCount: '12,840',
  lessonCount: 13,
  runtime: '4h 07m',
  price: 89,
  compareAt: 129,
  about:
    'Most courses show you what a model can do. This one makes you build the three features every product team is asked for — retrieval that answers the right question, output you can hand to other code, and an evaluation harness that catches regressions before your users do. Every module ends in something that runs; the reviewed project is a working extraction pipeline you can adapt.',
  skills: [
    'Retrieval-augmented generation',
    'Structured output',
    'Evaluation harnesses',
    'Prompt design',
    'Vector search',
  ],
};

const MODULES = [
  {
    id: 'foundations',
    title: 'Foundations and tooling',
    meta: '3 lessons · 48 min',
    lessons: [
      {
        title: 'What a language model can and cannot promise',
        duration: '12 min',
      },
      {
        title: 'The working setup: SDK, keys, and a scratchpad',
        duration: '18 min',
      },
      {title: 'Tokens, temperature, and the cost dial', duration: '18 min'},
    ],
  },
  {
    id: 'retrieval',
    title: 'Retrieval that answers the question',
    meta: '4 lessons · 76 min',
    lessons: [
      {
        title: 'Chunking strategies that survive real documents',
        duration: '21 min',
      },
      {title: 'Vector search from first principles', duration: '19 min'},
      {title: 'Rerankers and the relevance ceiling', duration: '18 min'},
      {title: 'When the model should say it found nothing', duration: '18 min'},
    ],
  },
  {
    id: 'output',
    title: 'Structured output you can hand to code',
    meta: '3 lessons · 64 min',
    lessons: [
      {title: 'Schemas as contracts, not suggestions', duration: '22 min'},
      {title: 'Validation, repair, and retry loops', duration: '21 min'},
      {title: 'Streaming partial results into a UI', duration: '21 min'},
    ],
  },
  {
    id: 'evaluation',
    title: 'The evaluation harness',
    meta: '3 lessons · 59 min',
    lessons: [
      {title: 'Golden sets and where they come from', duration: '20 min'},
      {title: 'Scoring retrieval and generation apart', duration: '19 min'},
      {title: 'Regression gates in continuous integration', duration: '20 min'},
    ],
  },
];

const INCLUDES = [
  'Lifetime access to 13 lessons and all future revisions',
  'The reviewed project: a working extraction pipeline',
  'A graded certificate of completion',
  'Offline downloads for every lesson',
];

const INSTRUCTOR = {
  name: 'Gabriela Fernández',
  role: 'Applied AI engineer, formerly search infrastructure',
  portrait: '/template-assets/DATA-Gabriela-Fernandez.png',
  learners: '12,840',
  courses: '4',
  rating: '4.9',
  bio: 'Gabriela spent nine years building retrieval systems at scale before language models landed on her desk. She has shipped the exact pipeline this course teaches — twice, in production, with the scars to prove which parts matter.',
};

const ASPECTS = [
  {label: 'Content depth', score: 4.9},
  {label: 'Practical exercises', score: 4.8},
  {label: 'Instructor clarity', score: 4.9},
  {label: 'Pacing', score: 4.6},
  {label: 'Materials and project', score: 4.7},
  {label: 'Community support', score: 4.5},
];

const REVIEWS = [
  {
    name: 'Drew Young',
    avatar: '/template-assets/DATA-Drew-Young.png',
    date: 'Reviewed 2 weeks ago',
    rating: 5,
    body: 'The evaluation module alone is worth the price. I walked in with a half-working RAG demo and walked out with a harness that caught two regressions in our first sprint after launch.',
    helpful: 41,
  },
  {
    name: 'Jihoo Song',
    avatar: '/template-assets/DATA-Jihoo-Song.png',
    date: 'Reviewed a month ago',
    rating: 5,
    body: 'Gabriela explains rerankers better than the papers do. The chunking lesson changed how our team splits documentation, and the project review was concrete, not rubber-stamp.',
    helpful: 28,
  },
  {
    name: 'Ana Thomas',
    avatar: '/template-assets/DATA-Ana-Thomas.png',
    date: 'Reviewed 2 months ago',
    rating: 4,
    body: 'Dense but fair. I wanted more on fine-tuning and got none — the course is honest about scoping to what ships. The structured-output lessons replaced three fragile regex pipelines of mine.',
    helpful: 19,
  },
  {
    name: 'Pablo Morales',
    avatar: '/template-assets/DATA-Pablo-Morales.png',
    date: 'Reviewed 3 months ago',
    rating: 5,
    body: 'I have taken four applied-AI courses this year and finished one. This is the one. Every module ends in something that runs, exactly as promised, and the finish-date picker kept me honest about pacing.',
    helpful: 33,
  },
];

const FAQS = [
  {
    q: 'Do I need production access to a language model?',
    a: 'No. Every exercise runs on a free-tier API key, and the project review accepts either the free tier or a local model. The course states where results differ between them.',
  },
  {
    q: 'How long do I have access?',
    a: 'Access is lifetime, including every future revision of the lessons. When the tooling shifts — and it will — the affected lessons are re-recorded rather than patched with errata.',
  },
  {
    q: 'What if the course is not right for me?',
    a: 'Every purchase carries a 30-day money-back guarantee, no questions and no forms beyond one click. Certificates already issued are yours to keep.',
  },
  {
    q: 'Is there a certificate?',
    a: 'Yes — a graded certificate issued when the reviewed project passes. It lists the pipeline you built, not just attendance.',
  },
];

const COHORTS = [
  {
    id: 'march',
    date: 'Cohort of March 10',
    detail: 'Live reviews · 14 seats left',
  },
  {
    id: 'april',
    date: 'Cohort of April 7',
    detail: 'Live reviews · 6 seats left',
  },
];

// A fixed reference date keeps the computed finish date deterministic
// between server and client render.
const COHORT_START = new Date('2026-03-02T00:00:00');
const TOTAL_HOURS = 42;
const PACE_MIN = 2;
const PACE_MAX = 12;

const fmt = (n: number) => `$${n.toFixed(0)}`;

const finishFrom = (pace: number) => {
  const weeks = Math.max(1, Math.ceil(TOTAL_HOURS / pace));
  const finish = new Date(COHORT_START);
  finish.setDate(finish.getDate() + weeks * 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} · finish around ${finish.toLocaleDateString(
    'en-US',
    {month: 'short', day: 'numeric'},
  )}`;
};

// ─── Star Rating ─────────────────────────────────────────────────────────────
function StarRating({rating, count}: {rating: number; count?: number}) {
  const filled = Math.round(rating);
  const empty = 5 - filled;

  return (
    <HStack gap={1} vAlign="center">
      {Array.from({length: filled}, (_, i) => (
        <Icon key={`full-${i}`} icon={StarIconSolid} size="sm" />
      ))}
      {Array.from({length: empty}, (_, i) => (
        <Icon key={`empty-${i}`} icon={StarIcon} size="sm" />
      ))}
      {count === undefined && (
        <VisuallyHidden>{`Rated ${rating} out of 5`}</VisuallyHidden>
      )}
      {count !== undefined && (
        <Text type="body" color="secondary">
          {rating} ({count.toLocaleString('en-US')})
        </Text>
      )}
    </HStack>
  );
}

function SectionHeader({title, action}: {title: string; action?: ReactNode}) {
  return (
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={2}>{title}</Heading>
      {action}
    </HStack>
  );
}

// ─── Course head: title, poster, facts ──────────────────────────────────────
function CourseHead() {
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Badge variant="warning" label="Bestseller" />
          <Badge label={COURSE.level} />
        </HStack>
        <Heading level={1} maxLines={3}>
          {COURSE.title}
        </Heading>
        <HStack gap={2} vAlign="center">
          <StarRating rating={COURSE.rating} count={COURSE.ratingCount} />
          <Text type="body" color="secondary">
            · {COURSE.learnerCount} learners
          </Text>
        </HStack>
      </VStack>
      <AspectRatio ratio={16 / 9}>
        <img
          style={posterImage}
          src="/template-assets/light-working-horizontal-1.png"
          alt="Course preview: a laptop showing the extraction pipeline built in the project"
        />
      </AspectRatio>
      <HStack gap={5} vAlign="center" wrap="wrap">
        <HStack gap={1} vAlign="center">
          <Icon icon={ClockIcon} size="sm" />
          <Text type="body" color="secondary">
            {COURSE.runtime}
          </Text>
        </HStack>
        <HStack gap={1} vAlign="center">
          <Icon icon={BookOpenIcon} size="sm" />
          <Text type="body" color="secondary">
            {COURSE.lessonCount} lessons
          </Text>
        </HStack>
        <HStack gap={1} vAlign="center">
          <Icon icon={GlobeAltIcon} size="sm" />
          <Text type="body" color="secondary">
            {COURSE.language}
          </Text>
        </HStack>
        <HStack gap={1} vAlign="center">
          <Icon icon={BoltIcon} size="sm" />
          <Text type="body" color="secondary">
            Self-paced or cohort
          </Text>
        </HStack>
      </HStack>
    </VStack>
  );
}

// ─── About ───────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="About this course" />
        <Text type="body">{COURSE.about}</Text>
        <VStack gap={2}>
          <Text type="label">Skills you practice</Text>
          <HStack gap={2} wrap="wrap">
            {COURSE.skills.map(skill => (
              <Badge key={skill} label={skill} />
            ))}
          </HStack>
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Syllabus ────────────────────────────────────────────────────────────────
function SyllabusSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader
          title="Syllabus"
          action={
            <Text type="supporting" color="secondary">
              {MODULES.length} modules · {COURSE.lessonCount} lessons
            </Text>
          }
        />
        <CollapsibleGroup type="multiple" defaultValue={[MODULES[0].id]}>
          {MODULES.map(module => (
            <Collapsible
              key={module.id}
              value={module.id}
              trigger={
                <VStack gap={1}>
                  <Text type="large" weight="bold">
                    {module.title}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {module.meta}
                  </Text>
                </VStack>
              }>
              <VStack gap={2}>
                {module.lessons.map(lesson => (
                  <HStack
                    key={lesson.title}
                    gap={2}
                    vAlign="center"
                    hAlign="between">
                    <HStack gap={2} vAlign="center">
                      <Icon icon={PlayIcon} size="sm" />
                      <Text type="body">{lesson.title}</Text>
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {lesson.duration}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </VStack>
    </Section>
  );
}

// ─── Instructor ──────────────────────────────────────────────────────────────
function InstructorSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="Your instructor" />
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={4} vAlign="start">
              <Avatar
                name={INSTRUCTOR.name}
                src={INSTRUCTOR.portrait}
                size="xl"
              />
              <VStack gap={1}>
                <Text type="large" weight="bold">
                  {INSTRUCTOR.name}
                </Text>
                <Text type="body" color="secondary">
                  {INSTRUCTOR.role}
                </Text>
              </VStack>
            </HStack>
            <HStack gap={5} vAlign="center">
              <HStack gap={1} vAlign="center">
                <Icon icon={UsersIcon} size="sm" />
                <Text type="body" color="secondary">
                  {INSTRUCTOR.learners} learners
                </Text>
              </HStack>
              <HStack gap={1} vAlign="center">
                <Icon icon={BookOpenIcon} size="sm" />
                <Text type="body" color="secondary">
                  {INSTRUCTOR.courses} courses
                </Text>
              </HStack>
              <HStack gap={1} vAlign="center">
                <Icon icon={StarIcon} size="sm" />
                <Text type="body" color="secondary">
                  {INSTRUCTOR.rating} instructor rating
                </Text>
              </HStack>
            </HStack>
            <Text type="body">{INSTRUCTOR.bio}</Text>
            <HStack gap={2}>
              <Button label="View full profile" />
              <Button label="Follow" variant="ghost" />
            </HStack>
          </VStack>
        </Card>
      </VStack>
    </Section>
  );
}

// ─── Reviews ─────────────────────────────────────────────────────────────────
function ReviewCard({review}: {review: (typeof REVIEWS)[number]}) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Avatar name={review.name} src={review.avatar} size="sm" />
          <VStack gap={1}>
            <Text type="body" weight="bold">
              {review.name}
            </Text>
            <Text type="supporting" color="secondary">
              {review.date}
            </Text>
          </VStack>
        </HStack>
        <StarRating rating={review.rating} />
        <Text type="body">{review.body}</Text>
        <HStack gap={2} vAlign="center">
          <Button
            label={`Helpful (${review.helpful})`}
            variant="ghost"
            size="sm"
            icon={<Icon icon={CheckIcon} size="xsm" />}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

function ReviewsSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader
          title="Reviews"
          action={
            <Link href="#" type="supporting" color="secondary">
              How reviews work
            </Link>
          }
        />
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={5} vAlign="center">
              <VStack gap={1}>
                <Text type="display-3">{COURSE.rating}</Text>
                <StarRating rating={COURSE.rating} />
                <Text type="supporting" color="secondary">
                  {COURSE.ratingCount.toLocaleString('en-US')} reviews
                </Text>
              </VStack>
              <StackItem size="fill">
                <VStack gap={3}>
                  {ASPECTS.map(aspect => (
                    <VStack key={aspect.label} gap={1}>
                      <HStack gap={2} vAlign="center" hAlign="between">
                        <Text type="body" color="secondary">
                          {aspect.label}
                        </Text>
                        <Text type="body" color="secondary">
                          {aspect.score.toFixed(1)}
                        </Text>
                      </HStack>
                      <ProgressBar
                        label={aspect.label}
                        isLabelHidden
                        value={(aspect.score / 5) * 100}
                      />
                    </VStack>
                  ))}
                </VStack>
              </StackItem>
            </HStack>
          </VStack>
        </Card>
        <Grid columns={{minWidth: 280, repeat: 'fit'}} gap={4}>
          {REVIEWS.map(review => (
            <ReviewCard key={review.name} review={review} />
          ))}
        </Grid>
      </VStack>
    </Section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
function FaqSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="Common questions" />
        <CollapsibleGroup type="multiple">
          {FAQS.map(faq => (
            <Collapsible
              key={faq.q}
              value={faq.q}
              defaultIsOpen={false}
              trigger={
                <Text type="large" weight="bold">
                  {faq.q}
                </Text>
              }>
              <Text type="body">{faq.a}</Text>
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </VStack>
    </Section>
  );
}

// ─── Enroll rail ─────────────────────────────────────────────────────────────
function EnrollRail() {
  const [mode, setMode] = useState('self-paced');
  const [pace, setPace] = useState(7);
  const [cohort, setCohort] = useState(COHORTS[0].id);

  return (
    <Card padding={5}>
      <VStack gap={4}>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <Text type="display-3">{fmt(COURSE.price)}</Text>
            <Text type="body" color="secondary" hasStrikethrough>
              {fmt(COURSE.compareAt)}
            </Text>
            <Badge variant="error" label="Sale" />
          </HStack>
          <Text type="supporting" color="secondary">
            One-time purchase · yours to keep
          </Text>
        </VStack>
        <VStack gap={2}>
          <Button
            label="Enroll now"
            variant="primary"
            size="lg"
            icon={
              <Icon icon={ArrowRightIcon} size="sm" xstyle={rtlStyles.mirror} />
            }
          />
          <Button
            label="Start lesson one free"
            size="lg"
            icon={<Icon icon={PlayIcon} size="sm" />}
          />
        </VStack>
        <Text type="supporting" color="secondary">
          30-day money-back guarantee
        </Text>
        <Divider />
        <VStack gap={3}>
          <Text type="label">Start</Text>
          <SegmentedControl value={mode} onChange={setMode} label="Start mode">
            <SegmentedControlItem value="self-paced" label="Self-paced" />
            <SegmentedControlItem value="cohort" label="Cohort" />
          </SegmentedControl>
          {mode === 'self-paced' ? (
            <VStack gap={2}>
              <Slider
                label="Weekly pace"
                value={pace}
                onChange={setPace}
                min={PACE_MIN}
                max={PACE_MAX}
                marks={[{value: PACE_MIN}, {value: PACE_MAX}]}
                formatValue={(value: number) => `${value} h/week`}
              />
              <Text type="supporting" color="secondary">
                At {pace} h/week — {finishFrom(pace)}
              </Text>
            </VStack>
          ) : (
            <RadioList label="Cohort start" value={cohort} onChange={setCohort}>
              {COHORTS.map(option => (
                <RadioListItem
                  key={option.id}
                  value={option.id}
                  label={option.date}
                  description={option.detail}
                />
              ))}
            </RadioList>
          )}
        </VStack>
        <Divider />
        <VStack gap={2}>
          <Text type="label">This course includes</Text>
          {INCLUDES.map(item => (
            <HStack key={item} gap={2} vAlign="start">
              <Icon icon={CheckIcon} size="sm" />
              <Text type="body" color="secondary">
                {item}
              </Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CourseDetailTemplate() {
  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent padding={6}>
          <Grid columns={{minWidth: 320, repeat: 'fit'}} gap={6}>
            <VStack gap={4}>
              <CourseHead />
              <AboutSection />
              <SyllabusSection />
              <InstructorSection />
              <ReviewsSection />
              <FaqSection />
            </VStack>
            <VStack gap={4} style={stickyRail}>
              <EnrollRail />
            </VStack>
          </Grid>
        </LayoutContent>
      }
    />
  );
}
