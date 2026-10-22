'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { BusyLabel, ErrorNotice, Field } from '@/components/page-ui';
import { request } from '@/lib/api';
export default function ReportButton({
  type,
  id,
  name,
}: {
  type: 'group' | 'game' | 'tournament';
  id: string;
  name: string;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {sent ? 'Report submitted' : 'Report'}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {name}</DialogTitle>
            <DialogDescription>
              Share the issue with authorized moderators. Reports are private.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await request('/api/v1/reports', await getToken(), {
                  method: 'POST',
                  body: JSON.stringify({
                    target_type: type,
                    target_id: id,
                    reason,
                  }),
                });
                setSent(true);
                setOpen(false);
                setReason('');
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Could not send report.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorNotice message={error} />
            <Field id={`report-${id}`} label="Reason">
              <Textarea
                id={`report-${id}`}
                minLength={5}
                maxLength={2000}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button disabled={busy}>
                <BusyLabel busy={busy}>Submit report</BusyLabel>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
