'use client';
import { useResource } from '@/lib/use-resource';
export function useSports() {
  return useResource<string[]>('/api/v1/sports');
}
