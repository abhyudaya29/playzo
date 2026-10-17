'use client';
import { ErrorNotice } from '@/components/page-ui';
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <ErrorNotice
      message="This page couldn’t load. Your account and saved information are still available."
      retry={reset}
    />
  );
}
