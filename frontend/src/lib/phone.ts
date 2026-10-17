export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (!compact) return null;

  // Local mobile numbers default to India; international numbers need a prefix.
  const normalized = /^[6-9][0-9]{9}$/.test(compact)
    ? `+91${compact}`
    : compact;
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
    throw new Error(
      'Enter a 10-digit Indian mobile number or an international number with its country code.',
    );
  }
  return normalized;
}
