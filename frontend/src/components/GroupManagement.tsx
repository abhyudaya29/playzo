'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { OptionSelect } from '@/components/option-select';
import { ErrorNotice, Field, BusyLabel } from '@/components/page-ui';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';
import PlayerPhoto from '@/components/PlayerPhoto';
type Group = {
  id: string;
  name: string;
  my_role?: string;
  visibility?: string;
  capacity?: number;
};
type Member = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: string;
};
export default function GroupManagement({
  group,
  onSaved,
}: {
  group: Group;
  onSaved: () => void;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [visibility, setVisibility] = useState(group.visibility || 'public'),
    [capacity, setCapacity] = useState(group.capacity || 100),
    [invitee, setInvitee] = useState('');
  const members = useResource<Member[]>(
    open ? `/api/v1/groups/${group.id}/members` : null,
  );
  const connections = useResource<
    { status: string; person: { id: string; name: string } }[]
  >(
    open && ['owner', 'admin'].includes(group.my_role || '')
      ? '/api/v1/connections'
      : null,
  );
  const inviteOptions = (connections.data || [])
    .filter(
      (c) =>
        c.status === 'accepted' &&
        !members.data?.some((m) => m.id === c.person.id),
    )
    .map((c) => ({ value: c.person.id, label: c.person.name }));
  async function mutate(
    path: string,
    method: string,
    body?: unknown,
    close = false,
  ) {
    setBusy(true);
    setError('');
    try {
      await request(path, await getToken(), {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      refreshActivity();
      onSaved();
      await members.reload();
      if (close) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update group.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Members & settings
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{group.name}</DialogTitle>
            <DialogDescription>
              Meet your community and manage your participation.
            </DialogDescription>
          </DialogHeader>
          <ErrorNotice message={error || members.error || connections.error} />
          {group.my_role === 'owner' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(`/api/v1/groups/${group.id}/settings`, 'PATCH', {
                  visibility,
                  capacity,
                });
              }}
              className="space-y-3 rounded-xl border p-4"
            >
              <OptionSelect
                label="Group visibility"
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: 'public', label: 'Public — discoverable' },
                  { value: 'private', label: 'Private — invitation only' },
                ]}
              />
              <Field id="group-capacity" label="Member capacity">
                <Input
                  id="group-capacity"
                  type="number"
                  required
                  min={2}
                  max={1000}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </Field>
              <Button disabled={busy} size="sm">
                <BusyLabel busy={busy}>Save group settings</BusyLabel>
              </Button>
            </form>
          )}
          {['owner', 'admin'].includes(group.my_role || '') && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(`/api/v1/groups/${group.id}/invitations`, 'POST', {
                  receiver_id: invitee,
                });
              }}
              className="space-y-3"
            >
              <OptionSelect
                label="Invite a connected player"
                value={invitee}
                onChange={setInvitee}
                options={inviteOptions}
              />
              <Button disabled={busy || !invitee} size="sm" variant="outline">
                Send invitation
              </Button>
              <p className="text-xs text-muted-foreground">
                They can accept or decline in Requests.
              </p>
            </form>
          )}
          <div className="space-y-3">
            {members.data?.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <Link
                  href={`/players/${m.id}`}
                  className="flex items-center gap-3 text-sm text-primary"
                >
                  <PlayerPhoto name={m.name} url={m.avatar_url} />
                  {m.name}
                  <span className="text-xs capitalize text-muted-foreground">
                    {m.role === 'admin' ? 'Moderator' : m.role}
                  </span>
                </Link>
                {group.my_role === 'owner' && m.role !== 'owner' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/api/v1/groups/${group.id}/members/${m.id}`,
                        'PATCH',
                        { role: m.role === 'admin' ? 'member' : 'admin' },
                      )
                    }
                  >
                    {m.role === 'admin' ? 'Remove moderator' : 'Make moderator'}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {group.my_role !== 'owner' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void mutate(
                  `/api/v1/groups/${group.id}/members/me`,
                  'DELETE',
                  undefined,
                  true,
                )
              }
            >
              Leave community
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
