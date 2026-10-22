'use client';
import { useState } from 'react';
import Link from 'next/link';
import ReportButton from '@/components/ReportButton';
import { useAuth } from '@clerk/nextjs';
import { Trophy, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
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
  BusyLabel,
  Field,
} from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
import { useResource } from '@/lib/use-resource';
import { useSports } from '@/lib/use-sports';
import { request } from '@/lib/api';
import { Profile } from '@/lib/types';
import { refreshActivity } from '@/lib/social-types';
type Tournament = {
  id: string;
  host_id: string;
  title: string;
  sport: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  participant_count: number;
  rules: string;
  status: string;
  is_registered: boolean;
};
const transitions: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  published: ['registration_open', 'cancelled'],
  registration_open: ['registration_closed', 'cancelled'],
  registration_closed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
};
const empty = {
  title: '',
  sport: '',
  city: '',
  venue: '',
  starts_at: '',
  ends_at: '',
  capacity: 16,
  rules: '',
};
export default function Tournaments() {
  const { getToken } = useAuth();
  const me = useResource<Profile>('/api/v1/users/me');
  const sports = useSports();
  const [page, setPage] = useState(1),
    [sport, setSport] = useState('all');
  const events = useResource<{ items: Tournament[] }>(
    `/api/v1/tournaments?page=${page}${sport === 'all' ? '' : `&sport=${encodeURIComponent(sport)}`}`,
  );
  const organizer = useResource<{
    status: string;
    organization: string;
    experience: string;
  }>('/api/v1/organizers/me');
  const [dialog, setDialog] = useState<'organizer' | 'create' | null>(null),
    [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [organization, setOrganization] = useState(''),
    [experience, setExperience] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Tournament | null>(null);
  const [reason, setReason] = useState(''),
    [nextStatus, setNextStatus] = useState('');
  const [participantsFor, setParticipantsFor] = useState<Tournament | null>(
    null,
  );
  const participants = useResource<{
    items: { id: string; name: string; avatar_url: string | null }[];
  }>(
    participantsFor
      ? `/api/v1/tournaments/${participantsFor.id}/participants`
      : null,
  );
  async function mutate(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError('');
    try {
      await request(path, await getToken(), {
        method,
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      await Promise.all([events.reload(), organizer.reload()]);
      refreshActivity();
      setDialog(null);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="A bigger stage for your game"
        title="Tournaments."
        description="Find your next competition, or bring your local players together."
        action={
          <Button
            onClick={() => {
              setEditingId(null);
              setForm({ ...empty, sport: sports.data?.[0] || '' });
              setDialog('create');
            }}
          >
            <Plus />
            Create a draft
          </Button>
        }
      />
      <Card className="border-primary/15 bg-accent/40 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Want to host?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizer status:{' '}
              <span className="capitalize">
                {organizer.data?.status.replaceAll('_', ' ') || 'Loading…'}
              </span>
              . Verification is required before submission.
            </p>
          </div>
          {['not_applied', 'rejected'].includes(
            organizer.data?.status || '',
          ) && (
            <Button variant="outline" onClick={() => setDialog('organizer')}>
              Apply for verification
            </Button>
          )}
        </CardContent>
      </Card>
      <div className="max-w-xs">
        <OptionSelect
          label="Sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All sports' },
            ...(sports.data || []),
          ]}
        />
      </div>
      <ErrorNotice
        message={error || events.error || organizer.error || sports.error}
        retry={events.reload}
      />
      {events.loading && !events.data ? (
        <CardSkeletons />
      ) : events.data?.items.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {events.data.items.map((t) => (
            <Card key={t.id} className="shadow-none">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Trophy className="size-6 text-primary" />
                  <Badge variant="secondary" className="capitalize">
                    {t.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>
                  {t.sport} · {new Date(t.starts_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="flex gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {t.venue}, {t.city}
                </p>
                <p className="text-sm">
                  {t.participant_count} / {t.capacity} registered
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {t.rules || 'Contact the organizer for tournament rules.'}
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 border-t">
                {t.host_id === me.data?.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setParticipantsFor(t)}
                    >
                      Participants
                    </Button>
                    {t.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const local = (value: string) => {
                            const d = new Date(value);
                            return new Date(
                              d.getTime() - d.getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16);
                          };
                          setEditingId(t.id);
                          setForm({
                            title: t.title,
                            sport: t.sport,
                            city: t.city,
                            venue: t.venue,
                            capacity: t.capacity,
                            rules: t.rules,
                            starts_at: local(t.starts_at),
                            ends_at: local(t.ends_at),
                          });
                          setDialog('create');
                        }}
                      >
                        Edit draft
                      </Button>
                    )}
                    {(transitions[t.status] || []).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={status === 'cancelled' ? 'ghost' : 'default'}
                        onClick={() => {
                          setSelected(t);
                          setNextStatus(status);
                          setReason('');
                        }}
                      >
                        {status === 'pending_approval'
                          ? 'Submit for approval'
                          : status.replaceAll('_', ' ')}
                      </Button>
                    ))}
                  </>
                ) : t.is_registered ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/api/v1/tournaments/${t.id}/register`,
                        'DELETE',
                      )
                    }
                  >
                    Cancel registration
                  </Button>
                ) : (
                  <Button
                    disabled={
                      busy ||
                      t.status !== 'registration_open' ||
                      t.participant_count >= t.capacity
                    }
                    onClick={() =>
                      void mutate(
                        `/api/v1/tournaments/${t.id}/register`,
                        'POST',
                      )
                    }
                  >
                    {t.participant_count >= t.capacity
                      ? 'Full'
                      : t.status === 'registration_open'
                        ? 'Register'
                        : 'Registration closed'}
                  </Button>
                )}
                <ReportButton type="tournament" id={t.id} name={t.title} />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your next competition is on its way"
          description="Published tournaments and your own drafts appear here."
        />
      )}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={page === 1 || events.loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button
          variant="outline"
          disabled={events.loading || (events.data?.items.length || 0) < 24}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'organizer'
                ? 'Organizer application'
                : editingId
                  ? 'Edit tournament draft'
                  : 'Create tournament draft'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'organizer'
                ? 'Tell our moderators about your experience.'
                : 'Drafts are private until reviewed and published.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(
                dialog === 'organizer'
                  ? '/api/v1/organizers/me'
                  : editingId
                    ? `/api/v1/tournaments/${editingId}`
                    : '/api/v1/tournaments',
                dialog === 'organizer' || !editingId ? 'POST' : 'PATCH',
                dialog === 'organizer'
                  ? { organization, experience }
                  : {
                      ...form,
                      starts_at: new Date(form.starts_at).toISOString(),
                      ends_at: new Date(form.ends_at).toISOString(),
                    },
              );
            }}
          >
            <ErrorNotice message={error} />
            {dialog === 'organizer' ? (
              <>
                <Field id="organization" label="Organization">
                  <Input
                    id="organization"
                    required
                    minLength={2}
                    maxLength={150}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                  />
                </Field>
                <Field id="experience" label="Organizing experience">
                  <Textarea
                    id="experience"
                    required
                    minLength={20}
                    maxLength={2000}
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                {(['title', 'city', 'venue'] as const).map((key) => (
                  <Field
                    key={key}
                    id={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                  >
                    <Input
                      id={key}
                      required
                      minLength={2}
                      maxLength={
                        key === 'title' ? 120 : key === 'city' ? 160 : 180
                      }
                      value={form[key]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </Field>
                ))}
                <OptionSelect
                  label="Sport"
                  value={form.sport}
                  onChange={(sport) => setForm((f) => ({ ...f, sport }))}
                  options={sports.data || []}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {(['starts_at', 'ends_at'] as const).map((key) => (
                    <Field
                      key={key}
                      id={key}
                      label={
                        key === 'starts_at'
                          ? 'Starts (local time)'
                          : 'Ends (local time)'
                      }
                    >
                      <Input
                        id={key}
                        type="datetime-local"
                        required
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Field id="capacity" label="Participant capacity">
                  <Input
                    id="capacity"
                    type="number"
                    min={2}
                    max={10000}
                    required
                    value={form.capacity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        capacity: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field id="rules" label="Rules">
                  <Textarea
                    id="rules"
                    maxLength={5000}
                    value={form.rules}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rules: e.target.value }))
                    }
                  />
                </Field>
              </>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                <BusyLabel busy={busy}>
                  {dialog === 'organizer' ? 'Submit application' : 'Save draft'}
                </BusyLabel>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {nextStatus.replaceAll('_', ' ')}</DialogTitle>
            <DialogDescription>{selected?.title}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selected)
                void mutate(
                  `/api/v1/tournaments/${selected.id}/transition`,
                  'POST',
                  { status: nextStatus, reason },
                );
            }}
          >
            <ErrorNotice message={error} />
            <Field id="transition-reason" label="Reason">
              <Textarea
                id="transition-reason"
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button disabled={busy}>
                <BusyLabel busy={busy}>Confirm change</BusyLabel>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!participantsFor}
        onOpenChange={(open) => {
          if (!open) setParticipantsFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registered players</DialogTitle>
            <DialogDescription>{participantsFor?.title}</DialogDescription>
          </DialogHeader>
          <ErrorNotice message={participants.error} />
          {participants.loading ? (
            <CardSkeletons />
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {participants.data?.items.length ? (
                participants.data.items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/players/${p.id}`}
                    className="block text-sm text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No registrations yet.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
