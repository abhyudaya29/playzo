'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  IllustratedChoice,
  PlayerAvatar,
  PlayIllustration,
} from '@/components/onboarding-visuals';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  MapPin,
  ShieldCheck,
  LocateFixed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ErrorNotice,
  CardSkeletons,
  Field,
  BusyLabel,
} from '@/components/page-ui';
import { useResource } from '@/lib/use-resource';
import { request, sports } from '@/lib/api';
import { Profile, skillLevels } from '@/lib/types';
import { normalizePhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
type LocationLookup = { city: string; state: string; localities: string[] };
const initial = {
  name: '',
  phone: '',
  nickname: '',
  age: '',
  gender: '',
  looking_for: '',
  motivation: '',
  pincode: '',
  city: '',
  state: '',
  locality: '',
  street_address: '',
  latitude: null as number | null,
  longitude: null as number | null,
  search_radius_km: 5,
};
export default function Onboarding() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const profile = useResource<Profile>('/api/v1/users/me');
  const [form, setForm] = useState(initial),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [languages, setLanguages] = useState<string[]>([]),
    [language, setLanguage] = useState(''),
    [localities, setLocalities] = useState<string[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const loadedProfile = useRef<Profile | null>(null);
  const editing = loadedProfile.current?.onboarding_completed ?? false;
  const reviewing = !editing && step === 6;
  const showAll = editing || reviewing;
  const steps = [
    'How do you identify?',
    'What are you looking for?',
    'What should we call you?',
    'Where do you play?',
    'What do you love playing?',
    'A little more about you',
    'Your player profile, all together.',
  ];
  const descriptions = [
    'A little introduction, on your terms. Only you can see this answer.',
    'A solo game, a regular crew, or a game of your own. Pick your starting point.',
    'Give your next teammates a name to remember.',
    'The best games are close enough to become a habit.',
    'Pick your sports and the pace that feels like you.',
    'A few little things that make you, you. Everything here is optional.',
    'Take a look, make any changes, and you’re ready for your first hello.',
  ];
  function goToStep(next: number) {
    setError('');
    setDirection(next > step ? 1 : -1);
    setTransitioning(true);
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  const loaded = useRef(false);
  const geoRevision = useRef(0);
  function update<K extends keyof typeof initial>(
    key: K,
    value: (typeof initial)[K],
  ) {
    setError('');
    setForm((old) => ({ ...old, [key]: value }));
  }
  useEffect(() => {
    if (!profile.data || loaded.current) return;
    loaded.current = true;
    const p = profile.data;
    loadedProfile.current = p;
    setForm({
      ...initial,
      ...p.location,
      name: p.onboarding_completed
        ? p.name
        : user?.fullName || user?.firstName || '',
      phone: p.phone || '',
      nickname: p.nickname || '',
      age: p.age?.toString() || '',
      gender: p.gender || '',
      motivation: p.motivation || '',
      looking_for: p.looking_for || '',
      street_address: p.location?.street_address || '',
      search_radius_km: p.search_radius_km,
    });
    setLanguages(p.languages || []);
    setSelected(
      Object.fromEntries(
        p.sports.map((item) => [item.sport, item.skill_level]),
      ),
    );
    setReady(true);
  }, [profile.data, user]);
  useEffect(() => {
    if (!ready || form.pincode.length !== 6) return;
    let active = true;
    const controller = new AbortController();
    request<LocationLookup>(`/api/v1/locations/pincode/${form.pincode}`, null, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return;
        setLocalities(result.localities);
        setForm((old) => ({
          ...old,
          city: old.city || result.city,
          state: old.state || result.state,
          locality: old.locality || result.localities[0] || '',
        }));
      })
      .catch(() => {
        if (active) {
          setLocalities([]);
          setNotice(
            'PIN lookup is unavailable. You can enter your city and locality below.',
          );
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [form.pincode, ready]);
  function changePin(value: string) {
    geoRevision.current++;
    setLocalities([]);
    setNotice('');
    setForm((old) => ({
      ...old,
      pincode: value.replace(/\D/g, '').slice(0, 6),
      city: '',
      state: '',
      locality: '',
      latitude: null,
      longitude: null,
    }));
  }
  function useLocation() {
    if (!navigator.geolocation) {
      setNotice(
        'Location is unavailable in this browser. Enter your PIN and locality instead.',
      );
      return;
    }
    setLocating(true);
    const revision = ++geoRevision.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        if (revision !== geoRevision.current) return;
        setForm((old) => ({
          ...old,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setNotice('Location captured. Your precise location stays private.');
      },
      () => {
        setLocating(false);
        setNotice(
          'Location permission was unavailable. Enter your PIN and locality instead.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!editing && step < steps.length - 1) {
      if (step === 1 && !form.looking_for) {
        setError('Choose how you would like to play.');
        return;
      }
      if (step === 2) {
        try {
          normalizePhone(form.phone);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Check your phone number.');
          return;
        }
      }
      if (
        step === 3 &&
        (!/^\d{6}$/.test(form.pincode) ||
          !form.locality.trim() ||
          !form.city.trim())
      ) {
        setError('Add a six-digit PIN code, city, and locality.');
        return;
      }
      if (step === 2 && !nameValid()) {
        setError('Add your name to continue.');
        return;
      }
      if (step === 4 && !Object.keys(selected).length) {
        setError('Choose at least one sport to continue.');
        return;
      }
      goToStep(step + 1);
      return;
    }
    if (
      !nameValid() ||
      !form.locality.trim() ||
      !form.city.trim() ||
      Object.keys(selected).length === 0
    ) {
      setError(
        'Add your name, city, locality, and at least one sport to continue.',
      );
      return;
    }
    setBusy(true);
    try {
      await request('/api/v1/users/me/onboarding', await getToken(), {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          nickname: form.nickname.trim() || null,
          age: form.age ? Number(form.age) : null,
          gender: form.gender || null,
          looking_for: form.looking_for || null,
          motivation: form.motivation || null,
          languages,
          phone: normalizePhone(form.phone),
          street_address: form.street_address.trim() || null,
          sports: Object.entries(selected).map(([sport, skill_level]) => ({
            sport,
            skill_level,
          })),
        }),
      });
      await profile.reload();
      router.push(
        editing || form.looking_for === 'join_individually'
          ? '/dashboard'
          : form.looking_for === 'find_group'
            ? '/groups'
            : '/games',
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your profile. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  function addLanguage() {
    const value = language.trim();
    if (!value || languages.length >= 10) return;
    setLanguages((old) =>
      old.some((item) => item.toLowerCase() === value.toLowerCase())
        ? old
        : [...old, value],
    );
    setLanguage('');
  }
  function nameValid() {
    return !!form.name.trim();
  }
  return (
    <div className={cn('mx-auto', showAll ? 'max-w-4xl' : 'max-w-3xl')}>
      <div className="mb-7 flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
          <Sparkles className="size-4" />
          {editing
            ? 'Your player profile'
            : reviewing
              ? 'Ready when you are'
              : 'A little hello before we play'}
        </p>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Your game. Your crew.
        </span>
      </div>
      {editing && (
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Make it your playground.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your details, all in one place. Keep them feeling like you.
          </p>
        </div>
      )}
      {profile.error && !profile.data ? (
        <ErrorNotice message={profile.error} retry={profile.reload} />
      ) : !ready ? (
        <CardSkeletons />
      ) : (
        <form id="profile-form" onSubmit={submit} className="space-y-6">
          {!editing && (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {reviewing ? 'One last look' : 'Let’s get acquainted'}
                </span>
                <span className="tabular-nums">
                  {String(step + 1).padStart(2, '0')}{' '}
                  <span className="text-muted-foreground/50">
                    / {String(steps.length).padStart(2, '0')}
                  </span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Profile setup"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={step + 1}
                className="flex gap-1.5"
              >
                {steps.map((title, index) => (
                  <div
                    key={title}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10"
                  >
                    <motion.div
                      initial={false}
                      animate={{ scaleX: index <= step ? 1 : 0 }}
                      transition={{ duration: reducedMotion ? 0 : 0.3 }}
                      className="h-full origin-left rounded-full bg-primary"
                    />
                  </div>
                ))}
              </div>
              <div className="pb-2 pt-3 sm:pt-5">
                <p className="mb-3 text-xs font-medium text-primary">
                  {reviewing
                    ? 'The whole you'
                    : [
                        'About you',
                        'Your people',
                        'First names first',
                        'Keep it local',
                        'Find your rhythm',
                        'The little things',
                      ][step]}
                </p>
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="scroll-mt-24 text-3xl font-semibold leading-tight tracking-tight outline-none sm:text-[40px]"
                >
                  {steps[step]}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  {descriptions[step]}
                </p>
              </div>
            </div>
          )}
          <div className="-mx-1 overflow-x-clip px-1">
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={editing ? 'profile' : step}
                custom={direction}
                variants={{
                  enter: (d: number) => ({
                    opacity: 0,
                    x: reducedMotion ? 0 : d * 20,
                  }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({
                    opacity: 0,
                    x: reducedMotion ? 0 : -d * 14,
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: reducedMotion ? 0 : 0.2,
                  ease: 'easeOut',
                }}
                onAnimationComplete={() => setTransitioning(false)}
                className={cn(
                  'space-y-6',
                  transitioning && 'pointer-events-none',
                )}
              >
                {reviewing && (
                  <div className="flex items-center gap-4 rounded-3xl border border-primary/10 bg-accent/50 p-5">
                    <PlayerAvatar
                      variant={form.gender || 'other'}
                      className="size-20 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="break-words text-xl font-semibold">
                        {form.nickname || form.name}, meet your next chapter.
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {Object.keys(selected).join(' · ')}
                        <br />
                        {form.locality}, {form.city}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" />
                        Your profile is ready to review
                      </span>
                    </div>
                  </div>
                )}
                <ErrorNotice message={error || profile.error} />
                {(showAll || step === 0) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <CardTitle>Gender</CardTitle>
                      <CardDescription>
                        Choose what feels right. This is private, and you can
                        skip it.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <legend className="sr-only">Gender (optional)</legend>
                        {[
                          { value: 'man', label: 'Male' },
                          { value: 'woman', label: 'Female' },
                          { value: 'other', label: 'Others' },
                          {
                            value: 'prefer_not_to_say',
                            label: 'Prefer not to say',
                          },
                          ...(form.gender === 'non_binary'
                            ? [{ value: 'non_binary', label: 'Non-binary' }]
                            : []),
                        ].map((option) => (
                          <IllustratedChoice
                            key={option.value}
                            name="gender"
                            value={option.value}
                            label={option.label}
                            checked={form.gender === option.value}
                            onChange={() => update('gender', option.value)}
                            compact
                          >
                            <PlayerAvatar
                              variant={option.value}
                              className="size-20 sm:size-24"
                            />
                          </IllustratedChoice>
                        ))}
                      </fieldset>
                    </CardContent>
                  </Card>
                )}
                {(showAll || step === 1) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <CardTitle>Your way to play</CardTitle>
                      <CardDescription>
                        Start with what you need today. You can always change
                        this later.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <fieldset className="grid gap-3 sm:grid-cols-3">
                        <legend className="sr-only">
                          What are you looking for?
                        </legend>
                        {[
                          {
                            value: 'join_individually',
                            label: 'Join individually',
                            description:
                              'Find a player or an open spot in a game.',
                          },
                          {
                            value: 'find_group',
                            label: 'Find my group',
                            description:
                              'Meet a local community and make it a regular thing.',
                          },
                          {
                            value: 'host_games',
                            label: 'Host games',
                            description:
                              'Bring people together and get a game going.',
                          },
                        ].map((option) => (
                          <IllustratedChoice
                            key={option.value}
                            name="looking-for"
                            value={option.value}
                            label={option.label}
                            description={option.description}
                            checked={form.looking_for === option.value}
                            onChange={() => update('looking_for', option.value)}
                          >
                            <PlayIllustration kind={option.value} />
                          </IllustratedChoice>
                        ))}
                      </fieldset>
                    </CardContent>
                  </Card>
                )}
                {(showAll || step === 2) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <div className="flex items-center gap-3">
                        <CardTitle>About you</CardTitle>
                      </div>
                      <CardDescription>
                        A name your next teammates can remember.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-5 sm:grid-cols-2">
                      <Field id="name" label="Full name">
                        <Input
                          id="name"
                          autoComplete="name"
                          required
                          maxLength={150}
                          placeholder="Your name"
                          value={form.name}
                          onChange={(e) => update('name', e.target.value)}
                        />
                      </Field>
                      <Field
                        id="phone"
                        label="Phone number (optional)"
                        description="Saved privately and unverified. Not used for sign-in."
                      >
                        <Input
                          id="phone"
                          type="tel"
                          autoComplete="tel"
                          aria-describedby="phone-help"
                          maxLength={30}
                          placeholder="+91 98765 43210"
                          value={form.phone}
                          onChange={(e) => update('phone', e.target.value)}
                        />
                      </Field>
                      <Field
                        id="nickname"
                        label="Nickname (optional)"
                        description="What do your friends call you?"
                      >
                        <Input
                          id="nickname"
                          maxLength={80}
                          value={form.nickname}
                          onChange={(e) => update('nickname', e.target.value)}
                          placeholder="Your courtside name"
                        />
                      </Field>
                      <Field
                        id="age"
                        label="Age (optional)"
                        description="Only visible to you."
                      >
                        <Input
                          id="age"
                          type="number"
                          min={1}
                          max={120}
                          value={form.age}
                          onChange={(e) => update('age', e.target.value)}
                        />
                      </Field>
                    </CardContent>
                  </Card>
                )}
                {(showAll || step === 3) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <div className="flex items-center gap-3">
                        <CardTitle>Your neighborhood</CardTitle>
                      </div>
                      <CardDescription>
                        Find players close enough to make a regular game happen.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <Button
                        variant="outline"
                        type="button"
                        disabled={locating}
                        onClick={useLocation}
                      >
                        <BusyLabel busy={locating}>
                          <LocateFixed />
                          Use my location
                        </BusyLabel>
                      </Button>
                      {notice && (
                        <Alert>
                          <MapPin className="size-4" />
                          <AlertDescription>{notice}</AlertDescription>
                        </Alert>
                      )}
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field id="pincode" label="PIN code">
                          <Input
                            id="pincode"
                            required
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            autoComplete="postal-code"
                            placeholder="201014"
                            value={form.pincode}
                            onChange={(e) => changePin(e.target.value)}
                          />
                        </Field>
                        <Field id="locality" label="Locality">
                          <Input
                            id="locality"
                            required
                            maxLength={160}
                            list="locality-options"
                            placeholder="Your neighborhood"
                            value={form.locality}
                            onChange={(e) => update('locality', e.target.value)}
                          />
                          <datalist id="locality-options">
                            {localities.map((item) => (
                              <option key={item} value={item} />
                            ))}
                          </datalist>
                        </Field>
                        <Field id="city" label="City">
                          <Input
                            id="city"
                            required
                            maxLength={160}
                            autoComplete="address-level2"
                            placeholder="Your city"
                            value={form.city}
                            onChange={(e) => update('city', e.target.value)}
                          />
                        </Field>
                        <Field id="state" label="State">
                          <Input
                            id="state"
                            autoComplete="address-level1"
                            placeholder="Your state"
                            value={form.state}
                            onChange={(e) => update('state', e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field
                        id="street"
                        label="Street or landmark (optional)"
                        description="Only you can see your full address."
                      >
                        <Input
                          id="street"
                          placeholder="Nearby landmark"
                          aria-describedby="street-help"
                          value={form.street_address}
                          onChange={(e) =>
                            update('street_address', e.target.value)
                          }
                        />
                      </Field>
                      <div className="space-y-4 border-t pt-5">
                        <div className="flex justify-between text-sm">
                          <Label htmlFor="discovery-radius">
                            Discovery radius
                          </Label>
                          <span className="font-medium text-primary">
                            {form.search_radius_km} km
                          </span>
                        </div>
                        <Slider
                          id="discovery-radius"
                          aria-label="Default discovery radius in kilometers"
                          min={1}
                          max={30}
                          step={1}
                          value={[form.search_radius_km]}
                          onValueChange={([value]) =>
                            update('search_radius_km', value)
                          }
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          Without device location, discovery uses the
                          approximate center of your PIN-code area.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(showAll || step === 4) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <div className="flex items-center gap-3">
                        <CardTitle>Your sports, your pace</CardTitle>
                      </div>
                      <CardDescription>
                        Pick at least one sport and the skill level that feels
                        right.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4">
                        {sports.map((sport) => (
                          <div
                            key={sport}
                            className={cn(
                              'space-y-4 rounded-xl border p-4',
                              selected[sport] &&
                                'border-primary/30 bg-accent/40',
                            )}
                          >
                            <Label
                              htmlFor={`sport-${sport}`}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <Checkbox
                                id={`sport-${sport}`}
                                checked={!!selected[sport]}
                                onCheckedChange={(checked) =>
                                  setSelected((old) => {
                                    const next = { ...old };
                                    if (checked === true)
                                      next[sport] = 'beginner';
                                    else delete next[sport];
                                    return next;
                                  })
                                }
                              />
                              {sport}
                            </Label>
                            {selected[sport] && (
                              <fieldset>
                                <legend className="mb-3 text-xs font-medium text-muted-foreground">
                                  Your level in {sport}
                                </legend>
                                <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
                                  {skillLevels.map((level, index) => (
                                    <label
                                      key={level.value}
                                      className="relative min-w-0 cursor-pointer text-center"
                                    >
                                      <input
                                        type="radio"
                                        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                                        name={`level-${sport}`}
                                        value={level.value}
                                        checked={
                                          selected[sport] === level.value
                                        }
                                        onChange={() =>
                                          setSelected((old) => ({
                                            ...old,
                                            [sport]: level.value,
                                          }))
                                        }
                                      />
                                      <span
                                        aria-hidden="true"
                                        className={cn(
                                          'mx-auto flex aspect-square w-full max-w-16 items-center justify-center rounded-xl border-2 border-transparent text-2xl font-black transition peer-checked:border-foreground peer-checked:ring-2 peer-checked:ring-foreground/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                                          [
                                            'bg-lime-200 text-lime-950',
                                            'bg-emerald-300 text-emerald-950',
                                            'bg-orange-300 text-orange-950',
                                            'bg-blue-300 text-blue-950',
                                            'bg-yellow-200 text-yellow-950',
                                          ][index],
                                        )}
                                      >
                                        {level.label[0]}
                                      </span>
                                      <span className="mt-2 block break-words text-[10px] sm:text-xs">
                                        {level.label}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                  {
                                    (
                                      {
                                        hobby:
                                          'A casual hit, with no pressure to compete.',
                                        beginner:
                                          'Learning the basics and finding your rhythm.',
                                        intermediate:
                                          'Comfortable with the basics and ready for a challenge.',
                                        advanced:
                                          'Consistent technique and competitive games.',
                                        pro: 'Experienced in tournaments and high-level competition.',
                                      } as Record<string, string>
                                    )[selected[sport]]
                                  }
                                </p>
                              </fieldset>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(showAll || step === 5) && (
                  <Card
                    className={cn(
                      'rounded-3xl border-primary/10 shadow-none',
                      !showAll && 'gap-5 border-0 bg-white py-6 sm:py-8',
                    )}
                  >
                    <CardHeader className={cn(!showAll && 'sr-only')}>
                      <div className="flex items-center gap-3">
                        <CardTitle>Make it your game</CardTitle>
                      </div>
                      <CardDescription>
                        Optional details to help us get to know you. Leave these
                        blank to skip for now.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <fieldset>
                        <legend className="mb-3 text-sm font-medium">
                          What brings you here?
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[
                            {
                              value: 'starting_out',
                              label: 'Starting my sporting journey',
                            },
                            { value: 'comeback', label: 'Making a comeback' },
                            {
                              value: 'try_something_new',
                              label: 'Trying a new sport',
                            },
                            {
                              value: 'just_for_fun',
                              label: 'Just here to enjoy',
                            },
                          ].map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              variant={
                                form.motivation === option.value
                                  ? 'default'
                                  : 'outline'
                              }
                              aria-pressed={form.motivation === option.value}
                              className="h-auto min-h-12 whitespace-normal justify-start"
                              onClick={() =>
                                update(
                                  'motivation',
                                  form.motivation === option.value
                                    ? ''
                                    : option.value,
                                )
                              }
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </fieldset>
                      <div className="space-y-3">
                        <Field
                          id="language"
                          label="Languages you speak (optional)"
                          description="Add up to 10 languages you are comfortable playing in."
                        >
                          <div className="flex gap-2">
                            <Input
                              id="language"
                              value={language}
                              maxLength={40}
                              placeholder="e.g. Hindi, English"
                              onChange={(e) => setLanguage(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addLanguage();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={
                                !language.trim() || languages.length >= 10
                              }
                              onClick={addLanguage}
                            >
                              Add
                            </Button>
                          </div>
                        </Field>
                        <div
                          className="flex flex-wrap gap-2"
                          aria-live="polite"
                        >
                          {languages.map((item) => (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              key={item}
                              aria-label={`Remove ${item}`}
                              onClick={() =>
                                setLanguages((old) =>
                                  old.filter((value) => value !== item),
                                )
                              }
                            >
                              {item} ×
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-5">
            {!editing && step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || transitioning}
                onClick={() => goToStep(step - 1)}
              >
                <ArrowLeft />
                Back
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {editing ? 'Make yourself at home.' : 'Always room to be you.'}
              </span>
            )}
            <div className="flex gap-2">
              {!editing && (step === 0 || step === 5) && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || transitioning}
                  onClick={() => goToStep(step + 1)}
                >
                  Skip for now
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                className="rounded-full px-6"
                disabled={busy || locating || transitioning}
              >
                <BusyLabel busy={busy}>
                  {busy
                    ? 'Saving your profile…'
                    : editing
                      ? 'Save profile'
                      : reviewing
                        ? 'Let’s play'
                        : step === 5
                          ? 'Review my profile'
                          : 'Continue'}
                  {!busy && <ArrowRight />}
                </BusyLabel>
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            Your phone, gender, age, and exact address stay private. Players see
            your neighbourhood and approximate distance.
          </p>
        </form>
      )}
    </div>
  );
}
