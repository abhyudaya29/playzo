'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { request, ApiError } from '@/lib/api';
const cache = new Map<string, unknown>();
export function useResource<T>(path: string | null, refreshMs = 0) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const key = userId && path ? `${userId}:${path}` : '';
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    loading: boolean;
    errorStatus?: number;
  }>({ key: '', data: null, error: '', loading: true });
  const version = useRef(0);
  const load = useCallback(async () => {
    if (!isLoaded || !isSignedIn || !key || !path) return;
    const current = ++version.current;
    setState((old) => ({
      key,
      data: old.key === key ? old.data : ((cache.get(key) as T) ?? null),
      error: '',
      loading: true,
    }));
    try {
      const result = await request<T>(path, await getToken());
      if (current !== version.current) return;
      cache.set(key, result);
      setState({ key, data: result, error: '', loading: false });
    } catch (error) {
      if (current === version.current)
        setState((old) => ({
          ...old,
          error:
            error instanceof Error
              ? error.message
              : 'Something went wrong. Please try again.',
          errorStatus: error instanceof ApiError ? error.status : undefined,
          loading: false,
        }));
    }
  }, [getToken, isLoaded, isSignedIn, key, path]);
  useEffect(() => {
    load();
    return () => {
      ++version.current;
    };
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('playzo:activity', refresh);
    const timer = refreshMs
      ? window.setInterval(refresh, refreshMs)
      : undefined;
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('playzo:activity', refresh);
      if (timer) clearInterval(timer);
    };
  }, [load, refreshMs]);
  const data = state.key === key ? state.data : ((cache.get(key) as T) ?? null);
  return {
    data,
    error: state.key === key ? state.error : '',
    errorStatus: state.key === key ? state.errorStatus : undefined,
    loading: !!path && (state.key !== key || state.loading),
    reload: load,
  };
}
