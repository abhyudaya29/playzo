'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  Compass,
  Users,
  CalendarDays,
  Inbox,
  MessageSquare,
  Settings2,
  ArrowUpRight,
  ChevronRight,
  Trophy,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { InstallApp } from '@/components/PwaSupport';
import Brand from '@/components/Brand';
import Notifications from '@/components/Notifications';
import { Badge } from '@/components/ui/badge';
import { useResource } from '@/lib/use-resource';
import { Activity } from '@/lib/social-types';
import { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';
const navigation = [
  { href: '/dashboard', label: 'Discover', icon: Compass },
  { href: '/requests', label: 'Requests', icon: Inbox },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/groups', label: 'Communities', icon: Users },
  { href: '/games', label: 'Games', icon: CalendarDays },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/onboarding', label: 'Your profile', icon: Settings2 },
];
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activity = useResource<Activity>('/api/v1/activity', 10000);
  const profile = useResource<Profile>('/api/v1/users/me');
  const settingUp =
    pathname === '/onboarding' && profile.data?.onboarding_completed === false;
  const countFor = (href: string) =>
    href === '/requests'
      ? activity.data?.requests || 0
      : href === '/messages'
        ? activity.data?.messages || 0
        : 0;
  const current = navigation.find((item) => pathname.startsWith(item.href));
  return (
    <div className="min-h-svh">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-white p-5',
          !settingUp && 'md:flex',
        )}
      >
        <div className="px-3 py-3">
          <Brand />
        </div>
        <div className="mt-10 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Workspace
        </div>
        <nav aria-label="Main navigation" className="mt-3 grid gap-1">
          {navigation.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className={cn(
                'justify-start gap-3 text-muted-foreground',
                pathname.startsWith(item.href) &&
                  'bg-accent text-accent-foreground hover:bg-accent',
              )}
            >
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={
                  pathname.startsWith(item.href) ? 'page' : undefined
                }
              >
                <item.icon className="size-4" />
                {item.label}
                {countFor(item.href) > 0 && (
                  <Badge className="ml-auto px-1.5 text-[10px]">
                    {countFor(item.href) > 99 ? '99+' : countFor(item.href)}
                  </Badge>
                )}
              </Link>
            </Button>
          ))}
          {profile.data && profile.data.role !== 'USER' && (
            <Button
              asChild
              variant="ghost"
              className="justify-start gap-3 text-muted-foreground"
            >
              <Link href="/admin">
                <ShieldCheck className="size-4" />
                Admin control center
              </Link>
            </Button>
          )}
        </nav>
        <div className="mt-auto rounded-xl border bg-muted/40 p-4">
          <div className="mb-2 inline-flex rounded-lg border bg-white p-2">
            <Users className="size-4 text-primary" />
          </div>
          <p className="text-sm font-semibold">Better with your people.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            A regular game starts with a local crew.
          </p>
          <Button asChild variant="link" className="mt-2 h-auto px-0 text-xs">
            <Link href="/groups">
              Find a community <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
        <Separator className="my-4" />
        <p className="px-3 text-xs text-muted-foreground">
          Your game. Your crew.
        </p>
      </aside>
      <div className={cn(!settingUp && 'md:pl-60')}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-white/95 px-5 backdrop-blur-sm md:px-9">
          <div className={cn('min-w-0', !settingUp && 'md:hidden')}>
            <Brand />
          </div>
          <div
            className={cn(
              'hidden items-center gap-3 text-sm text-muted-foreground',
              !settingUp && 'md:flex',
            )}
          >
            Workspace <ChevronRight className="size-3" />
            <span className="font-medium text-foreground">
              {current?.label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">
              Let’s make time to play
            </span>
            {profile.data && profile.data.role !== 'USER' && (
              <Button asChild variant="ghost" size="sm" className="md:hidden">
                <Link href="/admin" aria-label="Admin control center">
                  <ShieldCheck className="size-4" />
                </Link>
              </Button>
            )}
            <InstallApp />
            <Notifications count={activity.data?.notifications || 0} />
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto min-w-0 max-w-7xl px-4 py-7 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-5 md:px-9 md:py-10"
        >
          {children}
        </main>
        <nav
          aria-label="Mobile navigation"
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 grid-cols-7 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden',
            settingUp ? 'hidden' : 'grid',
          )}
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={
                item.href === '/groups'
                  ? 'Groups'
                  : item.href === '/tournaments'
                    ? 'Events'
                    : item.href === '/onboarding'
                      ? 'Profile'
                      : item.label
              }
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground transition-colors',
                pathname.startsWith(item.href) && 'text-primary',
              )}
            >
              <item.icon className="size-5" />
              <span className="relative">
                {item.href === '/groups'
                  ? 'Groups'
                  : item.href === '/tournaments'
                    ? 'Events'
                    : item.href === '/onboarding'
                      ? 'Profile'
                      : item.label}
                {countFor(item.href) > 0 && (
                  <span className="ml-0.5 text-[9px] font-bold">
                    ({countFor(item.href)})
                  </span>
                )}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
