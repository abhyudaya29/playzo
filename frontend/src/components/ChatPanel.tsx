'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  ArrowLeft,
  Send,
  ShieldBan,
  MessageSquare,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorNotice, BusyLabel } from '@/components/page-ui';
import ScheduleGameDialog from '@/components/ScheduleGameDialog';
import { useResource } from '@/lib/use-resource';
import { useConversationSocket } from '@/lib/use-conversation-socket';
import {
  ChatMessage,
  Conversation,
  MessageHistory,
  refreshActivity,
} from '@/lib/social-types';
import { Profile } from '@/lib/types';
import { ApiError, request } from '@/lib/api';
import { cn } from '@/lib/utils';
function mergeMessages(first: ChatMessage[], second: ChatMessage[]) {
  return [
    ...new Map(
      [...first, ...second].map((message) => [message.id, message]),
    ).values(),
  ].sort((a, b) => a.id - b.id);
}
export default function ChatPanel({
  id,
  onChange,
}: {
  id: string;
  onChange: () => void;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const profile = useResource<Profile>('/api/v1/users/me');
  const detail = useResource<Conversation>(`/api/v1/conversations/${id}`);
  const history = useResource<MessageHistory>(
    `/api/v1/conversations/${id}/messages`,
    5000,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [nextBefore, setNextBefore] = useState<number | null>(null),
    [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [revoked, setRevoked] = useState(false),
    [blocking, setBlocking] = useState(false),
    [confirmBlock, setConfirmBlock] = useState(false),
    [notice, setNotice] = useState('');
  const pending = useRef<{ body: string; clientId: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastRead = useRef(0);
  const readVisible = useRef<() => void>(() => {});
  const olderLoaded = useRef(false);
  const status = useConversationSocket(
    id,
    () => {
      history.reload();
      detail.reload();
      onChange();
      refreshActivity();
    },
    () => {
      setRevoked(true);
      setMessages([]);
      onChange();
      refreshActivity();
    },
  );
  const denied =
    revoked ||
    [403, 404].includes(history.errorStatus || 0) ||
    [403, 404].includes(detail.errorStatus || 0);
  useEffect(() => {
    if (denied) {
      setMessages([]);
      return;
    }
    if (!history.data) return;
    setMessages((old) => mergeMessages(old, history.data!.messages));
    if (!olderLoaded.current) setNextBefore(history.data.next_before);
  }, [history.data, denied]);
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (!lastId || denied) return;
    if (nearBottom.current)
      end.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    async function read() {
      if (
        document.visibilityState !== 'visible' ||
        !nearBottom.current ||
        (lastId || 0) <= lastRead.current
      )
        return;
      try {
        await request(`/api/v1/conversations/${id}/read`, await getToken(), {
          method: 'PATCH',
          body: JSON.stringify({ last_read_message_id: lastId }),
        });
        lastRead.current = Math.max(lastRead.current, lastId || 0);
        onChange();
        refreshActivity();
      } catch {
        /* Keep the unread indicator when marking read fails. */
      }
    }
    readVisible.current = read;
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
      readVisible.current = () => {};
    };
  }, [lastId, id, getToken, denied]);
  async function loadOlder() {
    if (!nextBefore) return;
    setLoadingOlder(true);
    setError('');
    const area = scrollArea.current;
    const previousHeight = area?.scrollHeight || 0;
    try {
      const result = await request<MessageHistory>(
        `/api/v1/conversations/${id}/messages?before=${nextBefore}`,
        await getToken(),
      );
      olderLoaded.current = true;
      setMessages((old) => mergeMessages(result.messages, old));
      setNextBefore(result.next_before);
      requestAnimationFrame(() => {
        if (area) area.scrollTop = area.scrollHeight - previousHeight;
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load earlier messages.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || denied) return;
    setSending(true);
    setError('');
    if (pending.current?.body !== body)
      pending.current = { body, clientId: crypto.randomUUID() };
    try {
      const result = await request<ChatMessage>(
        `/api/v1/conversations/${id}/messages`,
        await getToken(),
        {
          method: 'POST',
          body: JSON.stringify({ body, client_id: pending.current.clientId }),
        },
      );
      nearBottom.current = true;
      setMessages((old) => mergeMessages(old, [result]));
      setDraft('');
      pending.current = null;
      onChange();
      refreshActivity();
    } catch (e) {
      if (e instanceof ApiError && [403, 404].includes(e.status))
        setRevoked(true);
      setError(
        e instanceof Error
          ? e.message
          : 'Message not sent. Your draft is saved here; try again.',
      );
    } finally {
      setSending(false);
    }
  }
  const peer =
    detail.data?.kind === 'direct' && profile.data
      ? detail.data.members.find((member) => member.id !== profile.data?.id)
      : undefined;
  async function block() {
    if (!peer) return;
    setBlocking(true);
    try {
      await request('/api/v1/blocks', await getToken(), {
        method: 'POST',
        body: JSON.stringify({ blocked_id: peer.id }),
      });
      setRevoked(true);
      setMessages([]);
      setConfirmBlock(false);
      router.replace('/messages');
      onChange();
      refreshActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not block this player.');
    } finally {
      setBlocking(false);
    }
  }
  if (denied)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <ShieldBan className="size-7 text-muted-foreground" />
        <h2 className="font-semibold">This conversation isn’t available</h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          You need an accepted connection or active membership. Chat is
          unavailable if a participant is blocked.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            router.replace('/messages');
            onChange();
          }}
        >
          Back to inbox
        </Button>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to inbox"
            className="md:hidden"
            onClick={() => router.replace('/messages')}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {detail.data?.title || 'Loading conversation…'}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="capitalize">
                {detail.data?.kind || 'Private'} chat
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                {status === 'live' ? (
                  <>
                    <Wifi className="size-2.5" />
                    Live updates
                  </>
                ) : (
                  <>
                    <WifiOff className="size-2.5" />
                    Refreshing every 5s
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {peer && (
            <ScheduleGameDialog
              conversationId={id}
              peerName={peer.name}
              onScheduled={() => {
                history.reload();
                setNotice(
                  'Game created and invitation sent. Your teammate can respond in Requests.',
                );
              }}
            />
          )}
          {detail.data?.kind === 'game' && (
            <Button asChild variant="outline" size="sm">
              <Link href="/games">View games</Link>
            </Button>
          )}
          {peer && (
            <Dialog open={confirmBlock} onOpenChange={setConfirmBlock}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Block ${peer.name}`}
                >
                  <ShieldBan className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Block {peer.name}?</DialogTitle>
                  <DialogDescription>
                    You won’t be able to connect, invite, or chat while blocked.
                    You can unblock this player from your inbox.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmBlock(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={blocking}
                    onClick={block}
                  >
                    Block player
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>
      {notice && (
        <Alert className="m-3 w-auto">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div
        ref={scrollArea}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
        role="log"
        aria-label="Message history"
        aria-live="polite"
        onScroll={(event) => {
          const area = event.currentTarget;
          nearBottom.current =
            area.scrollHeight - area.scrollTop - area.clientHeight < 100;
          if (nearBottom.current) readVisible.current();
        }}
      >
        {nextBefore && (
          <div className="mb-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={loadingOlder}
              onClick={loadOlder}
            >
              <BusyLabel busy={loadingOlder}>Load earlier messages</BusyLabel>
            </Button>
          </div>
        )}
        {history.loading && !history.data ? (
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            Loading messages…
          </p>
        ) : !messages.length && !history.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
            <MessageSquare className="size-7 text-primary/50" />
            <p className="text-sm font-medium">Say hello. Make a plan.</p>
            <p className="max-w-xs text-xs leading-5 text-muted-foreground">
              Coordinate availability and a venue, then turn your conversation
              into a game.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const own = message.sender_id === profile.data?.id;
              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex flex-col items-start',
                    own && 'items-end',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl rounded-tl-sm border bg-muted/50 px-3.5 py-2.5 sm:max-w-[78%]',
                      own &&
                        'rounded-tl-2xl rounded-tr-sm border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {!own && (
                      <p className="mb-1 text-[10px] font-semibold text-primary">
                        {message.sender_name}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                      {message.body}
                    </p>
                  </div>
                  <time
                    dateTime={message.created_at}
                    className="mt-1 px-1 text-[10px] text-muted-foreground"
                  >
                    {new Date(message.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              );
            })}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="border-t p-3 sm:p-4">
        <ErrorNotice
          message={error || history.error || detail.error}
          retry={() => {
            history.reload();
            detail.reload();
          }}
        />
        <form onSubmit={send} className="flex items-end gap-2">
          <Textarea
            aria-label="Message"
            placeholder="Find a time to play…"
            rows={2}
            maxLength={4000}
            value={draft}
            disabled={sending || !detail.data || !profile.data}
            onChange={(event) => setDraft(event.target.value)}
            className="max-h-32 min-h-16 resize-none"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0"
            disabled={sending || !draft.trim() || !detail.data || !profile.data}
            aria-label="Send message"
          >
            <BusyLabel busy={sending}>{!sending && <Send />}</BusyLabel>
          </Button>
        </form>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Enter to send · Shift + Enter for a new line
          {draft.length > 3500 && ` · ${draft.length}/4000`}
        </p>
      </div>
    </div>
  );
}
