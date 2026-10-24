'use client';
import { Camera, ContactRound, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
export type ProfileTab = 'posts' | 'personal' | 'sports';
const tabs = [
  { id: 'posts', label: 'Photos & posts', icon: Camera },
  { id: 'personal', label: 'Personal info', icon: ContactRound },
  { id: 'sports', label: 'Sports & settings', icon: SlidersHorizontal },
] as const;
export default function ProfileTabs({
  value,
  onChange,
}: {
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Your profile"
      className="grid grid-cols-3 gap-1 rounded-xl border bg-white p-1"
      onKeyDown={(e) => {
        const index = tabs.findIndex((tab) => tab.id === value);
        let next = index;
        if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft')
          next = (index + tabs.length - 1) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        else return;
        e.preventDefault();
        onChange(tabs[next].id);
        document.getElementById('profile-tab-' + tabs[next].id)?.focus();
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={'profile-tab-' + tab.id}
          role="tab"
          type="button"
          aria-selected={value === tab.id}
          aria-controls={'profile-panel-' + tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:gap-2 sm:text-sm',
            value === tab.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
