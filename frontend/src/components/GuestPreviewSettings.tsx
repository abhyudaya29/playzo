'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { request } from '@/lib/api';
export default function GuestPreviewSettings({
  enabled,
  onSaved,
}: {
  enabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <div className="rounded-xl border p-3">
      <Label>
        <Checkbox
          checked={enabled}
          disabled={busy}
          onCheckedChange={async (value) => {
            setBusy(true);
            setMessage('');
            try {
              await request('/api/v1/users/me/preferences', await getToken(), {
                method: 'PATCH',
                body: JSON.stringify({ guest_preview_visible: value === true }),
              });
              await onSaved();
              setMessage('Guest preview preference saved.');
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : 'Could not save this preference.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        Show a preview in the guest playground
      </Label>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Let visitors see your first name or nickname, sport, broad area, recent
        activity, and public communities or games you host. Your phone, exact
        location, and photo posts stay private.
      </p>
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
