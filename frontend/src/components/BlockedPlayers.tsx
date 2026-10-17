'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { ShieldBan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ErrorNotice } from '@/components/page-ui';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';
export default function BlockedPlayers() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const resource = useResource<{ id: string; name: string }[]>(
    open ? '/api/v1/blocks' : null,
  );
  async function unblock(id: string) {
    setBusy(id);
    try {
      await request(`/api/v1/blocks/${id}`, await getToken(), {
        method: 'DELETE',
      });
      await resource.reload();
      refreshActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unblock player.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
        >
          <ShieldBan />
          Blocked players
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Blocked players</DialogTitle>
          <DialogDescription>
            Blocked players cannot connect, invite you, or share a conversation
            with you. Unblocking restores access to existing accepted chats.
          </DialogDescription>
        </DialogHeader>
        <ErrorNotice
          message={error || resource.error}
          retry={resource.reload}
        />
        {resource.data?.length ? (
          resource.data.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span className="text-sm">{player.name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => unblock(player.id)}
              >
                {busy === player.id ? 'Unblocking…' : 'Unblock'}
              </Button>
            </div>
          ))
        ) : (
          <p className="py-5 text-sm text-muted-foreground">
            {resource.loading ? 'Loading…' : 'You haven’t blocked anyone.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
