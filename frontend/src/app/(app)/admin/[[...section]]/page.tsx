'use client';
import { use } from 'react';
import {
  AdminOverview,
  AdminTable,
  AdminAnalytics,
  AdminSettings,
  AdminUserDetail,
} from '@/components/AdminPanels';
import { EmptyState } from '@/components/page-ui';
export default function AdminPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = use(params);
  if (!section.length) return <AdminOverview />;
  if (section[0] === 'users' && section[1])
    return <AdminUserDetail id={section[1]} />;
  if (section[0] === 'analytics') return <AdminAnalytics />;
  if (section[0] === 'settings') return <AdminSettings />;
  if (section[0] === 'tournaments')
    return (
      <div className="space-y-10">
        <AdminTable section="tournaments" />
        <AdminTable section="organizers" />
      </div>
    );
  if (
    ['users', 'activity', 'groups', 'games', 'reports', 'audit-logs'].includes(
      section[0],
    )
  )
    return <AdminTable section={section[0]} />;
  return (
    <EmptyState
      title="Page not found"
      description="Choose a page from the control center navigation."
    />
  );
}
