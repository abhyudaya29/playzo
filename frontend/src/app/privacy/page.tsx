'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { hasAnalyticsConsent, setAnalyticsConsent } from '@/lib/analytics';
export default function Privacy() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(hasAnalyticsConsent());
  }, []);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-12">
      <Link href="/dashboard" className="text-sm text-primary underline">
        Back to Playzo
      </Link>
      <h1 className="text-3xl font-semibold">Your privacy at Playzo</h1>
      <p className="text-sm leading-7 text-muted-foreground">
        Your public player profile contains your display name, photo,
        neighbourhood, sports, bio and playing availability. Age, phone number
        and exact location stay private. Gender is private unless you choose to
        make it public. Playzo is currently for players aged 18 and older.
      </p>
      <p className="text-sm leading-7 text-muted-foreground">
        We keep operational records of meaningful actions such as connections,
        joining games, and moderation. Authorized staff can review limited
        operational activity. Detailed activity is retained for up to 180 days
        when scheduled maintenance is enabled. Admin audit logs are separate and
        append-only. Ordinary administration does not include access to private
        message content.
      </p>
      <p className="text-sm leading-7 text-muted-foreground">
        Optional PostHog Cloud analytics help us understand feature use. We send
        an internal player identifier and selected feature events, without phone
        numbers, email, gender, age, precise coordinates, search text or message
        content. Automatic capture and session replay are disabled. You can
        change your choice below.
      </p>
      <Button
        variant={allowed ? 'outline' : 'default'}
        onClick={async () => {
          await setAnalyticsConsent(!allowed);
          setAllowed(!allowed);
        }}
      >
        {allowed ? 'Turn off optional analytics' : 'Allow optional analytics'}
      </Button>
    </main>
  );
}
