// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
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

  const errors = submitted
    ? {
        fullName: !fullName.trim() ? 'Required' : undefined,
        email: !email.trim() ? 'Required' : undefined,
        company: !company.trim() ? 'Required' : undefined,
        phone: !phone.trim() ? 'Required' : undefined,
        goals: goals.length === 0 ? 'Pick at least one' : undefined,
        timeline: !timeline ? 'Required' : undefined,
        budget: !budget ? 'Required' : undefined,
      }
    : {};

  const toggleGoal = (goal: string) =>
    setGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal],
    );

  return (
    <Center role="main" axis="horizontal">
      <VStack hAlign="center" width="100%">
        <Section maxWidth={800} padding={6} paddingBlock={10} variant="section">
          <VStack gap={6}>
            {/* Header */}
            <VStack gap={2} hAlign="center">
              <Text as="h1" type="display-1" weight="bold">
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
                onClick={() => setSubmitted(true)}
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
