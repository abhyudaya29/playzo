'use client';
import type { PostHog } from 'posthog-js';

type EventName =
  | 'feature_opened'
  | 'user_logged_in'
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'profile_updated'
  | 'preferences_updated'
  | 'discovery_opened'
  | 'player_search_performed'
  | 'recommendation_viewed'
  | 'recommendation_clicked'
  | 'discovery_filter_changed'
  | 'connection_requested'
  | 'connection_accepted'
  | 'connection_declined'
  | 'group_created'
  | 'group_joined'
  | 'game_created'
  | 'game_joined'
  | 'tournament_created'
  | 'tournament_registered'
  | 'message_sent';
type SafeProperties = {
  sport?: string;
  step?: number;
  feature_source?: string;
  discovery_radius_bucket?: string;
};
const consentKey = 'playzo:analytics-consent';
let sdk: PostHog | null = null;
let initializing: Promise<void> | null = null;
let identity: string | null = null;
let consent = false;
const propertyAllowlist = new Set([
  'token',
  'distinct_id',
  '$lib',
  '$lib_version',
  '$insert_id',
  '$session_id',
  '$device_id',
  '$process_person_profile',
  '$is_identified',
  '$anon_distinct_id',
  'sport',
  'step',
  'feature_source',
  'discovery_radius_bucket',
]);

export function hasAnalyticsConsent() {
  try {
    return localStorage.getItem(consentKey) === 'yes';
  } catch {
    return false;
  }
}
export async function initializeAnalytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host || !host.startsWith('https://') || !hasAnalyticsConsent())
    return;
  if (initializing) return initializing;
  consent = true;
  initializing = (async () => {
    const { default: posthog } = await import('posthog-js');
    if (!consent) return;
    sdk =
      posthog.init(key, {
        api_host: host,
        advanced_disable_feature_flags: true,
        persistence: 'memory',
        person_profiles: 'identified_only',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_performance: false,
        opt_out_capturing_by_default: false,
        ip: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        before_send: (event) => {
          if (!consent || !identity) return null;
          // Drop automatically collected URLs, referrers, device details and any
          // unapproved property before it can leave the browser.
          event.properties = Object.fromEntries(
            Object.entries(event.properties).filter(([key]) =>
              propertyAllowlist.has(key),
            ),
          );
          return event;
        },
      }) || null;
  })().catch(() => {
    sdk = null;
    initializing = null;
  });
  return initializing;
}
export async function identifyUser(id: string) {
  if (identity === id) return;
  if (identity) sdk?.reset();
  identity = id;
  await initializeAnalytics();
  if (identity === id && consent && sdk) {
    sdk.identify(id);
    trackEvent('user_logged_in');
  }
}
export function trackEvent(event: EventName, properties: SafeProperties = {}) {
  if (!consent || !identity || !sdk) return;
  try {
    sdk.capture(event, { ...properties, $insert_id: crypto.randomUUID() });
  } catch {}
}
export function trackPageView(path: string) {
  // Track feature names; never URLs, route IDs, query strings or search text.
  const feature = path.split('/')[1];
  if (
    !['dashboard', 'groups', 'games', 'tournaments', 'requests'].includes(
      feature,
    )
  )
    return;
  if (feature === 'dashboard')
    trackEvent('discovery_opened', { feature_source: 'discovery' });
  else trackEvent('feature_opened', { feature_source: feature });
}
export function resetAnalytics() {
  identity = null;
  try {
    sdk?.reset();
  } catch {}
}
export async function setAnalyticsConsent(allowed: boolean) {
  try {
    localStorage.setItem(consentKey, allowed ? 'yes' : 'no');
  } catch {}
  consent = allowed;
  if (allowed) {
    await initializeAnalytics();
    if (identity && sdk) {
      sdk.opt_in_capturing({ captureEventName: false });
      sdk.identify(identity);
    }
  } else {
    try {
      sdk?.opt_out_capturing();
      sdk?.reset();
    } catch {}
  }
  window.dispatchEvent(new Event('playzo:analytics-consent'));
}
