import { Suspense } from 'react';
import AuthLayout from '@/components/AuthLayout';
import AuthForm from '@/components/AuthForm';
export default function SignUpPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<p role="status">Loading sign-up…</p>}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </AuthLayout>
  );
}
