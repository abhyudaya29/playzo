'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorNotice } from '@/components/page-ui';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';
type Notice = {
  id: string;
  kind: string;
  is_read: boolean;
  created_at: string;
  payload: { title: string; href: string };
};
export default function Notifications({ count }: { count: number }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const resource = useResource<Notice[]>(
    open ? '/api/v1/notifications' : null,
    open ? 10000 : 0,
  );
  async function read(id?: string) {
    try {
      await request(
        id ? `/api/v1/notifications/${id}/read` : '/api/v1/notifications/read',
        await getToken(),
        { method: 'PATCH' },
      );
      resource.reload();
      refreshActivity();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not update notifications.',
      );
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        >
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            Requests, invitations, and messages from your playground.
          </DialogDescription>
        </DialogHeader>
        <ErrorNotice
          message={error || resource.error}
          retry={resource.reload}
        />
        {resource.data?.some((item) => !item.is_read) && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-end"
            onClick={() => read()}
          >
            <CheckCheck />
            Mark all as read
          </Button>
        )}
        {resource.loading && !resource.data ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading notifications…
          </p>
        ) : resource.data?.length ? (
          <div className="grid gap-2">
            {resource.data.map((item) => (
              <Link
                key={item.id}
                href={
                  item.payload.href.startsWith('/') &&
                  !item.payload.href.startsWith('//')
                    ? item.payload.href
                    : '/requests'
                }
                onClick={() => {
                  read(item.id);
                  setOpen(false);
                }}
                className="rounded-lg border p-4 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start gap-2">
                  {!item.is_read && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <span
                    className={
                      item.is_read ? 'text-muted-foreground' : 'font-medium'
                    }
                  >
                    {item.payload.title}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          !resource.error && (
            <EmptyState
              title="You’re all caught up"
              description="Your next connection or game invitation will appear here."
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
