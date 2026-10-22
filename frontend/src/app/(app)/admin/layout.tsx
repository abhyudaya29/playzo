'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorNotice, CardSkeletons, EmptyState } from '@/components/page-ui';
import { useResource } from '@/lib/use-resource';
import { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';
const nav = [
  ['', 'Overview'],
  ['users', 'Users'],
  ['activity', 'User activity'],
  ['groups', 'Groups'],
  ['games', 'Games'],
  ['tournaments', 'Tournaments'],
  ['reports', 'Reports & moderation'],
  ['analytics', 'Analytics'],
  ['settings', 'Platform settings'],
  ['audit-logs', 'Audit logs'],
];
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = useResource<Profile>('/api/v1/users/me');
  const path = usePathname();
  if (profile.loading && !profile.data) return <CardSkeletons />;
  if (profile.error)
    return <ErrorNotice message={profile.error} retry={profile.reload} />;
  if (!profile.data || profile.data.role === 'USER')
    return (
      <EmptyState
        title="Staff access required"
        description="Your account does not have access to the Playzo control center."
      />
    );
  const role = profile.data.role;
  const allowed = nav.filter(([key]) =>
    key === 'settings'
      ? role === 'SUPER_ADMIN'
      : key === 'audit-logs'
        ? ['SUPER_ADMIN', 'OPERATIONS_ADMIN'].includes(role)
        : key === 'reports'
          ? role !== 'TOURNAMENT_MODERATOR'
          : true,
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Playzo control center
        </p>
        <p className="mt-2 text-xs capitalize text-muted-foreground">
          {role.replaceAll('_', ' ').toLowerCase()}
        </p>
      </div>
      <nav
        aria-label="Admin navigation"
        className="flex flex-wrap gap-1 border-b pb-4"
      >
        {allowed.map(([key, label]) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant="ghost"
            className={cn(
              (key ? path.startsWith(`/admin/${key}`) : path === '/admin') &&
                'bg-accent text-primary',
            )}
          >
            <Link href={`/admin${key ? `/${key}` : ''}`}>{label}</Link>
          </Button>
        ))}
      </nav>
      {children}
    </div>
  );
}
