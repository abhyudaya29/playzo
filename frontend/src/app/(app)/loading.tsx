import { CardSkeletons } from '@/components/page-ui';
import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <CardSkeletons />
    </div>
  );
}
