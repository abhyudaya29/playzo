'use client';
import { useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNotice, BusyLabel } from '@/components/page-ui';
import PlayerPhoto from '@/components/PlayerPhoto';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';

export default function ProfilePhotoUpload({
  name,
  url,
  onChange,
}: {
  name: string;
  url?: string | null;
  onChange: (url: string | null) => void;
}) {
  const { getToken } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(file?: File) {
    setError('');
    if (
      file &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      setError('Choose a JPEG, PNG, or WebP image under 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ avatar_url: string | null }>(
        '/api/v1/users/me/avatar',
        await getToken(),
        {
          method: file ? 'PUT' : 'DELETE',
          ...(file
            ? { body: file, headers: { 'Content-Type': file.type } }
            : {}),
        },
      );
      onChange(result.avatar_url);
      refreshActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your photo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        <PlayerPhoto name={name} url={url} className="size-20" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <BusyLabel busy={busy}>
                <Camera />
                {url ? 'Change photo' : 'Upload photo'}
              </BusyLabel>
            </Button>
            {url && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => save()}
              >
                <Trash2 />
                Remove photo
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            JPEG, PNG or WebP, up to 5 MB. Photos save immediately.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose profile photo"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void save(file);
          }}
        />
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}
