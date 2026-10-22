'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { BusyLabel, ErrorNotice } from '@/components/page-ui';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';
export default function GameStatusControls({
  id,
  started,
  onSaved,
}: {
  id: string;
  started: boolean;
  onSaved: () => void;
}) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<'cancelled' | 'completed' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setStatus('cancelled')}>
        Cancel game
      </Button>
      {started && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStatus('completed')}
        >
          Mark completed
        </Button>
      )}
      <Dialog
        open={!!status}
        onOpenChange={(v) => {
          if (!v && !busy) setStatus(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {status === 'cancelled'
                ? 'Cancel this game?'
                : 'Mark this game completed?'}
            </DialogTitle>
            <DialogDescription>
              The game will close and no longer accept new players.
            </DialogDescription>
          </DialogHeader>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setStatus(null)}
            >
              Keep playing
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await request(
                    `/api/v1/games/${id}/transition`,
                    await getToken(),
                    { method: 'POST', body: JSON.stringify({ status }) },
                  );
                  refreshActivity();
                  onSaved();
                  setStatus(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Could not update game.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <BusyLabel busy={busy}>Confirm</BusyLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
