'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  Check,
  X,
  MessageSquare,
  Send,
  Users,
  CalendarDays,
  UserRoundPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  PageHeader,
  ErrorNotice,
  EmptyState,
  CardSkeletons,
  BusyLabel,
} from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { refreshActivity, SocialRequest } from '@/lib/social-types';
const tabs = [
  ['incoming', 'Incoming'],
  ['outgoing', 'Outgoing'],
  ['accepted', 'Accepted'],
  ['declined', 'Declined'],
] as const;
const labels = {
  connection: 'Player connection',
  group: 'Community membership',
  game: 'Game participation',
  invitation: 'Game invitation',
};
const icons = {
  connection: UserRoundPlus,
  group: Users,
  game: CalendarDays,
  invitation: Send,
};
export default function Requests() {
  const { getToken } = useAuth();
  const router = useRouter();
  const resource = useResource<SocialRequest[]>('/api/v1/requests', 10000);
  const [tab, setTab] = useState<string>('incoming'),
    [kind, setKind] = useState('all'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const filtered = (resource.data || []).filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (tab === 'incoming' || tab === 'outgoing'
        ? item.direction === tab && item.status === 'pending'
        : item.status === tab),
  );
  async function respond(item: SocialRequest, action: 'accept' | 'decline') {
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      const result = await request<{ conversation_id: string | null }>(
        `/api/v1/requests/${item.kind}/${item.id}/${action}`,
        await getToken(),
        { method: 'PATCH' },
      );
      await resource.reload();
      refreshActivity();
      if (action === 'accept' && result.conversation_id)
        router.push(`/messages?conversation=${result.conversation_id}`);
      else setNotice('Request declined. No chat was opened.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not respond. Please try again.',
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-enter space-y-6">
      <PageHeader
        eyebrow="A game starts with hello"
        title="Your requests."
        description="Connect with a player, approve a new teammate, or accept an invitation. Every kind of play has its own way in."
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Request status"
        >
          {tabs.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              role="tab"
              aria-selected={tab === value}
              variant={tab === value ? 'secondary' : 'ghost'}
              onClick={() => setTab(value)}
            >
              {label}
              {value === 'incoming' &&
                !!resource.data?.filter((item) => item.can_respond).length && (
                  <Badge variant="outline" className="ml-1">
                    {resource.data.filter((item) => item.can_respond).length}
                  </Badge>
                )}
            </Button>
          ))}
        </div>
        <div className="w-48">
          <OptionSelect
            label="Request type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All request types' },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        </div>
      </div>
      <ErrorNotice message={error || resource.error} retry={resource.reload} />
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {resource.loading && !resource.data ? (
        <CardSkeletons />
      ) : resource.error && !resource.data ? null : filtered.length ? (
        <div className="space-y-4">
          {filtered.map((item) => {
            const Icon = icons[item.kind];
            return (
              <Card key={`${item.kind}:${item.id}`} className="shadow-none">
                <CardContent className="flex flex-wrap items-start justify-between gap-5">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <Avatar className="size-11 shrink-0 rounded-xl">
                      <AvatarFallback className="rounded-xl bg-accent font-semibold text-primary">
                        {item.person.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">
                          {item.person.name}
                        </h2>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Icon className="size-3" />
                          {labels[item.kind]}
                        </Badge>
                        {item.sport && (
                          <Badge variant="secondary">{item.sport}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.kind === 'connection'
                          ? item.direction === 'incoming'
                            ? 'Wants to connect and find a time to play.'
                            : 'You sent a connection request.'
                          : `${item.direction === 'incoming' ? 'Incoming request' : 'Your request'} · ${item.title}`}
                      </p>
                      {item.introduction && (
                        <p className="max-w-2xl whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2 text-sm leading-6">
                          {item.introduction}
                        </p>
                      )}
                      {item.venue && (
                        <p className="text-xs text-muted-foreground">
                          {item.venue} ·{' '}
                          {item.starts_at &&
                            new Date(item.starts_at).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' },
                        )}{' '}
                        ·{' '}
                        {item.status === 'pending'
                          ? item.direction === 'outgoing'
                            ? 'Waiting for a response'
                            : 'Your response is needed'
                          : item.status === 'accepted'
                            ? 'Accepted'
                            : 'Declined'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.can_respond ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => respond(item, 'decline')}
                        >
                          <X />
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={!!busy}
                          onClick={() => respond(item, 'accept')}
                        >
                          <BusyLabel busy={busy === item.id}>
                            <Check />
                            Accept & chat
                          </BusyLabel>
                        </Button>
                      </>
                    ) : item.status === 'accepted' && item.conversation_id ? (
                      <Button size="sm" asChild variant="outline">
                        <Link
                          href={`/messages?conversation=${item.conversation_id}`}
                        >
                          <MessageSquare />
                          Open chat
                        </Link>
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {item.status}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            tab === 'incoming'
              ? 'You’re all caught up'
              : `No ${tab} requests yet`
          }
          description={
            tab === 'incoming'
              ? 'New connection requests, community approvals, and game invitations will appear here.'
              : 'Find a player, request to join a community, or explore an upcoming game.'
          }
          action={
            <Button variant="outline" asChild>
              <Link href="/dashboard">Discover players</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
