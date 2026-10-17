import { Suspense } from 'react';
import AuthLayout from '@/components/AuthLayout';
import AuthForm from '@/components/AuthForm';
export default function SignInPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<p role="status">Loading sign-in…</p>}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </AuthLayout>
  );
}
