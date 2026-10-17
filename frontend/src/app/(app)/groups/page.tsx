'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Users, MapPin, Plus, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { refreshActivity } from '@/lib/social-types';
import { request, sports } from '@/lib/api';
type Group = {
  id: string;
  name: string;
  description: string;
  sport: string;
  locality: string;
  member_count: number;
  is_member: boolean;
  request_status: string | null;
  conversation_id: string | null;
};
export default function Groups() {
  const { getToken } = useAuth();
  const { data, error, loading, reload } = useResource<Group[]>(
    '/api/v1/groups',
    10000,
  );
  const [show, setShow] = useState(false),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [sport, setSport] = useState('Badminton'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [formError, setFormError] = useState(''),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState('');
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create');
    setFormError('');
    try {
      await request('/api/v1/groups', await getToken(), {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          sport,
        }),
      });
      setShow(false);
      setName('');
      setDescription('');
      refreshActivity();
      await reload();
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Could not create community.',
      );
    } finally {
      setBusy('');
    }
  }
  async function join(id: string) {
    setBusy(id);
    setActionError('');
    try {
      await request(`/api/v1/groups/${id}/join`, await getToken(), {
        method: 'POST',
      });
      refreshActivity();
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Could not join community.',
      );
    } finally {
      setBusy('');
    }
  }
  const filtered = (data || []).filter(
    (group) =>
      (filter === 'all' || group.sport === filter) &&
      `${group.name} ${group.locality} ${group.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="page-enter space-y-6">
      <PageHeader
        eyebrow="Better together"
        title="Find your people."
        description="Local crews, shared interests, and a reason to get out and play. Find a community that feels like yours."
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
                Create community
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start your own community</DialogTitle>
                <DialogDescription>
                  Bring people together around a sport you love.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="space-y-5">
                <ErrorNotice message={formError} />
                <Field id="group-name" label="Community name">
                  <Input
                    id="group-name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Sunday badminton crew"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field id="group-sport" label="Sport">
                  <OptionSelect
                    id="group-sport"
                    label="Community sport"
                    value={sport}
                    onChange={setSport}
                    options={sports}
                  />
                </Field>
                <Field id="group-description" label="About your community">
                  <Textarea
                    id="group-description"
                    placeholder="Who is it for? When do you usually play?"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!!busy}
                    onClick={() => setShow(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={!!busy || name.trim().length < 2}>
                    <BusyLabel busy={busy === 'create'}>
                      Create community
                    </BusyLabel>
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Search communities"
            className="bg-white pl-9"
            placeholder="Search by name or neighborhood…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <OptionSelect
            label="Filter by sport"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: 'All sports' }, ...sports]}
          />
        </div>
      </div>
      <ErrorNotice message={actionError || error} retry={reload} />
      {loading && !data ? (
        <CardSkeletons />
      ) : error && !data ? null : filtered.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length}{' '}
            {filtered.length === 1 ? 'community' : 'communities'} to explore
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((group) => (
              <Card
                key={group.id}
                className="gap-5 shadow-none transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-xl bg-accent p-3">
                      <Users className="size-5 text-primary" />
                    </div>
                    <Badge variant="outline">{group.sport}</Badge>
                  </div>
                  <CardTitle className="text-lg leading-6">
                    {group.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <p className="min-h-12 text-sm leading-6 text-muted-foreground">
                    {group.description ||
                      'A local crew ready for the next game. Everyone starts somewhere.'}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" />
                      {group.member_count} members
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {group.locality || 'Local community'}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="border-t">
                  {group.is_member ? (
                    <Button className="w-full" variant="outline" asChild>
                      <Link
                        href={
                          group.conversation_id
                            ? `/messages?conversation=${group.conversation_id}`
                            : '/messages'
                        }
                      >
                        Open community chat
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!!busy || !!group.request_status}
                      onClick={() => join(group.id)}
                    >
                      <BusyLabel busy={busy === group.id}>
                        {group.request_status === 'pending'
                          ? 'Request pending'
                          : group.request_status === 'declined'
                            ? 'Request declined'
                            : 'Request to join'}
                      </BusyLabel>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title={
            search || filter !== 'all'
              ? 'No communities match your search'
              : 'Be the first to bring people together'
          }
          description="Start a community for your favorite sport and make your next game a regular thing."
          action={
            <Button variant="outline" onClick={() => setShow(true)}>
              <Plus />
              Create a community
            </Button>
          }
        />
      )}
    </div>
  );
}
