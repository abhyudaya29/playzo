'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { request } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useResource } from '@/lib/use-resource';
import { ProfilePost } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { BusyLabel, ErrorNotice } from '@/components/page-ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function ProfilePostCard({
  post,
  name,
  action,
  compact = false,
}: {
  post: ProfilePost;
  name: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-white">
      <img
        src={post.image_url}
        alt={post.caption || `${name}'s photo`}
        loading="lazy"
        className={cn(
          'w-full object-cover',
          compact ? 'aspect-square' : 'aspect-[4/5]',
        )}
      />
      {(post.caption || action) && (
        <div
          className={cn(
            'flex items-start justify-between',
            compact ? 'gap-1 p-2' : 'gap-3 px-4 py-3',
          )}
        >
          {post.caption && (
            <p
              className={cn(
                'min-w-0 whitespace-pre-wrap break-words',
                compact
                  ? 'line-clamp-2 text-xs leading-5'
                  : 'text-sm leading-6',
              )}
            >
              {post.caption}
            </p>
          )}
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
    </article>
  );
}

type PostsResponse = {
  posts: ProfilePost[];
  uploads_enabled: boolean;
  max_posts: number;
  max_image_bytes: number;
};

export default function ProfilePosts({ name }: { name: string }) {
  const { getToken } = useAuth();
  const resource = useResource<PostsResponse>('/api/v1/users/me/posts');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<ProfilePost | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const posts = resource.data?.posts || [];
  const full = posts.length >= (resource.data?.max_posts || 12);
  async function publish() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        '/api/v1/users/me/posts?caption=' + encodeURIComponent(caption.trim()),
        await getToken(),
        {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type },
          signal: AbortSignal.timeout(120000),
        },
      );
      setFile(null);
      setCaption('');
      if (input.current) input.current.value = '';
      await resource.reload();
      setNotice('Photo added to your profile.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add your photo.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/api/v1/users/me/posts/${removing.id}`, await getToken(), {
        method: 'DELETE',
        signal: AbortSignal.timeout(45000),
      });
      setRemoving(null);
      await resource.reload();
      setNotice('Photo removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove your photo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      id="profile-panel-posts"
      role="tabpanel"
      aria-labelledby="profile-tab-posts"
      className="space-y-3"
    >
      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Your life, in play</h2>
          <span className="text-xs text-muted-foreground">
            {posts.length} / {resource.data?.max_posts || 12}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A favourite court, a good game, or a little of you. Give your next
          teammate something to say hello to.
        </p>
        {resource.loading && !resource.data ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading your photos…
          </p>
        ) : resource.data && !resource.data.uploads_enabled ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground"
          >
            Photo uploads are coming soon. You can still update your details and
            sports preferences.
          </p>
        ) : full ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Your profile is full. Remove a post to add a new one.
          </p>
        ) : (
          resource.data && (
            <div className="mt-3 space-y-3">
              <input
                ref={input}
                id="profile-photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                className="block w-full min-w-0 rounded-xl border p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-accent-foreground"
                aria-label="Choose a profile photo"
                onChange={(e) => {
                  const photo = e.target.files?.[0];
                  setError('');
                  if (!photo) return;
                  if (
                    !['image/jpeg', 'image/png', 'image/webp'].includes(
                      photo.type,
                    )
                  ) {
                    setFile(null);
                    setError('Choose a JPEG, PNG, or WebP photo.');
                    e.target.value = '';
                    return;
                  }
                  if (
                    photo.size >
                    (resource.data?.max_image_bytes || 10 * 1024 * 1024)
                  ) {
                    setFile(null);
                    setError('Choose a photo smaller than 10 MB.');
                    e.target.value = '';
                    return;
                  }
                  setFile(photo);
                }}
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG or WebP · up to 10 MB. Photos are visible to players
                who can view your profile.
              </p>
              {preview && (
                <img
                  src={preview}
                  alt="Your selected photo"
                  className="max-h-80 w-full rounded-xl object-contain bg-muted"
                />
              )}
              {file && (
                <>
                  <Label htmlFor="post-caption">Add a caption (optional)</Label>
                  <Textarea
                    id="post-caption"
                    rows={2}
                    maxLength={500}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="The story behind this one…"
                    disabled={busy}
                  />
                  <div className="flex gap-2">
                    <Button type="button" disabled={busy} onClick={publish}>
                      <BusyLabel busy={busy}>
                        <ImagePlus className="size-4" />
                        {busy ? 'Uploading…' : 'Add to profile'}
                      </BusyLabel>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setFile(null);
                        if (input.current) input.current.value = '';
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        )}
      </section>
      <ErrorNotice
        message={error || resource.error}
        retry={resource.error ? resource.reload : undefined}
      />
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {!posts.length && !resource.loading && !resource.error && (
        <div className="rounded-2xl border border-dashed px-5 py-8 text-center">
          <Camera className="mx-auto mb-2 size-6 text-primary" />
          <p className="text-sm font-medium">
            Make room for your first moment.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your photos and their stories will appear here.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {posts.map((post) => (
          <ProfilePostCard
            key={post.id}
            compact
            post={post}
            name={name}
            action={
              <Button
                type="button"
                size="icon"
                className="size-7"
                variant="ghost"
                aria-label={`Remove photo${post.caption ? ': ' + post.caption : ''}`}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setRemoving(post);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
        ))}
      </div>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this photo?</DialogTitle>
            <DialogDescription>
              It will be removed from your profile and photo storage.
            </DialogDescription>
          </DialogHeader>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Keep photo
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={remove}
            >
              <BusyLabel busy={busy}>Remove photo</BusyLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
