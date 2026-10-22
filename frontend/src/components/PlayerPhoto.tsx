'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { API } from '@/lib/api';
import { cn } from '@/lib/utils';

export function photoUrl(url?: string | null) {
  return url?.startsWith('/api/') ? `${API}${url}` : undefined;
}
export default function PlayerPhoto({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-11 rounded-xl', className)}>
      {url && (
        <AvatarImage
          src={photoUrl(url)}
          alt={`${name}'s profile photo`}
          className="object-cover"
        />
      )}
      <AvatarFallback className="rounded-xl bg-accent font-semibold text-primary">
        {name.trim().charAt(0).toUpperCase() || 'P'}
      </AvatarFallback>
    </Avatar>
  );
}
