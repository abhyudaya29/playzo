'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  LocateFixed,
  Users,
  UserRound,
  CalendarDays,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import Brand from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, BusyLabel, ErrorNotice } from '@/components/page-ui';
import AuthForm from '@/components/AuthForm';
import {
  IllustratedChoice,
  PlayerAvatar,
  PlayIllustration,
} from '@/components/onboarding-visuals';
import { request } from '@/lib/api';
import { skillLevels } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  playgroundDestination,
  playgroundExamples,
  rememberPlayground,
  type PlaygroundChoices,
  type PlaygroundItem,
  type PlaygroundKind,
} from '@/lib/playground';

const modes = [
  {
    kind: 'players',
    label: 'A playing partner',
    short: 'Players',
    description: 'Find someone at your pace.',
    icon: UserRound,
  },
  {
    kind: 'communities',
    label: 'A local community',
    short: 'Communities',
    description: 'Meet your regular crew.',
    icon: Users,
  },
  {
    kind: 'games',
    label: 'A game to join',
    short: 'Games',
    description: 'Find an open spot and play.',
    icon: CalendarDays,
  },
] as const;
const fallbackSports = [
  'Badminton',
  'Basketball',
  'Cricket',
  'Cycling',
  'Football',
  'Running',
  'Table Tennis',
  'Tennis',
  'Volleyball',
  'Yoga',
];
type DetectedArea = {
  city: string;
  state: string;
  locality: string;
  pincode: string;
};
type LocationResult = { city: string; state: string; localities: string[] };
type Preview = {
  items: PlaygroundItem[];
  kind: PlaygroundKind;
  area: string;
  requires_signup: boolean;
};

export default function PlaygroundPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [stage, setStage] = useState<
    'choices' | 'location' | 'results' | 'signup'
  >('choices');
  const [choiceStep, setChoiceStep] = useState(0);
  const [choices, setChoices] = useState<PlaygroundChoices>({
    kind: 'players',
    gender: '',
    sport: 'Badminton',
    skill_level: 'beginner',
    pincode: '',
    city: '',
    state: '',
    locality: '',
  });
  const [sports, setSports] = useState(fallbackSports);
  const [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<Preview | null>(null),
    [samples, setSamples] = useState(false),
    [liveMessage, setLiveMessage] = useState('');
  const origin = useRef<{ latitude: number; longitude: number } | null>(null);
  const searchVersion = useRef(0),
    lookupVersion = useRef(0);
  const [located, setLocated] = useState(false);
  const [areaMessage, setAreaMessage] = useState('');
  const [emptyArea, setEmptyArea] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    request<string[]>('/api/v1/sports', null, { signal: controller.signal })
      .then((items) => {
        if (items.length) setSports(items);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [stage, choiceStep]);
  useEffect(
    () => () => {
      searchVersion.current++;
      lookupVersion.current++;
    },
    [],
  );
  function update<K extends keyof PlaygroundChoices>(
    key: K,
    value: PlaygroundChoices[K],
  ) {
    setChoices((old) => ({ ...old, [key]: value }));
    setError('');
  }
  function locate() {
    setError('');
    if (!navigator.geolocation) {
      setError(
        'Location is unavailable in this browser. Enter your PIN code instead.',
      );
      return;
    }
    setLocating(true);
    origin.current = null;
    setLocated(false);
    setAreaMessage('');
    setChoices((old) => ({
      ...old,
      city: '',
      state: '',
      locality: '',
      pincode: '',
    }));
    const version = ++lookupVersion.current;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (version !== lookupVersion.current) return;
        origin.current = {
          latitude: Math.round(position.coords.latitude * 100) / 100,
          longitude: Math.round(position.coords.longitude * 100) / 100,
        };
        setLocated(true);
        try {
          const area = await request<DetectedArea>(
            `/api/v1/locations/reverse?latitude=${origin.current.latitude}&longitude=${origin.current.longitude}`,
            null,
          );
          if (version !== lookupVersion.current) return;
          setChoices((old) => ({ ...old, ...area }));
        } catch {
          if (version !== lookupVersion.current) return;
          setAreaMessage(
            'Your location is ready, but we couldn’t find the area name. You can still search nearby or enter a PIN code.',
          );
        } finally {
          if (version === lookupVersion.current) setLocating(false);
        }
      },
      () => {
        if (version !== lookupVersion.current) return;
        setLocating(false);
        setError(
          'We couldn’t access your location. Enter your PIN code to keep exploring.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  async function browse(kind: PlaygroundKind = choices.kind, example = false) {
    const current = { ...choices, kind };
    setChoices(current);
    setError('');
    setLiveMessage('');
    setEmptyArea(false);
    if (example) {
      searchVersion.current++;
      setBusy(false);
      setSamples(true);
      setResult({
        items: playgroundExamples(kind, current.sport),
        kind,
        area: 'Playground',
        requires_signup: true,
      });
      setStage('results');
      return;
    }
    if (!origin.current && !/^[1-9]\d{5}$/.test(current.pincode)) {
      setError('Use your location or enter a six-digit PIN code.');
      return;
    }
    const version = ++searchVersion.current;
    setBusy(true);
    try {
      if (!origin.current && current.pincode) {
        try {
          const location = await request<LocationResult>(
            `/api/v1/locations/pincode/${current.pincode}`,
            null,
          );
          if (version !== searchVersion.current) return;
          Object.assign(current, {
            city: location.city,
            state: location.state,
            locality: location.localities[0] || '',
          });
          setChoices(current);
        } catch {
          /* PIN matching can still work while the postal service is unavailable. */
        }
      }
      const data = await request<Preview>(
        '/api/v1/playground/recommendations',
        null,
        {
          method: 'POST',
          body: JSON.stringify({
            kind,
            sport: current.sport,
            skill_level: current.skill_level,
            gender: current.gender || null,
            ...(origin.current || { pincode: current.pincode }),
          }),
        },
      );
      if (version !== searchVersion.current) return;
      const empty = data.items.length === 0;
      setEmptyArea(empty);
      setResult(
        empty
          ? { ...data, items: playgroundExamples(kind, current.sport) }
          : data,
      );
      setSamples(empty);
      setStage('results');
    } catch (e) {
      if (version !== searchVersion.current) return;
      setLiveMessage(
        e instanceof Error ? e.message : 'Live previews are unavailable.',
      );
      setSamples(true);
      setResult({
        items: playgroundExamples(kind, current.sport),
        kind,
        area: 'Playground',
        requires_signup: true,
      });
      setStage('results');
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  }
  function act(item: PlaygroundItem) {
    if (isSignedIn) {
      router.push(
        playgroundDestination(choices.kind, samples ? null : item.id),
      );
      return;
    }
    signup(item);
  }
  function signup(item?: PlaygroundItem) {
    rememberPlayground(choices, item, samples);
    setStage('signup');
  }
  const currentMode = modes.find((mode) => mode.kind === choices.kind)!;
  return (
    <main className="min-h-svh bg-[#fcfbff]">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 border-b px-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Guest playground
          </Badge>
          <Button variant="ghost" size="sm" asChild>
            <Link href={isSignedIn ? '/dashboard' : '/sign-in'}>
              {isSignedIn ? 'Your workspace' : 'Sign in'}
            </Link>
          </Button>
        </div>
      </header>
      <div
        className={cn(
          'mx-auto px-4 py-4 sm:px-6 sm:py-5',
          stage === 'results' ? 'max-w-5xl' : 'max-w-3xl',
        )}
      >
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to Playhud
        </Link>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary">
          <Sparkles className="size-4" />A little play before you commit
        </div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
        >
          {stage === 'signup'
            ? 'Your next game is one hello away.'
            : stage === 'choices'
              ? [
                  'What’s your kind of game?',
                  'How do you identify?',
                  'What do you love playing?',
                ][choiceStep]
              : stage === 'location'
                ? 'Your next game starts nearby.'
                : 'Find your people.'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {stage === 'signup'
            ? 'Create your account to connect and join. Your choices are saved.'
            : stage === 'choices'
              ? [
                  'Find a playing partner, a community, or a game. Start with what you need today.',
                  'Choose what feels right. This is private, and you can skip it.',
                  'Choose a sport and the pace that feels like you.',
                ][choiceStep]
              : stage === 'location'
                ? 'Use an approximate location or an Indian PIN code. Or take a look around without sharing your location.'
                : samples
                  ? 'A playing partner, a regular crew, or your next game. Find your way to play.'
                  : `Public previews · ${result?.area || 'Your area'}. Create an account to connect, join, and see full details.`}
        </p>
        {(stage === 'choices' || stage === 'location') && (
          <div
            className="mt-4"
            role="progressbar"
            aria-label="Playground progress"
            aria-valuemin={1}
            aria-valuemax={4}
            aria-valuenow={stage === 'location' ? 4 : choiceStep + 1}
          >
            <p className="mb-2 text-xs text-muted-foreground">
              {stage === 'location' ? 4 : choiceStep + 1} of 4
            </p>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1.5 flex-1 rounded-full',
                    index <= (stage === 'location' ? 3 : choiceStep)
                      ? 'bg-primary'
                      : 'bg-primary/15',
                  )}
                />
              ))}
            </div>
          </div>
        )}
        <ErrorNotice message={error} />
        {stage === 'choices' && (
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (choiceStep < 2) setChoiceStep((step) => step + 1);
              else setStage('location');
              setError('');
            }}
          >
            {choiceStep === 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  I’m looking for
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {modes.map((mode) => (
                    <IllustratedChoice
                      key={mode.kind}
                      name="playground-kind"
                      value={mode.kind}
                      label={mode.label}
                      description={mode.description}
                      checked={choices.kind === mode.kind}
                      onChange={() => update('kind', mode.kind)}
                    >
                      <PlayIllustration
                        kind={
                          mode.kind === 'players'
                            ? 'join_individually'
                            : mode.kind === 'communities'
                              ? 'find_group'
                              : 'host_games'
                        }
                      />
                    </IllustratedChoice>
                  ))}
                </div>
              </fieldset>
            )}
            {choiceStep === 1 && (
              <fieldset className="rounded-3xl bg-white p-4 sm:p-5">
                <legend className="text-sm font-medium">
                  Gender (optional)
                </legend>
                <p className="mb-3 text-xs text-muted-foreground">
                  Choose what feels right. This is private, and you can skip it.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { value: 'man', label: 'Male' },
                    { value: 'woman', label: 'Female' },
                    { value: 'non_binary', label: 'Non-binary' },
                    { value: 'other', label: 'Self-describe' },
                    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                  ].map((option) => (
                    <IllustratedChoice
                      key={option.value}
                      name="guest-gender"
                      value={option.value}
                      label={option.label}
                      checked={choices.gender === option.value}
                      onChange={() => update('gender', option.value)}
                      compact
                    >
                      <PlayerAvatar
                        variant={option.value}
                        className="size-20 sm:size-24"
                      />
                    </IllustratedChoice>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 px-0 text-xs"
                  onClick={() => {
                    update('gender', '');
                    setChoiceStep(2);
                  }}
                >
                  Skip for now
                </Button>
              </fieldset>
            )}
            {choiceStep === 2 && (
              <div className="grid gap-5 rounded-3xl bg-white p-4 sm:p-5">
                <Field id="guest-sport" label="Your sport">
                  <select
                    id="guest-sport"
                    value={choices.sport}
                    onChange={(e) => update('sport', e.target.value)}
                    className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
                  >
                    {sports.map((sport) => (
                      <option key={sport}>{sport}</option>
                    ))}
                  </select>
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">
                    Your pace
                  </legend>
                  <div className="grid grid-cols-5 gap-1.5">
                    {skillLevels.map((level) => (
                      <label
                        key={level.value}
                        className="relative min-w-0 cursor-pointer text-center"
                      >
                        <input
                          type="radio"
                          name="guest-level"
                          aria-label={level.label}
                          value={level.value}
                          checked={choices.skill_level === level.value}
                          onChange={() => update('skill_level', level.value)}
                          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                        />
                        <span
                          aria-hidden="true"
                          className="mx-auto flex aspect-square w-full max-w-16 items-center justify-center rounded-xl border border-primary/20 bg-accent/60 text-2xl font-semibold text-accent-foreground transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:ring-2 peer-checked:ring-primary/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary"
                        >
                          {level.label[0]}
                        </span>
                        <span className="mt-1.5 block text-[9px] leading-4 sm:text-xs">
                          {level.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              {choiceStep > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChoiceStep((step) => step - 1);
                    setError('');
                  }}
                >
                  <ArrowLeft />
                  Back
                </Button>
              )}
              <Button size="lg" type="submit" className="ml-auto">
                {choiceStep === 2 ? 'Find my playground' : 'Continue'}
                <ArrowRight />
              </Button>
            </div>
          </form>
        )}
        {stage === 'location' && (
          <form
            className="mt-5 max-w-xl space-y-4 rounded-2xl border bg-white p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void browse();
            }}
          >
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={locating || busy}
              onClick={locate}
            >
              <BusyLabel busy={locating}>
                <LocateFixed className="size-4" />
                {located ? 'Approximate location ready' : 'Use my location'}
              </BusyLabel>
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              To show your area name, Use my location shares rounded coordinates
              with{' '}
              <a
                href="https://operations.osmfoundation.org/policies/nominatim/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                OpenStreetMap’s Nominatim service
              </a>
              . You can enter a PIN code instead.
            </p>
            {located && (
              <div
                role="status"
                className="rounded-xl bg-accent/40 p-3 text-sm"
              >
                <p className="flex items-center gap-2 font-medium text-primary">
                  <MapPin className="size-4" />
                  {locating ? 'Finding your area…' : 'Location detected'}
                </p>
                {choices.city ||
                choices.locality ||
                choices.state ||
                choices.pincode ? (
                  <>
                    <p className="mt-1 font-medium">
                      {[choices.locality, choices.city, choices.state]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                    {choices.pincode && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        PIN {choices.pincode}
                      </p>
                    )}
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[10px] text-muted-foreground underline"
                    >
                      © OpenStreetMap contributors
                    </a>
                  </>
                ) : (
                  !locating && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {areaMessage}
                    </p>
                  )
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Approximate area. Your exact position stays private.
                </p>
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or enter a PIN code
              <span className="h-px flex-1 bg-border" />
            </div>
            <Field id="guest-pin" label="PIN code">
              <Input
                id="guest-pin"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                placeholder="e.g. 201014"
                value={choices.pincode}
                onChange={(e) => {
                  lookupVersion.current++;
                  setLocating(false);
                  origin.current = null;
                  setLocated(false);
                  setAreaMessage('');
                  setChoices((old) => ({
                    ...old,
                    city: '',
                    state: '',
                    locality: '',
                  }));
                  update('pincode', e.target.value.replace(/\D/g, ''));
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || locating}>
                <BusyLabel busy={busy}>
                  {busy ? 'Finding your area…' : 'Show nearby previews'}
                  <ArrowRight />
                </BusyLabel>
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => browse(choices.kind, true)}
              >
                Take a look around
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => {
                lookupVersion.current++;
                setLocating(false);
                setStage('choices');
              }}
            >
              <ArrowLeft className="size-3" /> Back
            </Button>
          </form>
        )}
        {stage === 'results' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Explore the playground"
                className="flex max-w-full gap-1 rounded-xl border bg-white p-1"
              >
                {modes.map((mode) => (
                  <button
                    role="tab"
                    type="button"
                    key={mode.kind}
                    aria-selected={choices.kind === mode.kind}
                    disabled={busy}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs font-medium sm:text-sm',
                      choices.kind === mode.kind
                        ? 'bg-primary text-white'
                        : 'text-muted-foreground',
                    )}
                    onClick={() =>
                      browse(
                        mode.kind,
                        samples &&
                          !origin.current &&
                          !/^[1-9]\d{5}$/.test(choices.pincode),
                      )
                    }
                  >
                    {mode.short}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  searchVersion.current++;
                  setBusy(false);
                  setChoiceStep(0);
                  setStage('choices');
                }}
              >
                Change choices
              </Button>
            </div>
            {samples && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>
                  {emptyArea
                    ? 'No public matches nearby yet. Demo profiles below.'
                    : liveMessage
                      ? 'Nearby results are unavailable. Demo profiles below.'
                      : 'Demo profiles · Try the experience before joining.'}
                </p>
                {liveMessage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => browse(choices.kind, false)}
                  >
                    Retry nearby previews
                  </Button>
                )}
              </div>
            )}
            {busy ? (
              <p role="status" className="py-6 text-sm text-muted-foreground">
                Finding your next game…
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result?.items.map((item, index) => (
                  <article
                    key={item.id}
                    className="flex min-w-0 flex-col rounded-2xl border bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          'flex size-16 items-center justify-center rounded-2xl text-xl font-semibold',
                          index % 2
                            ? 'bg-lime-100 text-lime-900'
                            : 'bg-accent text-primary',
                        )}
                      >
                        {choices.kind === 'players' ? (
                          <PlayerAvatar
                            variant={index % 2 ? 'woman' : 'man'}
                            className="size-16"
                          />
                        ) : (
                          <currentMode.icon className="size-5" />
                        )}
                      </div>
                      <Badge variant="outline">{item.sport}</Badge>
                    </div>
                    <h2 className="break-words text-lg font-semibold">
                      {item.name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {item.area}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.skill_level && (
                        <Badge variant="secondary" className="capitalize">
                          {item.skill_level}
                        </Badge>
                      )}
                      {item.member_count !== undefined && (
                        <Badge variant="secondary">
                          {item.member_count} members
                        </Badge>
                      )}
                      {item.spots_left !== undefined && (
                        <Badge variant="secondary">
                          {item.spots_left} open spots
                        </Badge>
                      )}
                      {item.starts_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.starts_at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    <Button className="mt-5 w-full" onClick={() => act(item)}>
                      {item.action}
                      <ArrowRight className="size-4" />
                    </Button>
                  </article>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent/60 p-4">
              <p className="text-sm">
                <strong>Found your kind of people?</strong>
                <br />
                <span className="text-muted-foreground">
                  Keep your choices and make your first hello.
                </span>
              </p>
              <Button onClick={() => signup()}>
                Create my account
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}
        {stage === 'signup' && (
          <div className="mx-auto mt-5 max-w-md rounded-3xl border bg-white p-5 sm:p-7">
            <Suspense fallback={<p role="status">Loading sign-up…</p>}>
              <AuthForm mode="sign-up" />
            </Suspense>
            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => setStage('results')}
            >
              Keep exploring
            </Button>
          </div>
        )}
        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Browse freely. Connections, memberships, messages, and game bookings
          start after you create an account.
        </p>
      </div>
    </main>
  );
}
