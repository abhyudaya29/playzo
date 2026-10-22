'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { MapPin, ArrowLeft, MessageSquare, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  PageHeader,
  ErrorNotice,
  CardSkeletons,
  BusyLabel,
  Field,
} from '@/components/page-ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import PlayerPhoto from '@/components/PlayerPhoto';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { Availability, SportPreference, Profile } from '@/lib/types';
import { days, interests } from '@/lib/player-options';
import { refreshActivity } from '@/lib/social-types';
import { trackEvent } from '@/lib/analytics';

type Player = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  nickname: string | null;
  city: string | null;
  locality: string | null;
  sports: SportPreference[];
  availability: Availability[];
  participation_interests: string[];
  gender: string | null;
  gender_self_description: string | null;
  connection_status: string | null;
  connection_direction: string | null;
};
export default function PlayerProfile({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { getToken } = useAuth();
  const resource = useResource<Player>(
    `/api/v1/users/${encodeURIComponent(userId)}`,
  );
  const me = useResource<Profile>('/api/v1/users/me');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [action, setAction] = useState<'connect' | 'report' | 'block' | null>(
      null,
    ),
    [message, setMessage] = useState('');
  async function perform() {
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      if (action === 'connect') {
        await request('/api/v1/connections', token, {
          method: 'POST',
          body: JSON.stringify({
            receiver_id: userId,
            introduction: message.trim() || null,
            sport: resource.data?.sports[0]?.sport,
          }),
        });
        setNotice('Connection request sent.');
        await resource.reload();
      } else if (action === 'report') {
        await request('/api/v1/reports', token, {
          method: 'POST',
          body: JSON.stringify({
            target_type: 'user',
            target_id: userId,
            reason: message,
          }),
        });
        setNotice('Report received. Our moderation team will review it.');
      } else {
        await request('/api/v1/blocks', token, {
          method: 'POST',
          body: JSON.stringify({ blocked_id: userId }),
        });
        setNotice(
          'Player blocked. You can manage blocked players in Messages.',
        );
        await resource.reload();
      }
      refreshActivity();
      setAction(null);
      setMessage('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not complete this action.',
      );
    } finally {
      setBusy(false);
    }
  }
  const p = resource.data;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/dashboard">
          <ArrowLeft />
          Discover players
        </Link>
      </Button>
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <ErrorNotice message={error || resource.error} retry={resource.reload} />
      {resource.loading && !p ? (
        <CardSkeletons />
      ) : (
        p && (
          <>
            <Card className="border-primary/15 shadow-none">
              <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <PlayerPhoto
                  name={p.name}
                  url={p.avatar_url}
                  className="size-28 shrink-0"
                />
                <div className="flex-1">
                  <PageHeader
                    eyebrow="Player profile"
                    title={p.name}
                    description={
                      p.nickname
                        ? `Known as ${p.nickname}`
                        : 'Your local playground'
                    }
                  />
                  <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    {[p.locality, p.city].filter(Boolean).join(', ') ||
                      'Location not shared'}
                  </p>
                  {p.gender && (
                    <p className="mt-2 text-xs capitalize text-muted-foreground">
                      {p.gender === 'other'
                        ? p.gender_self_description
                        : p.gender.replaceAll('_', ' ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {me.data?.id === p.id ? (
                    <Button asChild>
                      <Link href="/onboarding">Edit your profile</Link>
                    </Button>
                  ) : p.connection_status === 'accepted' ? (
                    <Button asChild>
                      <Link href={`/messages?player=${p.id}`}>
                        <MessageSquare />
                        Message
                      </Link>
                    </Button>
                  ) : p.connection_status === 'pending' &&
                    p.connection_direction === 'incoming' ? (
                    <Button asChild>
                      <Link href="/requests">Respond to request</Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={!!p.connection_status || busy}
                      onClick={() => {
                        setAction('connect');
                        setMessage('');
                        setError('');
                      }}
                    >
                      {p.connection_status === 'pending'
                        ? 'Requested'
                        : p.connection_status === 'declined'
                          ? 'Declined'
                          : 'Connect'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>About {p.name.split(' ')[0]}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                  {p.bio ||
                    'Ready to meet local players and make time for a good game.'}
                </p>
              </CardContent>
            </Card>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Sports and pace</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.sports.map((s) => (
                    <div
                      key={s.sport}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Badge variant="secondary">{s.sport}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {s.skill_level}
                      </Badge>
                      <span className="text-xs capitalize text-muted-foreground">
                        {s.play_intention}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>Playing availability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {p.availability.length ? (
                    p.availability.map((a) => (
                      <p
                        key={`${a.weekday}-${a.time_slot}`}
                        className="text-sm capitalize text-muted-foreground"
                      >
                        {days[a.weekday]} · {a.time_slot}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ask about a good time to play after connecting.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>Here to play</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {p.participation_interests.length ? (
                  p.participation_interests.map((i) => (
                    <Badge variant="secondary" key={i}>
                      {interests.find(([v]) => v === i)?.[1] || i}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open to the next good game.
                  </p>
                )}
              </CardContent>
            </Card>
            {me.data?.id !== p.id && (
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAction('report');
                    setMessage('');
                  }}
                >
                  Report player
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAction('block')}
                >
                  Block player
                </Button>
              </div>
            )}
          </>
        )
      )}
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'connect'
                ? `Connect with ${p?.name}`
                : action === 'report'
                  ? 'Report player'
                  : 'Block player'}
            </DialogTitle>
            <DialogDescription>
              {action === 'connect'
                ? 'Send a short hello. Chat opens after your request is accepted.'
                : action === 'report'
                  ? 'Explain what happened. Your report is visible to authorized moderators.'
                  : 'This prevents connections and messaging between you and hides both profiles from discovery.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform();
            }}
            className="space-y-4"
          >
            <ErrorNotice message={error} />
            {action !== 'block' && (
              <Field
                id="profile-message"
                label={
                  action === 'report' ? 'Reason' : 'Introduction (optional)'
                }
              >
                <Textarea
                  id="profile-message"
                  required={action === 'report'}
                  minLength={action === 'report' ? 5 : undefined}
                  maxLength={action === 'report' ? 2000 : 500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                <BusyLabel busy={busy}>
                  {action === 'connect'
                    ? 'Send request'
                    : action === 'report'
                      ? 'Submit report'
                      : 'Block player'}
                </BusyLabel>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
