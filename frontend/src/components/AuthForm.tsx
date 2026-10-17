'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useSignIn, useSignUp } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import type { SignInResource } from '@clerk/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, BusyLabel } from '@/components/page-ui';
type Step =
  | 'details'
  | 'signup-code'
  | 'mfa'
  | 'reset-request'
  | 'reset-code'
  | 'new-password';
function messageFor(error: unknown) {
  return isClerkAPIResponseError(error)
    ? error.errors[0]?.longMessage ||
        error.errors[0]?.message ||
        'Please try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
}
export default function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const signup = mode === 'sign-up';
  const signinHook = useSignIn();
  const signupHook = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const activating = useRef(false);
  const [step, setStep] = useState<Step>('details'),
    [firstName, setFirstName] = useState(''),
    [lastName, setLastName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false),
    [resendSeconds, setResendSeconds] = useState(0),
    [factor, setFactor] = useState<'email_code' | 'totp' | 'backup_code'>(
      'email_code',
    );
  const loaded = signinHook.isLoaded && signupHook.isLoaded;
  const pending =
    signupHook.isLoaded &&
    signupHook.signUp.status === 'missing_requirements' &&
    signupHook.signUp.unverifiedFields.includes('email_address');
  useEffect(() => {
    if (isSignedIn && !activating.current) router.replace('/dashboard');
  }, [isSignedIn, router]);
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(
      () => setResendSeconds((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendSeconds]);
  async function activate(session: string | null, destination = '/dashboard') {
    if (!signinHook.isLoaded || !session)
      throw new Error(
        'Your session could not be started. Please try signing in.',
      );
    activating.current = true;
    try {
      await signinHook.setActive({ session });
      router.replace(destination);
    } catch (error) {
      activating.current = false;
      throw error;
    }
  }
  async function finishSignin(result: SignInResource) {
    if (result.status === 'complete') {
      await activate(result.createdSessionId);
      return;
    }
    if (result.status === 'needs_second_factor') {
      const available = result.supportedSecondFactors || [];
      const emailFactor = available.find(
        (item) => item.strategy === 'email_code',
      );
      if (emailFactor) {
        await result.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });
        setFactor('email_code');
        setResendSeconds(30);
      } else if (available.some((item) => item.strategy === 'totp'))
        setFactor('totp');
      else if (available.some((item) => item.strategy === 'backup_code'))
        setFactor('backup_code');
      else
        throw new Error(
          'This account requires an authentication method that is not available here. Check your account’s verification settings.',
        );
      setCode('');
      setStep('mfa');
      return;
    }
    if (result.status === 'needs_new_password') {
      setPassword('');
      setStep('new-password');
      return;
    }
    throw new Error(
      'Sign-in needs more information. Check your email and password or reset your password.',
    );
  }
  async function sendSignupCode() {
    if (!signupHook.isLoaded) return;
    await signupHook.signUp.prepareEmailAddressVerification({
      strategy: 'email_code',
    });
    setStep('signup-code');
    setCode('');
    setResendSeconds(30);
  }
  async function run(action: () => Promise<void>) {
    if (busy || !loaded) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!signinHook.isLoaded || !signupHook.isLoaded) return;
      if (step === 'signup-code') {
        const result = await signupHook.signUp.attemptEmailAddressVerification({
          code,
        });
        if (result.status === 'complete')
          await activate(result.createdSessionId, '/onboarding');
        else
          throw new Error(
            `Your email is verified, but your account still needs: ${result.missingFields.join(', ') || 'additional details'}. Return to sign-up to complete them.`,
          );
        return;
      }
      if (step === 'mfa') {
        const result = await signinHook.signIn.attemptSecondFactor({
          strategy: factor,
          code,
        });
        await finishSignin(result);
        return;
      }
      if (step === 'reset-request') {
        await signinHook.signIn.create({
          strategy: 'reset_password_email_code',
          identifier: email.trim(),
        });
        setStep('reset-code');
        setCode('');
        setPassword('');
        setResendSeconds(30);
        return;
      }
      if (step === 'reset-code') {
        const result = await signinHook.signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code,
          password,
        });
        await finishSignin(result);
        return;
      }
      if (step === 'new-password') {
        await finishSignin(await signinHook.signIn.resetPassword({ password }));
        return;
      }
      if (signup) {
        await signupHook.signUp.create({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          emailAddress: email.trim(),
          password,
        });
        await sendSignupCode();
      } else
        await finishSignin(
          await signinHook.signIn.create({
            identifier: email.trim(),
            password,
          }),
        );
    });
  }
  async function resend() {
    await run(async () => {
      if (resendSeconds || !loaded) return;
      if (step === 'signup-code') await sendSignupCode();
      else if (step === 'reset-code') {
        await signinHook.signIn!.create({
          strategy: 'reset_password_email_code',
          identifier: email.trim(),
        });
        setResendSeconds(30);
      } else if (step === 'mfa') {
        const item = signinHook.signIn!.supportedSecondFactors?.find(
          (item) => item.strategy === 'email_code',
        );
        if (item) {
          await signinHook.signIn!.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: item.emailAddressId,
          });
          setResendSeconds(30);
        }
      }
    });
  }
  async function google() {
    await run(async () => {
      const auth = signup ? signupHook.signUp : signinHook.signIn;
      await auth!.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: signup ? '/onboarding' : '/dashboard',
      });
    });
  }
  const verifying = ['signup-code', 'mfa', 'reset-code'].includes(step);
  const title =
    step === 'signup-code'
      ? 'Check your inbox.'
      : step === 'mfa'
        ? 'One more quick check.'
        : step === 'reset-request'
          ? 'Forgot your password?'
          : step === 'reset-code' || step === 'new-password'
            ? 'A fresh start.'
            : signup
              ? 'Find your people.'
              : 'Welcome back.';
  const description =
    step === 'signup-code'
      ? `Enter the 6-digit code we sent to ${signupHook.signUp?.emailAddress || email}.`
      : step === 'mfa'
        ? factor === 'email_code'
          ? 'Enter the verification code sent to your email.'
          : factor === 'totp'
            ? 'Enter the code from your authenticator app.'
            : 'Enter one of your saved backup codes.'
        : step === 'reset-request'
          ? 'Enter your email and we’ll send a password reset code.'
          : step === 'reset-code'
            ? 'Enter the email code and choose your new password.'
            : step === 'new-password'
              ? 'Choose a new password to finish signing in.'
              : signup
                ? 'Create your account. Your next game is closer than you think.'
                : 'Sign in to your local playground.';
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-5 inline-flex rounded-xl border bg-muted/50 p-2.5">
          <Mail className="size-5 text-primary" />
        </div>
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {params.get('__clerk_status') && step === 'details' && (
        <Alert>
          <AlertDescription>
            The previous email link could not be completed. Continue below to
            verify with an email code.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {step === 'details' && (
        <>
          <Button
            variant="outline"
            className="w-full bg-white"
            disabled={!loaded || busy}
            onClick={google}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
              <path
                fill="currentColor"
                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22ZM6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.5 3.82 1.49l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
              />
            </svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-[11px] text-muted-foreground">
              or continue with email
            </span>
            <Separator className="flex-1" />
          </div>
        </>
      )}
      {signup && pending && step === 'details' && (
        <Button
          variant="secondary"
          className="h-auto w-full whitespace-normal py-3 text-left text-xs"
          disabled={busy}
          onClick={() => run(sendSignupCode)}
        >
          Continue verifying {signupHook.signUp?.emailAddress}
        </Button>
      )}
      <form onSubmit={submit} className="space-y-5">
        {signup && step === 'details' && (
          <div className="grid grid-cols-2 gap-4">
            <Field id="first-name" label="First name">
              <Input
                disabled={!loaded || busy}
                id="first-name"
                autoComplete="given-name"
                required
                maxLength={100}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex"
              />
            </Field>
            <Field id="last-name" label="Last name">
              <Input
                disabled={!loaded || busy}
                id="last-name"
                autoComplete="family-name"
                required
                maxLength={100}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Morgan"
              />
            </Field>
          </div>
        )}
        {(step === 'details' || step === 'reset-request') && (
          <Field id="email" label="Email address">
            <Input
              disabled={!loaded || busy}
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        )}
        {verifying && (
          <Field
            id="verification-code"
            label={
              step === 'mfa' && factor !== 'email_code'
                ? 'Verification code'
                : 'Email verification code'
            }
          >
            <Input
              disabled={!loaded || busy}
              id="verification-code"
              autoComplete="one-time-code"
              inputMode={factor === 'backup_code' ? 'text' : 'numeric'}
              maxLength={factor === 'backup_code' ? 20 : 6}
              pattern={factor === 'backup_code' ? undefined : '[0-9]{6}'}
              className="h-12 text-center text-xl tracking-[.35em]"
              required
              value={code}
              onChange={(e) =>
                setCode(
                  factor === 'backup_code'
                    ? e.target.value
                    : e.target.value.replace(/\D/g, ''),
                )
              }
              placeholder="000000"
            />
          </Field>
        )}
        {(step === 'details' ||
          step === 'reset-code' ||
          step === 'new-password') && (
          <Field
            id="password"
            label={step === 'details' ? 'Password' : 'New password'}
          >
            <div className="relative">
              <Input
                disabled={!loaded || busy}
                id="password"
                type={visible ? 'text' : 'password'}
                autoComplete={
                  signup || step !== 'details'
                    ? 'new-password'
                    : 'current-password'
                }
                required
                minLength={signup || step !== 'details' ? 8 : undefined}
                className="pr-10"
                placeholder={
                  signup ? 'Create a strong password' : 'Enter your password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-0.5"
                disabled={!loaded || busy}
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {signup && (
              <p className="text-xs text-muted-foreground">
                Use at least 8 characters.
              </p>
            )}
          </Field>
        )}
        {!signup && step === 'details' && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              disabled={!loaded || busy}
              onClick={() => {
                setStep('reset-request');
                setError('');
              }}
            >
              Forgot password?
            </Button>
          </div>
        )}
        <div id="clerk-captcha" />
        <Button className="w-full" disabled={!loaded || busy} size="lg">
          <BusyLabel busy={busy}>
            {busy
              ? 'Please wait…'
              : step === 'signup-code'
                ? 'Verify email and continue'
                : step === 'mfa'
                  ? 'Verify and sign in'
                  : step === 'reset-request'
                    ? 'Send reset code'
                    : step === 'reset-code' || step === 'new-password'
                      ? 'Reset password'
                      : signup
                        ? 'Create account'
                        : 'Sign in'}
            {!busy && <ArrowRight />}
          </BusyLabel>
        </Button>
      </form>
      {verifying && (step !== 'mfa' || factor === 'email_code') && (
        <div className="text-center">
          <Button
            variant="link"
            size="sm"
            disabled={busy || resendSeconds > 0}
            onClick={resend}
          >
            {resendSeconds
              ? `Resend code in ${resendSeconds}s`
              : 'Resend verification code'}
          </Button>
        </div>
      )}
      {step !== 'details' && (
        <Button
          variant="ghost"
          className="w-full text-xs text-muted-foreground"
          disabled={busy}
          onClick={() => {
            setStep('details');
            setError('');
            setCode('');
            setPassword('');
          }}
        >
          <ArrowLeft />
          {signup ? 'Back to sign-up' : 'Back to sign-in'}
        </Button>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {signup ? 'Already have an account?' : 'New to Playzo?'}{' '}
        <a
          href={signup ? '/sign-in' : '/sign-up'}
          className="font-medium text-primary hover:underline"
        >
          {signup ? 'Sign in' : 'Create an account'}
        </a>
      </p>
    </div>
  );
}
