'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  IllustratedChoice,
  PlayerAvatar,
  PlayIllustration,
} from '@/components/onboarding-visuals';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
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
import { request } from '@/lib/api';
import { useSports } from '@/lib/use-sports';
import { Textarea } from '@/components/ui/textarea';
import { OptionSelect } from '@/components/option-select';
import PlayerPhoto from '@/components/PlayerPhoto';
import ProfileTabs, { ProfileTab } from '@/components/ProfileTabs';
import ProfilePosts from '@/components/ProfilePosts';
import GuestPreviewSettings from '@/components/GuestPreviewSettings';
import {
  readPlaygroundChoices,
  consumePlaygroundDestination,
} from '@/lib/playground';
import OnboardingIntro from '@/components/OnboardingIntro';
import { Availability } from '@/lib/types';
import { days, interests } from '@/lib/player-options';
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
  bio: '',
  gender_self_description: '',
  gender_visibility: 'private',
  discovery_visible: true,
  teammate_preference: 'no_preference',
  participation_interests: [] as string[],
  availability: [] as Availability[],
};
export default function Onboarding() {
  const { getToken } = useAuth();
  const { openUserProfile } = useClerk();
  const catalog = useSports();
  const sports = catalog.data || [];
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
  const [intentions, setIntentions] = useState<Record<string, string>>({});
  const [draftStatus, setDraftStatus] = useState('');
  const draftQueue = useRef(Promise.resolve());
  const completing = useRef(false);
  const [step, setStep] = useState(0);
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts');
  const [introComplete, setIntroComplete] = useState(false);
  const [direction, setDirection] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const loadedProfile = useRef<Profile | null>(null);
  const editing = loadedProfile.current?.onboarding_completed ?? false;
  const showAll = editing;
  const showIntro =
    ready &&
    !editing &&
    !introComplete &&
    loadedProfile.current?.onboarding_step === 0;
  useEffect(() => {
    if (!ready) return;
    if (editing || loadedProfile.current?.onboarding_step !== 0) {
      setIntroComplete(true);
      return;
    }
    const key = `playhud:onboarding-intro:${user?.id}`;
    try {
      if (sessionStorage.getItem(key)) {
        setIntroComplete(true);
        return;
      }
    } catch {
      /* The intro still works when browser storage is unavailable. */
    }
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, 'seen');
      } catch {}
      setIntroComplete(true);
      requestAnimationFrame(() =>
        heading.current?.focus({ preventScroll: true }),
      );
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [ready, editing, user?.id]);
  const steps = [
    'How do you identify?',
    'What are you looking for?',
    'Where do you play?',
    'What do you love playing?',
    'A little more about you',
  ];
  const descriptions = [
    'A little introduction, on your terms. Only you can see this answer.',
    'A solo game, a regular crew, or a game of your own. Pick your starting point.',
    'The best games are close enough to become a habit.',
    'Pick your sports and the pace that feels like you.',
    'A few little things that make you, you. Everything here is optional.',
  ];
  function payload() {
    return {
      ...form,
      name: user?.fullName || user?.firstName || form.name,
      phone: normalizePhone(form.phone),
      age: form.age ? Number(form.age) : null,
      gender: form.gender || null,
      looking_for: form.looking_for || null,
      motivation: form.motivation || null,
      nickname: form.nickname.trim() || null,
      languages,
      sports: Object.entries(selected).map(([sport, skill_level]) => ({
        sport,
        skill_level,
        play_intention: intentions[sport] || 'both',
      })),
    };
  }
  function saveDraft(next = step) {
    if (editing || completing.current) return Promise.resolve();
    let data;
    try {
      data = { step: next, profile: payload() };
    } catch {
      return Promise.resolve();
    }
    setDraftStatus('Saving progress…');
    const task = draftQueue.current
      .catch(() => {})
      .then(async () => {
        await request('/api/v1/onboarding/me', await getToken(), {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      });
    draftQueue.current = task;
    return task
      .then(() => setDraftStatus('Progress saved'))
      .catch((error) => {
        setDraftStatus('Progress could not be saved.');
        throw error;
      });
  }
  async function goToStep(next: number) {
    setError('');
    setBusy(true);
    try {
      await saveDraft(next);
      setDirection(next > step ? 1 : -1);
      setTransitioning(true);
      setStep(next);
      requestAnimationFrame(() => {
        heading.current?.focus();
        heading.current?.scrollIntoView({
          block: 'start',
          behavior: 'instant',
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save progress.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!ready || showIntro || editing || busy || completing.current) return;
    const timer = setTimeout(() => {
      void saveDraft().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    form,
    selected,
    intentions,
    languages,
    step,
    ready,
    showIntro,
    editing,
    busy,
  ]);
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
    if (!profile.data || !user || loaded.current) return;
    loaded.current = true;
    const p = profile.data;
    loadedProfile.current = p;
    const guest =
      !p.onboarding_completed && !Object.keys(p.onboarding_draft).length
        ? readPlaygroundChoices()
        : null;
    setForm({
      ...initial,
      ...p.location,
      phone: p.phone || '',
      nickname: p.nickname || '',
      gender: p.gender || '',
      motivation: p.motivation || '',
      street_address: p.location?.street_address || '',
      search_radius_km: p.search_radius_km,
      bio: p.bio || '',
      gender_self_description: p.gender_self_description || '',
      gender_visibility: p.gender_visibility,
      discovery_visible: p.discovery_visible,
      teammate_preference: p.teammate_preference,
      participation_interests: p.participation_interests,
      availability: p.availability,
      ...(!p.onboarding_completed
        ? Object.fromEntries(
            Object.entries(p.onboarding_draft).filter(
              ([key]) => key in initial,
            ),
          )
        : {}),
      ...(guest
        ? {
            gender: guest.gender,
            pincode: guest.pincode,
            city: guest.city,
            locality: guest.locality,
            state: guest.state,
            participation_interests: [
              guest.kind === 'communities'
                ? 'join_groups'
                : guest.kind === 'games'
                  ? 'join_games'
                  : 'find_teammates',
            ],
          }
        : {}),
      // Signup identity remains authoritative over any old draft name.
      name: user.fullName || user.firstName || p.name,
      age:
        (!p.onboarding_completed && p.onboarding_draft.age != null
          ? String(p.onboarding_draft.age)
          : p.age?.toString()) || '',
      looking_for: ((!p.onboarding_completed &&
        p.onboarding_draft.looking_for) ||
        p.looking_for ||
        (guest
          ? guest.kind === 'communities'
            ? 'find_group'
            : 'join_individually'
          : '')) as string,
    });
    setLanguages(
      (!p.onboarding_completed && Array.isArray(p.onboarding_draft.languages)
        ? p.onboarding_draft.languages
        : p.languages) as string[],
    );
    const draftSports =
      !p.onboarding_completed && Array.isArray(p.onboarding_draft.sports)
        ? (p.onboarding_draft.sports as Profile['sports'])
        : guest
          ? [
              {
                sport: guest.sport,
                skill_level: guest.skill_level,
                play_intention: 'both',
              },
            ]
          : p.sports;
    setIntentions(
      Object.fromEntries(
        draftSports.map((s) => [s.sport, s.play_intention || 'both']),
      ),
    );
    setStep(
      p.onboarding_completed
        ? 0
        : Math.min(p.onboarding_step, steps.length - 1),
    );
    setSelected(
      Object.fromEntries(
        draftSports.map((item) => [item.sport, item.skill_level]),
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
      if (
        step === 2 &&
        (!/^[1-9]\d{5}$/.test(form.pincode) ||
          !form.locality.trim() ||
          !form.city.trim())
      ) {
        setError('Add a six-digit PIN code, city, and locality.');
        return;
      }
      if (step === 3 && !Object.keys(selected).length) {
        setError('Choose at least one sport to continue.');
        return;
      }
      await goToStep(step + 1);
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
      completing.current = true;
      await draftQueue.current.catch(() => {});
      await request('/api/v1/users/me/onboarding', await getToken(), {
        method: 'PUT',
        body: JSON.stringify(payload()),
      });
      await profile.reload();
      if (editing) {
        setNotice('Your profile has been saved.');
        return;
      }
      router.push(
        consumePlaygroundDestination() ||
          (form.looking_for === 'join_individually'
            ? '/dashboard'
            : form.looking_for === 'find_group'
              ? '/groups'
              : '/games'),
      );
    } catch (e) {
      completing.current = false;
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
    <div className="mx-auto max-w-3xl">
      {editing && <h1 className="sr-only">Your player profile</h1>}
      {profile.error && !profile.data ? (
        <ErrorNotice message={profile.error} retry={profile.reload} />
      ) : !ready ? (
        <CardSkeletons />
      ) : showIntro ? (
        <OnboardingIntro />
      ) : (
        <>
          {editing && (
            <div className="mb-3 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border bg-white p-3">
                <PlayerPhoto
                  name={user?.fullName || form.name}
                  url={user?.imageUrl}
                  className="size-12 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {user?.fullName || form.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your player profile
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openUserProfile()}
                >
                  Manage account
                </Button>
              </div>
              <ProfileTabs
                value={profileTab}
                onChange={(tab) => {
                  setProfileTab(tab);
                  setError('');
                  setNotice('');
                }}
              />
            </div>
          )}
          {editing && notice && (
            <p role="status" className="mb-3 text-sm text-primary">
              {notice}
            </p>
          )}
          {editing && profileTab === 'posts' ? (
            <ProfilePosts name={user?.fullName || form.name} />
          ) : (
            <form
              onSubmit={submit}
              className="space-y-3"
              {...(editing
                ? {
                    id: `profile-panel-${profileTab}`,
                    role: 'tabpanel',
                    'aria-labelledby': `profile-tab-${profileTab}`,
                  }
                : { id: 'profile-form' })}
            >
              {!editing && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Let’s get acquainted</span>
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
                  <div className="pt-1">
                    <p className="mb-1 text-xs font-medium text-primary">
                      {
                        [
                          'About you',
                          'Your people',
                          'Keep it local',
                          'Find your rhythm',
                          'Finishing touches',
                        ][step]
                      }
                    </p>
                    <h1
                      ref={heading}
                      tabIndex={-1}
                      className="scroll-mt-24 text-3xl font-semibold leading-tight tracking-tight outline-none sm:text-[40px]"
                    >
                      {steps[step]}
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
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
                      'space-y-4',
                      transitioning && 'pointer-events-none',
                    )}
                  >
                    <ErrorNotice
                      message={error || profile.error || catalog.error}
                    />
                    {(editing
                      ? profileTab === 'personal'
                      : showAll || step === 0) && (
                      <Card
                        className={cn(
                          'rounded-3xl border-primary/10 shadow-none',
                          !showAll && 'gap-3 border-0 bg-white py-4',
                        )}
                      >
                        <CardHeader className={cn(!showAll && 'sr-only')}>
                          <CardTitle>Gender</CardTitle>
                          <CardDescription>
                            Choose what feels right. This is private, and you
                            can skip it.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5">
                          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <legend className="sr-only">
                              Gender (optional)
                            </legend>
                            {[
                              { value: 'man', label: 'Male' },
                              { value: 'woman', label: 'Female' },
                              { value: 'non_binary', label: 'Non-binary' },
                              { value: 'other', label: 'Self-describe' },
                              {
                                value: 'prefer_not_to_say',
                                label: 'Prefer not to say',
                              },
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
                                {!editing && (
                                  <PlayerAvatar
                                    variant={option.value}
                                    className="size-20 sm:size-24"
                                  />
                                )}
                              </IllustratedChoice>
                            ))}
                          </fieldset>
                          {form.gender === 'other' && (
                            <div className="mt-5">
                              <Field
                                id="gender-description"
                                label="Self-description (optional)"
                              >
                                <Input
                                  id="gender-description"
                                  maxLength={100}
                                  value={form.gender_self_description}
                                  onChange={(e) =>
                                    update(
                                      'gender_self_description',
                                      e.target.value,
                                    )
                                  }
                                />
                              </Field>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    {(editing
                      ? profileTab === 'sports'
                      : showAll || step === 1) && (
                      <Card
                        className={cn(
                          'rounded-3xl border-primary/10 shadow-none',
                          !showAll && 'gap-3 border-0 bg-white py-4',
                        )}
                      >
                        <CardHeader className={cn(!showAll && 'sr-only')}>
                          <CardTitle>Your way to play</CardTitle>
                          <CardDescription>
                            Start with what you need today. You can always
                            change this later.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5">
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
                                description={
                                  editing ? undefined : option.description
                                }
                                compact={editing}
                                checked={form.looking_for === option.value}
                                onChange={() => {
                                  update('looking_for', option.value);
                                  const mapped =
                                    option.value === 'join_individually'
                                      ? 'find_teammates'
                                      : option.value === 'find_group'
                                        ? 'join_groups'
                                        : 'organize_games';
                                  setForm((old) => ({
                                    ...old,
                                    looking_for: option.value,
                                    participation_interests: Array.from(
                                      new Set([
                                        ...old.participation_interests,
                                        mapped,
                                      ]),
                                    ),
                                  }));
                                }}
                              >
                                {!editing && (
                                  <PlayIllustration kind={option.value} />
                                )}
                              </IllustratedChoice>
                            ))}
                          </fieldset>
                        </CardContent>
                      </Card>
                    )}
                    {(editing
                      ? profileTab === 'sports'
                      : showAll || step === 2) && (
                      <Card
                        className={cn(
                          'rounded-3xl border-primary/10 shadow-none',
                          !showAll && 'gap-3 border-0 bg-white py-4',
                        )}
                      >
                        <CardHeader className={cn(!showAll && 'sr-only')}>
                          <div className="flex items-center gap-3">
                            <CardTitle>Your neighborhood</CardTitle>
                          </div>
                          <CardDescription>
                            Find players close enough to make a regular game
                            happen.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
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
                          {notice && !editing && (
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
                                pattern="[1-9][0-9]{5}"
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
                                onChange={(e) =>
                                  update('locality', e.target.value)
                                }
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
                                onChange={(e) =>
                                  update('state', e.target.value)
                                }
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
                              max={50}
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
                    {(editing
                      ? profileTab === 'sports'
                      : showAll || step === 3) && (
                      <Card
                        className={cn(
                          'rounded-3xl border-primary/10 shadow-none',
                          !showAll && 'gap-3 border-0 bg-white py-4',
                        )}
                      >
                        <CardHeader className={cn(!showAll && 'sr-only')}>
                          <div className="flex items-center gap-3">
                            <CardTitle>Your sports, your pace</CardTitle>
                          </div>
                          <CardDescription>
                            Pick at least one sport and the skill level that
                            feels right.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5">
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
                                      {skillLevels.map((level) => (
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
                                              'mx-auto flex aspect-square w-full max-w-16 items-center justify-center rounded-xl border border-primary/20 bg-accent/60 text-2xl font-semibold text-accent-foreground transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:ring-2 peer-checked:ring-primary/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary',
                                            )}
                                          >
                                            {level.label[0]}
                                          </span>
                                          <span className="mt-1.5 block text-[9px] leading-4 sm:text-xs">
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
                                    <div
                                      className="mt-4 flex flex-wrap gap-2"
                                      role="group"
                                      aria-label={`${sport} playing style`}
                                    >
                                      {['casual', 'competitive', 'both'].map(
                                        (style) => (
                                          <Button
                                            key={style}
                                            type="button"
                                            size="sm"
                                            variant={
                                              (intentions[sport] || 'both') ===
                                              style
                                                ? 'default'
                                                : 'outline'
                                            }
                                            aria-pressed={
                                              (intentions[sport] || 'both') ===
                                              style
                                            }
                                            className="capitalize"
                                            onClick={() =>
                                              setIntentions((old) => ({
                                                ...old,
                                                [sport]: style,
                                              }))
                                            }
                                          >
                                            {style}
                                          </Button>
                                        ),
                                      )}
                                    </div>
                                  </fieldset>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {(showAll || step === 4) && (
                      <Card
                        className={cn(
                          'rounded-3xl border-primary/10 shadow-none',
                          !showAll && 'gap-3 border-0 bg-white py-4',
                        )}
                      >
                        <CardHeader className={cn(!showAll && 'sr-only')}>
                          <div className="flex items-center gap-3">
                            <CardTitle>
                              {editing
                                ? profileTab === 'personal'
                                  ? 'Your details'
                                  : 'Playing preferences'
                                : 'Make it your game'}
                            </CardTitle>
                          </div>
                          <CardDescription>
                            Optional details to help us get to know you. Leave
                            these blank to skip for now.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(!editing || profileTab === 'personal') && (
                            <>
                              <div className="grid gap-5 sm:grid-cols-2">
                                <Field
                                  id="nickname"
                                  label="Nickname (optional)"
                                >
                                  <Input
                                    id="nickname"
                                    maxLength={80}
                                    value={form.nickname}
                                    onChange={(e) =>
                                      update('nickname', e.target.value)
                                    }
                                  />
                                </Field>
                                <Field
                                  id="phone"
                                  label="Phone number (optional, private)"
                                >
                                  <Input
                                    id="phone"
                                    type="tel"
                                    maxLength={30}
                                    value={form.phone}
                                    onChange={(e) =>
                                      update('phone', e.target.value)
                                    }
                                  />
                                </Field>
                              </div>
                              <Field id="bio" label="Player bio (optional)">
                                <Textarea
                                  id="bio"
                                  rows={3}
                                  maxLength={1000}
                                  value={form.bio}
                                  onChange={(e) =>
                                    update('bio', e.target.value)
                                  }
                                />
                              </Field>
                            </>
                          )}
                          {editing && profileTab === 'sports' && (
                            <>
                              <OptionSelect
                                label="Teammate preference (optional)"
                                value={form.teammate_preference}
                                onChange={(v) =>
                                  update('teammate_preference', v)
                                }
                                options={[
                                  {
                                    value: 'no_preference',
                                    label: 'No preference',
                                  },
                                  { value: 'women', label: 'Women' },
                                  { value: 'men', label: 'Men' },
                                  { value: 'mixed', label: 'Mixed groups' },
                                ]}
                              />
                              <div className="grid gap-3 sm:grid-cols-2">
                                {interests.map(([value, label]) => (
                                  <Label
                                    key={value}
                                    className="rounded-xl border p-3"
                                  >
                                    <Checkbox
                                      checked={form.participation_interests.includes(
                                        value,
                                      )}
                                      onCheckedChange={(checked) =>
                                        update(
                                          'participation_interests',
                                          checked
                                            ? [
                                                ...new Set([
                                                  ...form.participation_interests,
                                                  value,
                                                ]),
                                              ]
                                            : form.participation_interests.filter(
                                                (v) => v !== value,
                                              ),
                                        )
                                      }
                                    />
                                    {label}
                                  </Label>
                                ))}
                              </div>
                              <GuestPreviewSettings
                                enabled={
                                  profile.data?.guest_preview_visible ?? false
                                }
                                onSaved={profile.reload}
                              />
                              <details className="space-y-4 rounded-xl border p-4">
                                <summary className="cursor-pointer text-sm font-medium">
                                  Playing times and visibility (optional)
                                </summary>
                                <div className="mt-4 space-y-4">
                                  <OptionSelect
                                    label="Gender visibility"
                                    value={form.gender_visibility}
                                    onChange={(v) =>
                                      update('gender_visibility', v)
                                    }
                                    options={[
                                      { value: 'private', label: 'Private' },
                                      {
                                        value: 'public',
                                        label: 'Show on my profile',
                                      },
                                    ]}
                                  />
                                  <Label>
                                    <Checkbox
                                      checked={form.discovery_visible}
                                      onCheckedChange={(v) =>
                                        update('discovery_visible', v === true)
                                      }
                                    />
                                    Show me in player discovery
                                  </Label>
                                  {days.map((day, index) => (
                                    <div
                                      key={day}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span className="w-24 text-xs text-muted-foreground">
                                        {day}
                                      </span>
                                      {['morning', 'afternoon', 'evening'].map(
                                        (slot) => {
                                          const checked =
                                            form.availability.some(
                                              (v) =>
                                                v.weekday === index &&
                                                v.time_slot === slot,
                                            );
                                          return (
                                            <Button
                                              key={slot}
                                              type="button"
                                              size="sm"
                                              variant={
                                                checked
                                                  ? 'secondary'
                                                  : 'outline'
                                              }
                                              aria-pressed={checked}
                                              aria-label={`${day} ${slot}`}
                                              className="capitalize"
                                              onClick={() =>
                                                update(
                                                  'availability',
                                                  checked
                                                    ? form.availability.filter(
                                                        (v) =>
                                                          v.weekday !== index ||
                                                          v.time_slot !== slot,
                                                      )
                                                    : [
                                                        ...form.availability,
                                                        {
                                                          weekday: index,
                                                          time_slot: slot,
                                                        },
                                                      ],
                                                )
                                              }
                                            >
                                              {slot}
                                            </Button>
                                          );
                                        },
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </>
                          )}
                          {editing && profileTab === 'personal' && (
                            <>
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
                                    {
                                      value: 'comeback',
                                      label: 'Making a comeback',
                                    },
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
                                      aria-pressed={
                                        form.motivation === option.value
                                      }
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
                                      onChange={(e) =>
                                        setLanguage(e.target.value)
                                      }
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
                                        !language.trim() ||
                                        languages.length >= 10
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
                            </>
                          )}
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
                    {editing
                      ? 'Make yourself at home.'
                      : 'Always room to be you.'}
                  </span>
                )}
                <div className="flex gap-2">
                  {!editing && step === 0 && (
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
                          : step === steps.length - 1
                            ? 'Let’s play'
                            : 'Continue'}
                      {!busy && <ArrowRight />}
                    </BusyLabel>
                  </Button>
                </div>
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                {draftStatus}
              </p>
              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                Your phone, age, and exact address stay private. Gender is
                private unless you choose to share it. Players see your
                neighbourhood and approximate distance.
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
