'use client';
import { useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { request } from '@/lib/api';
import { refreshActivity } from '@/lib/social-types';

// Clerk's existing account menu owns photo/name editing. Cache its verified
// identity on Playzo so other players' cards show the same account photo.
export default function ClerkProfileSync() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const synced = useRef('');
  const fingerprint = user
    ? `${user.id}:${user.updatedAt?.getTime()}:${user.imageUrl}:${user.fullName}`
    : '';
  useEffect(() => {
    if (!fingerprint) {
      synced.current = '';
      return;
    }
    if (synced.current === fingerprint) return;
    let active = true;
    void (async () => {
      try {
        await request('/api/v1/users/me/clerk-sync', await getToken(), {
          method: 'POST',
        });
        if (active) {
          synced.current = fingerprint;
          refreshActivity();
        }
      } catch {
        /* A temporary sync outage must not block the signed-in app. */
      }
    })();
    return () => {
      active = false;
    };
  }, [fingerprint, getToken]);
  return null;
}
