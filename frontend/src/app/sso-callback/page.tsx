'use client';
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import AuthLayout from '@/components/AuthLayout';
import { Loader2 } from 'lucide-react';
export default function SSOCallback() {
  return (
    <AuthLayout>
      <div
        role="status"
        className="flex items-center gap-3 text-sm text-muted-foreground"
      >
        <Loader2 className="size-5 animate-spin" />
        Finishing your secure sign-in…
      </div>
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
      />
    </AuthLayout>
  );
}
