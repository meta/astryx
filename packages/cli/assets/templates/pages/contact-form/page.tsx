// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Section} from '@astryxdesign/core/Section';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Link} from '@astryxdesign/core/Link';
import {Token} from '@astryxdesign/core/Token';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Divider} from '@astryxdesign/core/Divider';
import {Banner} from '@astryxdesign/core/Banner';
import {
  RocketLaunchIcon,
  AdjustmentsHorizontalIcon,
  HandRaisedIcon,
} from '@heroicons/react/24/outline';

const CAMPAIGN_GOALS = [
  'Brand Awareness',
  'Product Sampling',
  'Product Launch',
  'Event Promotion',
  'Retail / In-Store',
  'Trade Show',
  'Influencer Activation',
  'Community Building',
  'Seasonal Campaign',
  'Other',
];

const LAUNCH_OPTIONS = [
  'Within 30 days',
  '1\u20133 months',
  '3\u20136 months',
  '6\u201312 months',
  '12+ months',
];

const BUDGET_OPTIONS = [
  'Under $5K/mo',
  '$5K\u2013$15K/mo',
  '$15K\u2013$50K/mo',
  '$50K\u2013$100K/mo',
  '$100K+/mo',
];

const WHY_US = [
  {
    icon: RocketLaunchIcon,
    title: 'We move fast for you',
    description: 'We cut through the noise and get straight to the work.',
  },
  {
    icon: AdjustmentsHorizontalIcon,
    title: 'We build around you',
    description: "We tailor everything to what you're trying to achieve.",
  },
  {
    icon: HandRaisedIcon,
    title: 'We show up for you',
    description: 'A dedicated team that knows your brand and wants to win.',
  },
];

/**
 * Contact Form — lead capture form template
 */
export default function FormSimplePage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [timeline, setTimeline] = useState('');
  const [budget, setBudget] = useState('');
  const [message, setMessage] = useState('');
  const [hearAboutUs, setHearAboutUs] = useState('');
  const [isDecider, setIsDecider] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Each field's problem, in the order the fields appear. The form shows
  // them once Submit has been pressed.
  const fieldErrors = {
    fullName: !fullName.trim() ? 'Required' : undefined,
    email: !email.trim() ? 'Required' : undefined,
    company: !company.trim() ? 'Required' : undefined,
    phone: !phone.trim() ? 'Required' : undefined,
    goals: goals.length === 0 ? 'Pick at least one' : undefined,
    timeline: !timeline ? 'Required' : undefined,
    budget: !budget ? 'Required' : undefined,
  };
  const errors: Partial<typeof fieldErrors> = submitted ? fieldErrors : {};

  // A blocked Submit focuses the first field to fix. The goal tokens have no
  // single focus handle, so `goals` is absent here and a blocked Submit
  // falls through to the next problem.
  const fieldRefs = {
    fullName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    company: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    timeline: useRef<HTMLButtonElement>(null),
    budget: useRef<HTMLButtonElement>(null),
  };

  const handleSubmit = () => {
    setSubmitted(true);
    // Focusing the field scrolls it into view and makes the error it renders
    // its accessible description, so the answer to a blocked Submit arrives
    // where the fix has to happen.
    const target = Object.entries(fieldErrors)
      .filter(([, error]) => error != null)
      .map(([key]) => fieldRefs[key as keyof typeof fieldRefs]?.current)
      .find(Boolean);
    target?.focus();
  };

  const toggleGoal = (goal: string) =>
    setGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal],
    );

  return (
    <Center axis="horizontal">
      <VStack hAlign="center" width="100%">
        <Section maxWidth={800} padding={6} paddingBlock={10} variant="section">
          <VStack gap={6}>
            {/* Header */}
            <VStack gap={2} hAlign="center">
              <Text type="display-1" weight="bold">
                Let's work together
              </Text>
              <Text type="body" color="secondary">
                Tell us a bit about what you're working on — we'd love to help.
              </Text>
            </VStack>

            {/* Why work with us */}
            <VStack gap={5}>
              <Grid columns={{minWidth: 200}} gap={4}>
                {WHY_US.map(item => (
                  <Card key={item.title}>
                    <VStack gap={3}>
                      <Icon icon={item.icon} size="lg" color="accent" />
                      <VStack gap={1}>
                        <Text type="body" weight="bold">
                          {item.title}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {item.description}
                        </Text>
                      </VStack>
                    </VStack>
                  </Card>
                ))}
              </Grid>
            </VStack>

            {/* Your details */}
            <VStack gap={5}>
              <Grid columns={{minWidth: 260}} gap={4}>
                <TextInput
                  ref={fieldRefs.fullName}
                  label="Full Name"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={setFullName}
                  status={
                    errors.fullName
                      ? {type: 'error', message: errors.fullName}
                      : undefined
                  }
                />
                <TextInput
                  ref={fieldRefs.email}
                  label="Email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={setEmail}
                  status={
                    errors.email
                      ? {type: 'error', message: errors.email}
                      : undefined
                  }
                />
              </Grid>
              <Grid columns={{minWidth: 260}} gap={4}>
                <TextInput
                  ref={fieldRefs.company}
                  label="Company"
                  placeholder="Company"
                  value={company}
                  onChange={setCompany}
                  status={
                    errors.company
                      ? {type: 'error', message: errors.company}
                      : undefined
                  }
                />
                <TextInput
                  ref={fieldRefs.phone}
                  label="Phone"
                  placeholder="Phone number"
                  value={phone}
                  onChange={setPhone}
                  status={
                    errors.phone
                      ? {type: 'error', message: errors.phone}
                      : undefined
                  }
                />
              </Grid>
            </VStack>

            <Divider />

            {/* Your project */}
            <VStack gap={5}>
              <VStack gap={2}>
                <Text type="label" color="secondary">
                  What are you going for?
                </Text>
                <HStack gap={2} wrap="wrap">
                  {CAMPAIGN_GOALS.map(goal => (
                    <Token
                      key={goal}
                      label={goal}
                      color={goals.includes(goal) ? 'blue' : 'default'}
                      onClick={() => toggleGoal(goal)}
                    />
                  ))}
                </HStack>
                {errors.goals && <Banner status="error" title={errors.goals} />}
              </VStack>

              <Selector
                ref={fieldRefs.timeline}
                label="When are you thinking?"
                placeholder="When are you thinking of launching?"
                options={LAUNCH_OPTIONS}
                value={timeline}
                onChange={setTimeline}
                status={
                  errors.timeline
                    ? {type: 'error', message: errors.timeline}
                    : undefined
                }
              />

              <Selector
                ref={fieldRefs.budget}
                label="Ballpark budget?"
                placeholder="What's your rough monthly budget?"
                options={BUDGET_OPTIONS}
                value={budget}
                onChange={setBudget}
                status={
                  errors.budget
                    ? {type: 'error', message: errors.budget}
                    : undefined
                }
              />

              <RadioList
                label="How did you hear about us?"
                value={hearAboutUs}
                onChange={setHearAboutUs}>
                <RadioListItem label="Social media" value="social" />
                <RadioListItem label="Word of mouth" value="word-of-mouth" />
                <RadioListItem label="Search engine" value="search" />
                <RadioListItem label="Event or conference" value="event" />
                <RadioListItem label="Other" value="other" />
              </RadioList>

              <TextArea
                label="Anything else?"
                placeholder="Tell us whatever else is on your mind..."
                value={message}
                onChange={setMessage}
              />

              <CheckboxInput
                label="I'm a budget decision-maker"
                value={isDecider}
                onChange={setIsDecider}
              />
            </VStack>

            {/* Submit */}
            <VStack gap={3}>
              <Button
                label="Submit"
                variant="primary"
                size="lg"
                onClick={handleSubmit}
              />
              <HStack gap={1} hAlign="center">
                <Text type="supporting" color="secondary">
                  By submitting you agree to our{' '}
                  <Link href="#" type="supporting">
                    Privacy Policy
                  </Link>
                  .
                </Text>
              </HStack>
            </VStack>
          </VStack>
        </Section>
      </VStack>
    </Center>
  );
}
