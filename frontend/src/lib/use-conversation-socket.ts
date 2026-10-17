'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { API, ApiError, request } from '@/lib/api';
export function useConversationSocket(
  id: string,
  onChange: () => void,
  onRevoked: () => void,
) {
  const { getToken } = useAuth();
  const callbacks = useRef({ onChange, onRevoked });
  callbacks.current = { onChange, onRevoked };
  const [state, setState] = useState<'connecting' | 'live' | 'offline'>(
    'connecting',
  );
  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    async function connect() {
      if (!active) return;
      setState('connecting');
      try {
        const result = await request<{ ticket: string }>(
          `/api/v1/conversations/${id}/ticket`,
          await getToken({ skipCache: true }),
          { method: 'POST' },
        );
        if (!active) return;
        const url = new URL(`/api/v1/ws/conversations/${id}`, API);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url);
        socket.onopen = () =>
          socket?.send(
            JSON.stringify({ type: 'authenticate', ticket: result.ticket }),
          );
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ready') {
              setState('live');
              attempt = 0;
              callbacks.current.onChange();
            } else if (
              data.type === 'message.created' ||
              data.type === 'access.changed'
            )
              callbacks.current.onChange();
          } catch {
            /* A malformed transient event does not replace persisted history. */
          }
        };
        socket.onclose = (event) => {
          if (!active) return;
          setState('offline');
          if (event.code === 4403) {
            callbacks.current.onRevoked();
            return;
          }
          timer = setTimeout(
            connect,
            Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4)),
          );
        };
        socket.onerror = () => socket?.close();
      } catch (error) {
        if (error instanceof ApiError && [403, 404].includes(error.status)) {
          if (active) {
            setState('offline');
            callbacks.current.onRevoked();
          }
          return;
        }
        if (active) {
          setState('offline');
          timer = setTimeout(
            connect,
            Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4)),
          );
        }
      }
    }
    connect();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [id, getToken]);
  return state;
}
