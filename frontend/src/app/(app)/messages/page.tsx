'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Search, Users, CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PageHeader, ErrorNotice } from '@/components/page-ui';
import ChatPanel from '@/components/ChatPanel';
import BlockedPlayers from '@/components/BlockedPlayers';
import { useResource } from '@/lib/use-resource';
import { Conversation } from '@/lib/social-types';
import { cn } from '@/lib/utils';
function Inbox() {
  const params = useSearchParams();
  const explicitId = params.get('conversation');
  const peerId = params.get('player');
  const [search, setSearch] = useState('');
  const resource = useResource<Conversation[]>('/api/v1/conversations', 5000);
  const id =
    explicitId ||
    (peerId
      ? resource.data?.find(
          (item) =>
            item.kind === 'direct' &&
            item.members.some((member) => member.id === peerId),
        )?.id
      : null);
  const items = (resource.data || []).filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page-enter flex h-[calc(100svh-10rem-env(safe-area-inset-bottom))] min-h-[400px] flex-col md:h-[calc(100svh-8.5rem)]">
      <PageHeader
        eyebrow="From hello to game day"
        title="Messages."
        description="A private space to coordinate your next game."
        action={<BlockedPlayers />}
      />
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-white md:grid-cols-[270px_minmax(0,1fr)]">
        <aside
          className={cn(
            'flex min-h-0 flex-col border-r',
            id && 'hidden md:flex',
          )}
        >
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search conversations"
                placeholder="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-2">
              <ErrorNotice message={resource.error} retry={resource.reload} />
              {resource.loading && !resource.data ? (
                <p role="status" className="p-4 text-xs text-muted-foreground">
                  Loading your inbox…
                </p>
              ) : items.length ? (
                items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/messages?conversation=${item.id}`}
                    className={cn(
                      'mb-1 flex min-w-0 gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60',
                      id === item.id && 'bg-accent/70',
                    )}
                  >
                    <Avatar className="size-9 shrink-0 rounded-xl">
                      <AvatarFallback className="rounded-xl bg-muted text-xs text-primary">
                        {item.kind === 'group' ? (
                          <Users className="size-4" />
                        ) : item.kind === 'game' ? (
                          <CalendarDays className="size-4" />
                        ) : (
                          item.title.charAt(0)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="truncate text-xs font-semibold">
                          {item.title}
                        </p>
                        {item.unread_count > 0 && (
                          <Badge className="px-1.5 text-[9px]">
                            {item.unread_count}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {item.last_message?.body ||
                          'Say hello and plan a game.'}
                      </p>
                      <p className="mt-1 text-[9px] capitalize text-muted-foreground">
                        {item.kind} chat
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="space-y-3 p-5 text-center">
                  <MessageSquare className="mx-auto size-7 text-muted-foreground/60" />
                  <p className="text-sm font-medium">No conversations yet</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Accept a player connection, join an approved community, or
                    join a game to start chatting.
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/requests">View requests</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>
        <section
          className={cn('min-h-0 min-w-0', !id && 'hidden md:block')}
          aria-label="Selected conversation"
        >
          {id ? (
            <ChatPanel key={id} id={id} onChange={resource.reload} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-2xl border bg-muted/40 p-4">
                <MessageSquare className="size-7 text-primary/70" />
              </div>
              <h2 className="text-lg font-semibold">
                Good games start with a conversation.
              </h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Choose a chat to plan availability, find a venue, and put a game
                on the calendar.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
export default function MessagesPage() {
  return (
    <Suspense fallback={<p role="status">Loading inbox…</p>}>
      <Inbox />
    </Suspense>
  );
}
