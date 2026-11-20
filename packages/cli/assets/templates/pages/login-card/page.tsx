// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type CSSProperties} from 'react';
import {PackageIcon} from '@astryxdesign/template-icons';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';
import {Card} from '@astryxdesign/core/Card';
import {Link} from '@astryxdesign/core/Link';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';

// Brand sign-in marks — no heroicons or template-assets equivalent.
const AppleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    width={16}
    height={16}
    aria-hidden="true"
    {...props}>
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    width={16}
    height={16}
    aria-hidden="true"
    {...props}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// Standalone auth page paints its own body background (no host shell).
const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
// Cap the column at 400px but let it shrink to fit narrow screens (Stack
// has no maxWidth prop, so it's set here).
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
};

export default function LoginSimple() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginFailed, setLoginFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const showToast = useToast();

  const handleLogin = () => {
    if (!email || !password) {
      setLoginFailed(true);
      return;
    }
    setIsLoading(true);
    setLoginFailed(false);
    setTimeout(() => {
      setIsLoading(false);
      setLoginFailed(true);
    }, 2000);
  };

  return (
    <Center role="main" axis="both" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        {/* Logo */}
        <VStack gap={2} hAlign="center">
          <Icon icon={PackageIcon} size="lg" />
          <Text type="body" weight="bold" size="lg">
            Product Inc.
          </Text>
        </VStack>

        {/* Card */}
        <Card padding={8} width="100%">
          <VStack gap={4} hAlign="stretch">
            {/* Header */}
            <VStack gap={1} hAlign="center">
              <Heading level={2} accessibilityLevel={1}>
                Welcome back
              </Heading>
              <Text type="body" color="secondary" size="sm">
                Sign in to your account
              </Text>
            </VStack>

            {/* Form fields */}
            <VStack gap={2}>
              <TextInput
                label="Email"
                isLabelHidden
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={setEmail}
                size="lg"
              />
              <VStack gap={1}>
                <TextInput
                  label="Password"
                  isLabelHidden
                  placeholder="Enter your password"
                  type="password"
                  value={password}
                  onChange={(v: string) => {
                    setPassword(v);
                    setLoginFailed(false);
                  }}
                  size="lg"
                  status={
                    loginFailed
                      ? {
                          type: 'error',
                          message: 'Incorrect password. Try again.',
                        }
                      : undefined
                  }
                />
                {loginFailed && (
                  <VStack hAlign="end">
                    <Link
                      href="#"
                      size="sm"
                      color="secondary"
                      type="supporting">
                      Forgot password?
                    </Link>
                  </VStack>
                )}
              </VStack>
            </VStack>

            {/* Login button */}
            <Button
              label="Login"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              onClick={handleLogin}
            />

            {/* Divider */}
            <Divider label="Or continue with" />

            {/* Social buttons */}
            <VStack gap={3} hAlign="stretch">
              <Button
                label="Login with Apple"
                variant="secondary"
                icon={<AppleIcon />}
                size="lg"
                onClick={() =>
                  // Demo only: replace this toast with the call that starts Apple sign-in.
                  showToast({
                    body: 'Demo: Apple sign-in would start here',
                    uniqueID: 'sign-in-apple',
                  })
                }
              />
              <Button
                label="Login with Google"
                variant="secondary"
                icon={<GoogleIcon />}
                size="lg"
                onClick={() =>
                  // Demo only: replace this toast with the call that starts Google sign-in.
                  showToast({
                    body: 'Demo: Google sign-in would start here',
                    uniqueID: 'sign-in-google',
                  })
                }
              />
            </VStack>

            {/* Sign up link */}
            <VStack hAlign="center">
              <Text type="supporting" color="secondary">
                Don&apos;t have an account?{' '}
                <Link href="#" type="supporting">
                  Sign up
                </Link>
              </Text>
            </VStack>
          </VStack>
        </Card>

        {/* Terms */}
        <VStack hAlign="center" width="100%">
          <Text type="supporting" color="secondary" justify="center">
            By clicking continue, you agree to our{' '}
            <Link href="#" type="supporting">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="#" type="supporting">
              Privacy Policy
            </Link>
            .
          </Text>
        </VStack>
      </VStack>
    </Center>
  );
}
