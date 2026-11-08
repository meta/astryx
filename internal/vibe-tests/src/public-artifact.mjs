// Copyright (c) Meta Platforms, Inc. and affiliates.

const QUOTED_URI = /(["'`])(?:[a-z][a-z0-9+.-]*:\/\/|mailto:)[^\r\n]*?\1/giu;
const FILE_URI = /\bfile:\/\/[^\s"'`)<]+(?:\s+(?=[^\s"'`]*[\\/])[^\s"'`]*)*/giu;
const NETWORK_URI = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`)<]+/giu;
const MAILTO_URI = /\bmailto:[^\s"'`)<]+/giu;
const UNIX_ABSOLUTE_PATH =
  /(^|[^A-Za-z0-9_])\/(?!\/)[-A-Za-z0-9._~][^\r\n"'`]*/gmu;
const WINDOWS_ABSOLUTE_PATH = /(^|[^A-Za-z0-9_])[A-Za-z]:[\\/][^\r\n"'`]*/gmu;
const UNC_PATH = /(^|[^A-Za-z0-9_])\\\\[^\\\r\n"'`]+\\[^\r\n"'`]*/gmu;
const NON_PUBLIC_HOST =
  /\b(?:localhost|(?:[a-z0-9-]+\.)+(?:internal|local|lan|corp)|[a-z0-9.-]*internal[a-z0-9.-]*\.[a-z]{2,})\b/giu;
const CORPORATE_HOST = /\b(?!www\.)(?:[a-z0-9-]+\.)+facebook\.com\b/giu;
const PRIVATE_ADDRESS =
  /\b(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})\b/giu;
const PRIVATE_IPV6 =
  /(^|[^A-Za-z0-9_])(?:\[?::1\]?|\[?f[cd][0-9a-f]{2}:[0-9a-f:]+\]?|\[?fe[89ab][0-9a-f]:[0-9a-f:]+\]?)/gimu;
const BARE_HOST_WITH_PORT = /\b[a-z][a-z0-9-]{1,62}:\d{2,5}\b/giu;
const GENERIC_IDENTITIES = new Set([
  'build',
  'ci',
  'missing',
  'root',
  'runner',
  'unknown',
  'user',
]);

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function usablePrivateValues(privateValues) {
  return [...privateValues]
    .filter(
      value =>
        typeof value === 'string' &&
        value.length > 2 &&
        !GENERIC_IDENTITIES.has(value.toLowerCase()),
    )
    .sort((left, right) => right.length - left.length);
}

function replacePrivateValue(value, privateValue) {
  const pathLike = /[\\/]/.test(privateValue);
  const pattern = pathLike
    ? escaped(privateValue)
    : `(?<![A-Za-z0-9_])${escaped(privateValue)}(?![A-Za-z0-9_])`;
  return value.replace(new RegExp(pattern, 'gu'), '<private-value>');
}

function redactUriToken(token) {
  const punctuation = token.match(/[),.;!?]+$/u)?.[0] ?? '';
  return `<external-uri>${punctuation}`;
}

function redactQuotedUri(token) {
  const quote = token[0];
  return `${quote}<external-uri>${quote}`;
}

function sanitizeString(value, privateValues) {
  let sanitized = value
    .replace(QUOTED_URI, redactQuotedUri)
    .replace(FILE_URI, redactUriToken)
    .replace(NETWORK_URI, redactUriToken)
    .replace(MAILTO_URI, redactUriToken);
  for (const privateValue of usablePrivateValues(privateValues)) {
    sanitized = replacePrivateValue(sanitized, privateValue);
  }
  return sanitized
    .replace(UNC_PATH, '$1<private-path>')
    .replace(UNIX_ABSOLUTE_PATH, '$1<private-path>')
    .replace(WINDOWS_ABSOLUTE_PATH, '$1<private-path>')
    .replace(PRIVATE_ADDRESS, '<private-host>')
    .replace(PRIVATE_IPV6, '$1<private-host>')
    .replace(BARE_HOST_WITH_PORT, '<private-host>')
    .replace(NON_PUBLIC_HOST, '<private-host>')
    .replace(CORPORATE_HOST, '<private-host>');
}

export function sanitizePublicArtifact(value, {privateValues = []} = {}) {
  if (typeof value === 'string') {
    return sanitizeString(value, privateValues);
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizePublicArtifact(item, {privateValues}));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        sanitizeString(key, privateValues),
        sanitizePublicArtifact(item, {privateValues}),
      ]),
    );
  }
  return value;
}

function matches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function containsPrivateValue(value, privateValue) {
  if (/[\\/]/.test(privateValue)) {
    return value.includes(privateValue);
  }
  return matches(
    new RegExp(
      `(?<![A-Za-z0-9_])${escaped(privateValue)}(?![A-Za-z0-9_])`,
      'gu',
    ),
    value,
  );
}

function stringViolation(value, privateValues) {
  if (
    matches(QUOTED_URI, value) ||
    matches(FILE_URI, value) ||
    matches(NETWORK_URI, value) ||
    matches(MAILTO_URI, value) ||
    matches(UNC_PATH, value) ||
    matches(UNIX_ABSOLUTE_PATH, value) ||
    matches(WINDOWS_ABSOLUTE_PATH, value) ||
    matches(PRIVATE_ADDRESS, value) ||
    matches(PRIVATE_IPV6, value) ||
    matches(BARE_HOST_WITH_PORT, value) ||
    matches(NON_PUBLIC_HOST, value) ||
    matches(CORPORATE_HOST, value)
  ) {
    return 'private-path-or-host';
  }
  if (
    usablePrivateValues(privateValues).some(privateValue =>
      containsPrivateValue(value, privateValue),
    )
  ) {
    return 'private-value';
  }
  return null;
}

export function publicArtifactViolation(value, {privateValues = []} = {}) {
  if (typeof value === 'string') {
    return stringViolation(value, privateValues);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const violation = publicArtifactViolation(item, {privateValues});
      if (violation) return violation;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const keyViolation = stringViolation(key, privateValues);
      if (keyViolation) return keyViolation;
      const valueViolation = publicArtifactViolation(item, {privateValues});
      if (valueViolation) return valueViolation;
    }
  }
  return null;
}

export function assertPublicArtifactSafe(
  value,
  {label = 'public artifact', privateValues = []} = {},
) {
  if (publicArtifactViolation(value, {privateValues})) {
    throw new Error(`${label} contains private path or host data`);
  }
}

export function publicSourceLabel(source) {
  return source == null ? 'provenance' : 'runner-reported';
}

export function publicProvenance(provenance, options = {}) {
  const sanitized = sanitizePublicArtifact(provenance, options);
  if (sanitized?.usage?.source !== undefined) {
    sanitized.usage.source = publicSourceLabel(sanitized.usage.source);
  }
  assertPublicArtifactSafe(sanitized, {
    ...options,
    label: 'exported provenance',
  });
  return sanitized;
}
