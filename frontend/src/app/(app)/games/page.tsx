'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { CalendarDays, MapPin, Users, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { refreshActivity } from '@/lib/social-types';
import { Input } from '@/components/ui/input';
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
import {
  PageHeader,
  ErrorNotice,
  EmptyState,
  CardSkeletons,
  Field,
  BusyLabel,
} from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
import { useResource } from '@/lib/use-resource';
import { request, sports } from '@/lib/api';
type Game = {
  id: string;
  title: string;
  sport: string;
  locality: string;
  venue: string;
  starts_at: string;
  capacity: number;
  participant_count: number;
  is_joined: boolean;
  status: string;
  approval_required: boolean;
  request_status: string | null;
  conversation_id: string | null;
};
export default function Games() {
  const { getToken } = useAuth();
  const { data, error, loading, reload } = useResource<Game[]>(
    '/api/v1/games',
    10000,
  );
  const [show, setShow] = useState(false),
    [title, setTitle] = useState(''),
    [sport, setSport] = useState('Badminton'),
    [venue, setVenue] = useState(''),
    [starts, setStarts] = useState(''),
    [capacity, setCapacity] = useState('4'),
    [approvalRequired, setApprovalRequired] = useState(false),
    [filter, setFilter] = useState('all'),
    [formError, setFormError] = useState(''),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState('');
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (new Date(starts).getTime() <= Date.now()) {
      setFormError('Choose a start time in the future.');
      return;
    }
    setBusy('create');
    setFormError('');
    try {
      await request('/api/v1/games', await getToken(), {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          sport,
          venue: venue.trim(),
          starts_at: new Date(starts).toISOString(),
          capacity: Number(capacity),
          approval_required: approvalRequired,
        }),
      });
      setShow(false);
      setTitle('');
      setVenue('');
      setStarts('');
      refreshActivity();
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not publish game.');
    } finally {
      setBusy('');
    }
  }
  async function join(id: string) {
    setBusy(id);
    setActionError('');
    try {
      await request(`/api/v1/games/${id}/join`, await getToken(), {
        method: 'POST',
      });
      refreshActivity();
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not join game.');
    } finally {
      setBusy('');
    }
  }
  const filtered = (data || []).filter(
    (game) =>
      filter === 'all' ||
      (filter === 'joined' ? game.is_joined : game.sport === filter),
  );
  return (
    <div className="page-enter space-y-6">
      <PageHeader
        eyebrow="Make time to play"
        title="Your next game is waiting."
        description="Find an open spot, meet a few new faces, and make this week a little more active."
        action={
          <Dialog
            open={show}
            onOpenChange={(value) => {
              if (!busy) {
                setShow(value);
                setFormError('');
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Host a game
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90svh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Put a game on the calendar</DialogTitle>
                <DialogDescription>
                  Choose a place and time. Your next teammates can take it from
                  there.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="space-y-5">
                <ErrorNotice message={formError} />
                <Field id="game-title" label="Game title">
                  <Input
                    id="game-title"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Sunday morning doubles"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field id="game-sport" label="Sport">
                    <OptionSelect
                      id="game-sport"
                      label="Game sport"
                      value={sport}
                      onChange={setSport}
                      options={sports}
                    />
                  </Field>
                  <Field id="capacity" label="Total players">
                    <Input
                      id="capacity"
                      type="number"
                      required
                      min={2}
                      max={100}
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                    />
                  </Field>
                </div>
                <Field id="venue" label="Venue">
                  <Input
                    id="venue"
                    required
                    minLength={2}
                    maxLength={180}
                    placeholder="Community sports court"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                  />
                </Field>
                <Field
                  id="starts"
                  label="Date and time"
                  description="Times use your device’s local timezone."
                >
                  <Input
                    id="starts"
                    type="datetime-local"
                    required
                    value={starts}
                    onChange={(e) => setStarts(e.target.value)}
                  />
                </Field>
                <Label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={approvalRequired}
                    onCheckedChange={(value) =>
                      setApprovalRequired(value === true)
                    }
                  />
                  Approve player requests before they join
                </Label>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!!busy}
                    onClick={() => setShow(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={!!busy}>
                    <BusyLabel busy={busy === 'create'}>Publish game</BusyLabel>
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('all')}
          >
            All games
          </Button>
          <Button
            size="sm"
            variant={filter === 'joined' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('joined')}
          >
            Your games
          </Button>
        </div>
        <div className="w-44">
          <OptionSelect
            label="Game filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All sports' },
              { value: 'joined', label: 'Your games' },
              ...sports,
            ]}
          />
        </div>
      </div>
      <ErrorNotice message={actionError || error} retry={reload} />
      {loading && !data ? (
        <CardSkeletons />
      ) : error && !data ? null : filtered.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((game) => {
            const start = new Date(game.starts_at);
            const full = game.participant_count >= game.capacity;
            return (
              <Card
                key={game.id}
                className="gap-5 shadow-none transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex size-14 flex-col items-center justify-center rounded-xl border bg-muted/50">
                      <span className="text-[10px] font-semibold uppercase text-primary">
                        {start.toLocaleDateString(undefined, {
                          month: 'short',
                        })}
                      </span>
                      <span className="text-xl font-semibold">
                        {start.getDate()}
                      </span>
                    </div>
                    <Badge variant={game.is_joined ? 'secondary' : 'outline'}>
                      {game.is_joined
                        ? 'You’re playing'
                        : full
                          ? 'Full'
                          : game.status === 'open'
                            ? 'Open spots'
                            : 'Closed'}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg leading-6">
                    {game.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {game.sport} · {game.locality || 'Local game'}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0" />
                    {start.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    ·{' '}
                    {start.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 shrink-0" />
                    {game.venue}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="size-4 shrink-0" />
                    {game.participant_count} / {game.capacity} players
                  </p>
                </CardContent>
                <CardFooter className="justify-between gap-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {Math.max(0, game.capacity - game.participant_count)} spots
                    left
                  </span>
                  {game.is_joined ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={
                          game.conversation_id
                            ? `/messages?conversation=${game.conversation_id}`
                            : '/messages'
                        }
                      >
                        Game chat
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={
                        !!busy ||
                        full ||
                        game.status !== 'open' ||
                        !!game.request_status
                      }
                      onClick={() => join(game.id)}
                    >
                      <BusyLabel busy={busy === game.id}>
                        {full
                          ? 'Full'
                          : game.status !== 'open'
                            ? 'Closed'
                            : game.request_status === 'pending'
                              ? 'Request pending'
                              : game.request_status === 'declined'
                                ? 'Declined'
                                : game.approval_required
                                  ? 'Request a spot'
                                  : 'Join game'}
                      </BusyLabel>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            filter === 'joined'
              ? 'Your calendar is open'
              : 'The next game could be yours'
          }
          description={
            filter === 'joined'
              ? 'Join an upcoming game and it will appear here.'
              : 'No upcoming games match this view. Host a game and give your community something to look forward to.'
          }
          action={
            <Button
              variant="outline"
              onClick={() =>
                filter === 'joined' ? setFilter('all') : setShow(true)
              }
            >
              {filter === 'joined' ? (
                'Explore all games'
              ) : (
                <>
                  <Plus />
                  Host a game
                </>
              )}
            </Button>
          }
        />
      )}
    </div>
  );
}
