'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
  CardSkeletons,
  EmptyState,
  Field,
  BusyLabel,
} from '@/components/page-ui';
import PlayerPhoto from '@/components/PlayerPhoto';
import { OptionSelect } from '@/components/option-select';
import { useResource } from '@/lib/use-resource';
import { useSports } from '@/lib/use-sports';
import { API, request } from '@/lib/api';
import { Profile } from '@/lib/types';

type Row = Record<string, unknown> & { id: string };
type Page = { items: Row[]; total: number; page: number; page_size: number };
const label = (value: string) =>
  value.replaceAll('_', ' ').replaceAll('-', ' ');
function render(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value))
    return (
      value
        .map((x) =>
          typeof x === 'object' && x !== null
            ? String(x.name || x.title || x.sport || '')
            : String(x),
        )
        .join(', ') || '—'
    );
  if (typeof value === 'object')
    return Object.entries(value)
      .map(
        ([k, v]) =>
          `${label(k)}: ${typeof v === 'object' ? 'updated' : String(v)}`,
      )
      .join(' · ');
  return String(value);
}
export function BarChart({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number }[];
}) {
  const max = Math.max(1, ...items.map((x) => x.count));
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length ? (
          items.map((i) => (
            <div key={i.name}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="capitalize text-muted-foreground">
                  {label(i.name)}
                </span>
                <span>{i.count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(100 * i.count) / max}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No data in this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
export function AdminOverview() {
  const [days, setDays] = useState('30');
  const [customStart, setCustomStart] = useState(''),
    [customEnd, setCustomEnd] = useState('');
  const [end] = useState(() => new Date());
  const start =
    days === 'custom'
      ? customStart
        ? new Date(customStart).toISOString()
        : ''
      : new Date(end.getTime() - Number(days) * 86400000).toISOString();
  const until =
    days === 'custom'
      ? customEnd
        ? new Date(`${customEnd}T23:59:59`).toISOString()
        : ''
      : end.toISOString();
  const data = useResource<{
    metrics: Record<string, number>;
    registrations: { date: string; count: number }[];
    definitions: string;
  }>(
    start && until
      ? `/api/v1/admin/overview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(until)}`
      : null,
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operational overview"
        title="Your local playground, in numbers."
        description="Live operational counts from PostgreSQL."
      />
      <div className="flex flex-wrap gap-3">
        <OptionSelect
          label="Date range"
          value={days}
          onChange={setDays}
          options={[
            { value: '1', label: 'Last 24 hours' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
            { value: 'custom', label: 'Custom range' },
          ]}
        />
        {days === 'custom' && (
          <>
            <Input
              type="date"
              aria-label="Start date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-auto"
            />
            <Input
              type="date"
              aria-label="End date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-auto"
            />
          </>
        )}
      </div>
      <ErrorNotice message={data.error} retry={data.reload} />
      {data.loading && !data.data ? (
        <CardSkeletons />
      ) : (
        data.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(data.data.metrics).map(([key, value]) => (
                <Card key={key} className="gap-3 shadow-none">
                  <CardHeader>
                    <CardDescription className="capitalize">
                      {label(key)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold text-primary">
                      {value.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <BarChart
              title="Registration trend · Asia/Kolkata"
              items={data.data.registrations.map((r) => ({
                name: r.date,
                count: r.count,
              }))}
            />
            <p className="text-xs leading-6 text-muted-foreground">
              {data.data.definitions}
            </p>
          </>
        )
      )}
    </div>
  );
}

type Action = {
  path: string;
  method: string;
  title: string;
  body?: Record<string, unknown>;
};
function ActionDialog({
  action,
  onClose,
  onSaved,
}: {
  action: Action | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getToken } = useAuth();
  const [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setReason('');
    setConfirmed(false);
    setNotes('');
    setError('');
  }, [action]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!action || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      await request(action.path, await getToken(), {
        method: action.method,
        body: JSON.stringify({
          ...action.body,
          reason,
          ...(action.path.includes('/reports/')
            ? { internal_notes: notes }
            : {}),
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete action.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!action}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.title}</DialogTitle>
          <DialogDescription>
            This action is recorded in the administrative audit log.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <ErrorNotice message={error} />
          <Field id="admin-reason" label="Reason">
            <Textarea
              id="admin-reason"
              minLength={5}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {action?.path.includes('/reports/') && (
            <Field id="internal-notes" label="Internal moderation notes">
              <Textarea
                id="internal-notes"
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          )}
          <Label>
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            I confirm this action.
          </Label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button disabled={busy || !confirmed}>
              <BusyLabel busy={busy}>Confirm action</BusyLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
const columns: Record<string, string[]> = {
  users: [
    'name',
    'city',
    'sports',
    'onboarding_completed',
    'account_status',
    'last_active_at',
    'created_at',
  ],
  activity: [
    'user_name',
    'event_name',
    'created_at',
    'entity_type',
    'metadata',
  ],
  groups: ['name', 'sport', 'locality', 'owner', 'members'],
  games: [
    'title',
    'sport',
    'host',
    'participants',
    'capacity',
    'status',
    'starts_at',
  ],
  tournaments: [
    'title',
    'organizer',
    'sport',
    'city',
    'status',
    'participant_count',
    'starts_at',
  ],
  organizers: ['name', 'organization', 'experience', 'status', 'submitted_at'],
  reports: ['target_type', 'reason', 'status', 'internal_notes', 'created_at'],
  'audit-logs': [
    'actor',
    'action',
    'target_type',
    'reason',
    'changes',
    'created_at',
  ],
};
export function AdminTable({
  section,
  userId,
}: {
  section: string;
  userId?: string;
}) {
  const { getToken } = useAuth();
  const me = useResource<Profile>('/api/v1/users/me');
  const catalog = useSports();
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [city, setCity] = useState(''),
    [sport, setSport] = useState('all'),
    [onboarded, setOnboarded] = useState('all');
  const [eventName, setEventName] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const [action, setAction] = useState<Action | null>(null),
    [error, setError] = useState('');
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('q', search);
  if (city) params.set('city', city);
  if (status !== 'all') params.set('status', status);
  if (sport !== 'all') params.set('sport', sport);
  if (onboarded !== 'all') params.set('onboarded', onboarded);
  if (userId) params.set('user_id', userId);
  if (eventName) params.set('event_name', eventName);
  if (start) params.set('start', new Date(start).toISOString());
  if (end) params.set('end', new Date(`${end}T23:59:59`).toISOString());
  const resource = useResource<Page>(`/api/v1/admin/${section}?${params}`);
  const operations = ['SUPER_ADMIN', 'OPERATIONS_ADMIN'].includes(
    me.data?.role || '',
  );
  const moderator = operations || me.data?.role === 'TOURNAMENT_MODERATOR';
  const review = (
    path: string,
    title: string,
    body?: Record<string, unknown>,
    method = 'POST',
  ) => setAction({ path, method, title, body });
  async function exportCsv() {
    setError('');
    try {
      const p = new URLSearchParams(params);
      p.delete('page');
      const res = await fetch(`${API}/api/v1/admin/activity/export?${p}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(
          typeof body.detail === 'string' ? body.detail : 'Export failed',
        );
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'playzo-activity.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize">
          {userId ? 'Activity timeline' : label(section)}
        </h1>
        {section === 'activity' && operations && (
          <Button variant="outline" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        )}
      </div>
      {['users', 'activity', 'reports'].includes(section) && (
        <Card className="shadow-none">
          <CardContent className="flex flex-wrap items-end gap-3">
            {section !== 'reports' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(q);
                  setPage(1);
                }}
                className="flex gap-2"
              >
                <Input
                  aria-label="Search players"
                  placeholder="Search players by name"
                  value={q}
                  maxLength={150}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button variant="outline">Search</Button>
              </form>
            )}
            {section === 'users' && (
              <>
                <OptionSelect
                  label="Account status"
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                  ]}
                />
                <OptionSelect
                  label="Onboarding"
                  value={onboarded}
                  onChange={(v) => {
                    setOnboarded(v);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All profiles' },
                    { value: 'true', label: 'Completed' },
                    { value: 'false', label: 'Incomplete' },
                  ]}
                />
              </>
            )}
            {section === 'reports' && (
              <OptionSelect
                label="Report status"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={[
                  'all',
                  'open',
                  'in_review',
                  'resolved',
                  'dismissed',
                ].map((v) => ({ value: v, label: label(v) }))}
              />
            )}
            {section !== 'reports' && (
              <>
                <Input
                  aria-label="City filter"
                  placeholder="City"
                  maxLength={160}
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
                <OptionSelect
                  label="Sport filter"
                  value={sport}
                  onChange={(v) => {
                    setSport(v);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All sports' },
                    ...(catalog.data || []),
                  ]}
                />
              </>
            )}
            {section === 'activity' && (
              <>
                <Input
                  aria-label="Event type"
                  placeholder="e.g. connection_accepted"
                  maxLength={60}
                  value={eventName}
                  onChange={(e) => {
                    setEventName(e.target.value);
                    setPage(1);
                  }}
                  className="w-56"
                />
                <Field id="activity-start" label="Start date">
                  <Input
                    id="activity-start"
                    type="date"
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      setPage(1);
                    }}
                  />
                </Field>
                <Field id="activity-end" label="End date">
                  <Input
                    id="activity-end"
                    type="date"
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setPage(1);
                    }}
                  />
                </Field>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <ErrorNotice message={error || resource.error} retry={resource.reload} />
      {resource.loading && !resource.data ? (
        <CardSkeletons />
      ) : resource.data?.items.length ? (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                {columns[section]?.map((key) => (
                  <th
                    key={key}
                    className="whitespace-nowrap px-4 py-3 text-xs font-medium capitalize text-muted-foreground"
                  >
                    {label(key)}
                  </th>
                ))}
                {['users', 'reports', 'tournaments', 'organizers'].includes(
                  section,
                ) && <th className="px-4 py-3 text-xs">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  {columns[section]?.map((key) => (
                    <td key={key} className="max-w-xs px-4 py-4">
                      <div className="break-words">
                        {section === 'users' && key === 'name' ? (
                          <Link
                            href={`/admin/users/${row.id}`}
                            className="flex items-center gap-3 font-medium text-primary"
                          >
                            <PlayerPhoto
                              name={String(row.name)}
                              url={row.avatar_url as string | null}
                            />
                            {String(row.name)}
                          </Link>
                        ) : key === 'user_name' && row.user_id ? (
                          <Link
                            href={`/admin/users/${row.user_id}`}
                            className="text-primary hover:underline"
                          >
                            {String(row.user_name)}
                          </Link>
                        ) : key.endsWith('_at') && row[key] ? (
                          new Date(String(row[key])).toLocaleString()
                        ) : key === 'status' || key === 'account_status' ? (
                          <Badge variant="secondary" className="capitalize">
                            {label(String(row[key]))}
                          </Badge>
                        ) : key === 'event_name' ? (
                          <span className="capitalize">
                            {label(String(row[key]))}
                          </span>
                        ) : (
                          render(row[key])
                        )}
                      </div>
                    </td>
                  ))}
                  {section === 'users' && (
                    <td className="px-4 py-4">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/users/${row.id}`}>
                          View details
                        </Link>
                      </Button>
                    </td>
                  )}
                  {section === 'reports' && (
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {row.target_type === 'user' && (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/admin/users/${row.target_id}`}>
                              View player
                            </Link>
                          </Button>
                        )}
                        {['in_review', 'resolved', 'dismissed']
                          .filter((s) => s !== row.status)
                          .map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                review(
                                  `/api/v1/admin/reports/${row.id}`,
                                  `Mark report ${label(s)}`,
                                  { status: s },
                                  'PATCH',
                                )
                              }
                            >
                              {label(s)}
                            </Button>
                          ))}
                      </div>
                    </td>
                  )}
                  {section === 'tournaments' && (
                    <td className="px-4 py-4">
                      {moderator && (
                        <div className="flex flex-wrap gap-2">
                          {(row.status === 'pending_approval'
                            ? ['published', 'draft', 'cancelled']
                            : ['completed', 'cancelled'].includes(
                                  String(row.status),
                                )
                              ? []
                              : ['cancelled']
                          ).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                review(
                                  `/api/v1/tournaments/${row.id}/transition`,
                                  s === 'published'
                                    ? 'Approve tournament'
                                    : s === 'draft'
                                      ? 'Return tournament to draft'
                                      : 'Cancel tournament',
                                  { status: s },
                                )
                              }
                            >
                              {s === 'published'
                                ? 'Approve'
                                : s === 'draft'
                                  ? 'Return draft'
                                  : 'Cancel'}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  )}
                  {section === 'organizers' && (
                    <td className="px-4 py-4">
                      {moderator && (
                        <div className="flex flex-wrap gap-2">
                          {['verified', 'rejected', 'suspended']
                            .filter((s) => s !== row.status)
                            .map((s) => (
                              <Button
                                key={s}
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  review(
                                    `/api/v1/admin/organizers/${row.id}/review`,
                                    `${label(s)} organizer`,
                                    { status: s },
                                  )
                                }
                              >
                                {s === 'verified'
                                  ? 'Verify'
                                  : s === 'rejected'
                                    ? 'Reject'
                                    : 'Suspend'}
                              </Button>
                            ))}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !resource.error && (
          <EmptyState
            title="No records found"
            description="Try changing your filters or date range."
          />
        )
      )}
      {resource.data && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={page === 1 || resource.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} · {resource.data.total} records
          </span>
          <Button
            variant="outline"
            disabled={
              page * resource.data.page_size >= resource.data.total ||
              resource.loading
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <ActionDialog
        action={action}
        onClose={() => setAction(null)}
        onSaved={() => void resource.reload()}
      />
    </div>
  );
}
export function AdminUserDetail({ id }: { id: string }) {
  const resource = useResource<Row>(
    `/api/v1/admin/users/${encodeURIComponent(id)}`,
  );
  const me = useResource<Profile>('/api/v1/users/me');
  const [action, setAction] = useState<Action | null>(null);
  const p = resource.data;
  const canManage = ['SUPER_ADMIN', 'OPERATIONS_ADMIN'].includes(
    me.data?.role || '',
  );
  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/admin/users">Back to users</Link>
      </Button>
      <ErrorNotice message={resource.error} retry={resource.reload} />
      {resource.loading && !p ? (
        <CardSkeletons />
      ) : (
        p && (
          <>
            <Card className="shadow-none">
              <CardContent className="flex flex-wrap items-center gap-5">
                <PlayerPhoto
                  name={String(p.name)}
                  url={p.avatar_url as string | null}
                  className="size-20"
                />
                <div className="flex-1">
                  <h1 className="text-2xl font-semibold">{String(p.name)}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {render(p.city)} · {String(p.account_status)} ·{' '}
                    {Number(p.connections)} connections
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {render(p.bio)}
                  </p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {[
                      p.account_status === 'suspended'
                        ? 'reactivate'
                        : 'suspend',
                      p.discovery_visible
                        ? 'restrict-discovery'
                        : 'restore-discovery',
                      'note',
                    ].map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAction({
                            path: `/api/v1/admin/users/${id}/${a}`,
                            method: 'POST',
                            title: label(a),
                          })
                        }
                      >
                        {label(a)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                'sports',
                'participation_interests',
                'groups',
                'games',
                'tournaments',
              ].map((key) => (
                <Card className="shadow-none" key={key}>
                  <CardHeader>
                    <CardTitle className="capitalize">{label(key)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-muted-foreground">
                    {render(p[key])}
                  </CardContent>
                </Card>
              ))}
            </div>
            <AdminTable section="activity" userId={id} />
          </>
        )
      )}
      <ActionDialog
        action={action}
        onClose={() => setAction(null)}
        onSaved={() => void resource.reload()}
      />
    </div>
  );
}
export function AdminAnalytics() {
  const overview = useResource<{
    sports: { name: string; count: number }[];
    cities: { name: string; count: number }[];
    posthog_dashboard_url: string;
    source: string;
  }>('/api/v1/admin/analytics/overview');
  const funnel = useResource<{
    stages: { name: string; count: number }[];
    definition: string;
  }>('/api/v1/admin/analytics/funnel');
  const retention = useResource<{
    items: {
      day: number;
      eligible: number;
      retained: number;
      rate: number | null;
    }[];
    definition: string;
  }>('/api/v1/admin/analytics/retention');
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Metrics with clear sources"
        title="Analytics."
        description="Operational metrics from PostgreSQL; product journeys in PostHog Cloud."
      />
      <ErrorNotice
        message={overview.error || funnel.error || retention.error}
        retry={overview.reload}
      />
      {overview.data && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <BarChart title="Sports popularity" items={overview.data.sports} />
            <BarChart title="Players by city" items={overview.data.cities} />
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {overview.data.source}
          </p>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>PostHog product analytics</CardTitle>
              <CardDescription>
                Explore onboarding, discovery engagement, feature use and
                product retention. Separate PostHog access is required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview.data.posthog_dashboard_url ? (
                <Button asChild variant="outline">
                  <a
                    href={overview.data.posthog_dashboard_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open PostHog dashboard
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  A project dashboard has not been configured. See the platform
                  setup guide.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {funnel.data && (
        <>
          <BarChart
            title="30-day player activation funnel"
            items={funnel.data.stages}
          />
          <p className="text-xs leading-6 text-muted-foreground">
            {funnel.data.definition}
          </p>
        </>
      )}
      {retention.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {retention.data.items.map((r) => (
              <Card className="shadow-none" key={r.day}>
                <CardHeader>
                  <CardTitle>D{r.day} API retention</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-primary">
                    {r.rate === null ? '—' : `${r.rate}%`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.retained} / {r.eligible} mature accounts
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {retention.data.definition}
          </p>
        </>
      )}
    </div>
  );
}

type Settings = {
  default_radius_km: number;
  maximum_radius_km: number;
  matching_weights: Record<string, number>;
  group_capacity: number;
  organizer_approval_required: boolean;
  feature_flags: { tournaments: boolean };
};
export function AdminSettings() {
  const { getToken } = useAuth();
  const resource = useResource<Settings>('/api/v1/admin/settings');
  const catalog = useResource<{ name: string; active: boolean }[]>(
    '/api/v1/admin/sports',
  );
  const [form, setForm] = useState<Settings | null>(null),
    [reason, setReason] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (resource.data) setForm(resource.data);
  }, [resource.data]);
  async function save(path: string, method: string, body: unknown) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await request(path, await getToken(), {
        method,
        body: JSON.stringify(body),
      });
      await Promise.all([resource.reload(), catalog.reload()]);
      setSaved('Settings saved and audit log recorded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super admin"
        title="Platform settings."
        description="Changes apply immediately and are recorded in the audit log."
      />
      <ErrorNotice
        message={error || resource.error || catalog.error}
        retry={resource.reload}
      />
      {saved && (
        <p role="status" className="text-sm text-primary">
          {saved}
        </p>
      )}
      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save('/api/v1/admin/settings', 'PATCH', { ...form, reason });
          }}
          className="space-y-5"
        >
          <Card className="shadow-none">
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {(
                [
                  'default_radius_km',
                  'maximum_radius_km',
                  'group_capacity',
                ] as const
              ).map((key) => (
                <Field key={key} id={key} label={label(key)}>
                  <Input
                    id={key}
                    required
                    type="number"
                    min={key === 'group_capacity' ? 2 : 1}
                    max={key === 'group_capacity' ? 1000 : 50}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
              {Object.entries(form.matching_weights).map(([key, value]) => (
                <Field
                  key={key}
                  id={`weight-${key}`}
                  label={`${label(key)} weight (0–1)`}
                >
                  <Input
                    id={`weight-${key}`}
                    required
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={value}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        matching_weights: {
                          ...form.matching_weights,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Weights must add up to 1.
              </p>
              <Label>
                <Checkbox
                  checked={form.feature_flags.tournaments}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      feature_flags: { tournaments: v === true },
                    })
                  }
                />
                Enable tournaments
              </Label>
              <p className="text-xs text-muted-foreground">
                Organizer verification and tournament approval remain required.
              </p>
              <Field id="settings-reason" label="Reason for changes">
                <Textarea
                  id="settings-reason"
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>
          <Button disabled={busy}>
            <BusyLabel busy={busy}>Save platform settings</BusyLabel>
          </Button>
        </form>
      )}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Sports catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalog.data?.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-sm">{s.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || reason.trim().length < 5}
                onClick={() =>
                  void save('/api/v1/admin/sports', 'PUT', {
                    name: s.name,
                    active: !s.active,
                    reason,
                  })
                }
              >
                {s.active ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save('/api/v1/admin/sports', 'PUT', {
                name,
                active: true,
                reason,
              });
            }}
          >
            <Input
              aria-label="New sport name"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New sport"
            />
            <Button disabled={busy || reason.trim().length < 5}>
              Add sport
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Enter a reason above before changing the catalog.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
