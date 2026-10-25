'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { request } from '@/lib/api';

type Activity = {
  id: string;
  name: string;
  message: string;
  created_at: string;
  demo?: boolean;
};
const examples = [
  {
    id: 'example-partner',
    name: 'Aarav',
    message: 'found a playing partner',
    created_at: '',
    demo: true,
  },
  {
    id: 'example-community',
    name: 'Sana',
    message: 'joined a sports community',
    created_at: '',
    demo: true,
  },
  {
    id: 'example-join',
    name: 'Kabir',
    message: 'joined Playhud',
    created_at: '',
    demo: true,
  },
];
function age(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return 'Less than a minute ago';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
export default function LandingActivityToast() {
  const [items, setItems] = useState<Activity[]>(examples);
  const [visible, setVisible] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(0),
    [index, setIndex] = useState(0),
    [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('playhud:activity-dismissed')) {
        setDismissed(true);
        return;
      }
    } catch {}
    const controller = new AbortController();
    request<{ items: Activity[] }>('/api/v1/playground/activity', null, {
      signal: controller.signal,
    })
      .then((data) => {
        const real = data.items.filter((item) =>
          Number.isFinite(Date.parse(item.created_at)),
        );
        if (real.length) {
          const mixed: Activity[] = [];
          real.forEach((item, index) => {
            mixed.push({ ...item, demo: false });
            if (examples[index]) mixed.push(examples[index]);
          });
          setItems([...mixed, ...examples.slice(real.length)]);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const listener = () =>
      setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }, []);
  useEffect(() => {
    if (dismissed || paused || !pageVisible || (!visible && shown >= 3)) return;
    const timer = window.setTimeout(
      () => {
        if (visible) setVisible(false);
        else {
          setIndex(shown % items.length);
          setShown((count) => count + 1);
          setVisible(true);
        }
      },
      visible ? 6500 : shown === 0 ? 4500 : 9000,
    );
    return () => window.clearTimeout(timer);
  }, [dismissed, paused, pageVisible, visible, shown, items.length]);
  if (dismissed || !visible) return null;
  const item = items[index % items.length];
  const sample = !!item.demo;
  return (
    <aside
      aria-label={sample ? 'Demo Playhud story' : 'Recent Playhud activity'}
      aria-live="off"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
      className="page-enter fixed bottom-4 left-4 right-4 z-40 flex max-w-sm items-start gap-3 rounded-2xl border border-primary/15 bg-white p-4 shadow-xl shadow-indigo-950/10 sm:bottom-6 sm:left-6 sm:right-auto"
    >
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
        <span className="text-lg font-semibold" aria-hidden="true">
          {item.name[0]}
        </span>
        {!sample && (
          <Check className="absolute -bottom-1 -right-1 size-4 rounded-full bg-primary p-0.5 text-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Playhud community
        </p>
        <p className="mt-1 text-sm leading-5">
          <strong>{item.name}</strong> {item.message}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {sample
            ? 'Demo story · Explore the playground'
            : age(item.created_at)}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss community activity"
        className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem('playhud:activity-dismissed', 'yes');
          } catch {}
        }}
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
