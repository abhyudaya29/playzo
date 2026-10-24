import { AlertCircle, SearchX, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
export function PageHeader({
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <h1 className="sr-only" style={{ marginBlock: 0 }}>
        {title}
      </h1>
      {action && <div className="flex justify-end gap-2">{action}</div>}
    </>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="mb-5">
      <AlertCircle className="size-4" />
      <AlertTitle>We couldn’t complete that</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {retry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 rounded-full border bg-muted/60 p-3">
          <SearchX className="size-5 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}
export function CardSkeletons() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading content"
    >
      {[1, 2, 3].map((i) => (
        <Card key={i} className="shadow-none">
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="size-11 rounded-xl" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-8 h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export function Field({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-stack">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description && (
        <p
          id={`${id}-help`}
          className="text-xs leading-5 text-muted-foreground"
        >
          {description}
        </p>
      )}
    </div>
  );
}
export function BusyLabel({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </>
  );
}
