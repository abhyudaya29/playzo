'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api';
import {
  hasAnalyticsConsent,
  identifyUser,
  resetAnalytics,
  setAnalyticsConsent,
  trackPageView,
} from '@/lib/analytics';
export default function AnalyticsProvider() {
  const { isLoaded, userId, getToken } = useAuth();
  const path = usePathname();
  const [asked, setAsked] = useState(true);
  const lastPage = useRef('');
  const [identityReady, setIdentityReady] = useState(false);
  useEffect(() => {
    try {
      setAsked(localStorage.getItem('playzo:analytics-consent') !== null);
    } catch {}
  }, []);
  useEffect(() => {
    if (!isLoaded) return;
    resetAnalytics();
    lastPage.current = '';
    setIdentityReady(false);
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        const me = await request<{ id: string }>(
          '/api/v1/users/me',
          await getToken(),
        );
        if (active) {
          await request(
            '/api/v1/users/me/analytics-consent',
            await getToken(),
            {
              method: 'PATCH',
              body: JSON.stringify({ allowed: hasAnalyticsConsent() }),
            },
          );
          if (active) {
            await identifyUser(me.id);
            setIdentityReady(true);
          }
        }
      } catch {}
    })();
    return () => {
      active = false;
      resetAnalytics();
    };
  }, [isLoaded, userId, getToken]);
  useEffect(() => {
    if (!identityReady || lastPage.current === path) return;
    lastPage.current = path;
    trackPageView(path);
  }, [path, identityReady]);
  useEffect(() => {
    const sync = () => {
      if (!userId) return;
      void (async () => {
        try {
          await request(
            '/api/v1/users/me/analytics-consent',
            await getToken(),
            {
              method: 'PATCH',
              body: JSON.stringify({ allowed: hasAnalyticsConsent() }),
            },
          );
          lastPage.current = '';
          trackPageView(path);
        } catch {}
      })();
    };
    window.addEventListener('playzo:analytics-consent', sync);
    return () => window.removeEventListener('playzo:analytics-consent', sync);
  }, [userId, getToken, path]);
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || asked) return null;
  return (
    <aside
      aria-label="Analytics preferences"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg space-y-3 rounded-xl border border-primary/15 bg-white p-5 shadow-lg"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        Help improve Playzo with optional product analytics. We keep profile
        details and private messages out of analytics. Session replay is
        disabled.{' '}
        <Link href="/privacy" className="text-primary underline">
          Privacy details
        </Link>
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void setAnalyticsConsent(false);
            setAsked(true);
          }}
        >
          Decline
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void setAnalyticsConsent(true);
            setAsked(true);
          }}
        >
          Allow analytics
        </Button>
      </div>
    </aside>
  );
}
