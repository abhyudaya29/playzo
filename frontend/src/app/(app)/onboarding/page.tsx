'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  ShieldCheck,
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  ErrorNotice,
  CardSkeletons,
  BusyLabel,
} from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
import ProfilePhotoUpload from '@/components/ProfilePhotoUpload';
import { useResource } from '@/lib/use-resource';
import { useSports } from '@/lib/use-sports';
import { request } from '@/lib/api';
import { Profile, Availability, skillLevels } from '@/lib/types';
import { normalizePhone } from '@/lib/phone';
import { refreshActivity } from '@/lib/social-types';

import { interests, days } from '@/lib/player-options';
const titles = [
  'Your player profile',
  'Your sports and pace',
  'Where do you play?',
  'Your way to play',
  'Your next teammates',
  'Make time for play',
];
const initial = {
  name: '',
  nickname: '',
  phone: '',
  age: '',
  gender: '',
  gender_self_description: '',
  gender_visibility: 'private',
  bio: '',
  adult_confirmed: false,
  pincode: '',
  city: '',
  state: '',
  locality: '',
  street_address: '',
  latitude: null as number | null,
  longitude: null as number | null,
  search_radius_km: 5,
  discovery_visible: true,
  teammate_preference: 'no_preference',
  participation_interests: [] as string[],
  availability: [] as Availability[],
  languages: [] as string[],
  looking_for: null as string | null,
  motivation: null as string | null,
};
type Form = typeof initial;
type Selected = Record<string, { skill_level: string; play_intention: string }>;

export default function Onboarding() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const profile = useResource<Profile>('/api/v1/users/me');
  const catalog = useSports();
  const [form, setForm] = useState(initial),
    [selected, setSelected] = useState<Selected>({});
  const [step, setStep] = useState(0),
    [ready, setReady] = useState(false),
    [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [draftStatus, setDraftStatus] = useState(''),
    [locating, setLocating] = useState(false);
  const completing = useRef(false);
  const loaded = useRef(false),
    dirty = useRef(false),
    geoRevision = useRef(0),
    draftQueue = useRef(Promise.resolve());
  const editing = !!profile.data?.onboarding_completed;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!profile.data || loaded.current) return;
    loaded.current = true;
    const p = profile.data;
    const base = {
      ...initial,
      ...p.location,
      name: p.name === 'Player' ? user?.fullName || '' : p.name,
      nickname: p.nickname || '',
      phone: p.phone || '',
      age: p.age?.toString() || '',
      gender: p.gender || '',
      bio: p.bio || '',
      adult_confirmed: p.adult_confirmed,
      gender_self_description: p.gender_self_description || '',
      gender_visibility: p.gender_visibility,
      discovery_visible: p.discovery_visible,
      search_radius_km: p.search_radius_km,
      teammate_preference: p.teammate_preference,
      participation_interests: p.participation_interests,
      availability: p.availability,
      languages: p.languages,
      looking_for: p.looking_for,
      motivation: p.motivation,
      street_address: p.location?.street_address || '',
    };
    const draft = p.onboarding_completed ? {} : p.onboarding_draft;
    const merged = { ...base, ...draft } as Form & {
      sports?: {
        sport: string;
        skill_level: string;
        play_intention?: string;
      }[];
    };
    setForm({ ...merged, age: merged.age?.toString() || '' });
    setSelected(
      Object.fromEntries(
        (merged.sports || p.sports).map((s) => [
          s.sport,
          {
            skill_level: s.skill_level,
            play_intention: s.play_intention || 'both',
          },
        ]),
      ),
    );
    setStep(p.onboarding_completed ? 0 : p.onboarding_step);
    setAvatar(p.avatar_url);
    setReady(true);
  }, [profile.data, user]);
  function update<K extends keyof Form>(key: K, value: Form[K]) {
    dirty.current = true;
    setError('');
    setForm((old) => ({ ...old, [key]: value }));
  }
  function payload() {
    return {
      ...form,
      age: form.age ? Number(form.age) : null,
      gender: form.gender || null,
      phone: form.phone || null,
      nickname: form.nickname || null,
      bio: form.bio || null,
      languages: form.languages.map((s) => s.trim()).filter(Boolean),
      sports: Object.entries(selected).map(([sport, v]) => ({ sport, ...v })),
    };
  }
  // Serialize requests so a slower old draft cannot overwrite a newer step.
  function saveDraft(nextStep = step) {
    if (editing) return Promise.resolve();
    const data = { step: nextStep, profile: payload() };
    setDraftStatus('Saving progress…');
    const pending = draftQueue.current
      .catch(() => {})
      .then(async () => {
        await request('/api/v1/onboarding/me', await getToken(), {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      });
    draftQueue.current = pending;
    return pending
      .then(() => setDraftStatus('Progress saved'))
      .catch((e) => {
        setDraftStatus('Progress could not be saved. Try again.');
        throw e;
      });
  }
  useEffect(() => {
    if (!ready || editing || busy || completing.current || !dirty.current)
      return;
    const timer = setTimeout(() => {
      if (!completing.current) void saveDraft().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
    // Payload changes are debounced; the request queue preserves ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, selected, ready, editing, busy, step]);
  function validateStep() {
    if (step === 0) {
      if (!form.name.trim()) return 'Add your display name.';
      if (!form.adult_confirmed || (form.age && Number(form.age) < 18))
        return 'Playzo is for adults. Confirm you are at least 18.';
      if (form.gender === 'other' && !form.gender_self_description.trim())
        return 'Add your self-description or choose another option.';
      try {
        normalizePhone(form.phone);
      } catch (e) {
        return e instanceof Error ? e.message : 'Check your phone number.';
      }
    }
    if (step === 1 && !Object.keys(selected).length)
      return 'Choose at least one sport.';
    if (
      step === 2 &&
      (!/^[1-9]\d{5}$/.test(form.pincode) ||
        !form.city.trim() ||
        !form.locality.trim() ||
        !form.state.trim())
    )
      return 'Enter a valid Indian PIN code, state, city and locality.';
    return '';
  }
  async function move(next: number) {
    setBusy(true);
    setError('');
    try {
      await saveDraft(next);
      setStep(next);
      heading.current?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save progress.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = validateStep();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (step < 5) {
      await move(step + 1);
      return;
    }
    completing.current = true;
    setBusy(true);
    setError('');
    try {
      await draftQueue.current.catch(() => {});
      await request('/api/v1/onboarding/complete', await getToken(), {
        method: 'POST',
        body: JSON.stringify({
          ...payload(),
          phone: normalizePhone(form.phone),
        }),
      });
      refreshActivity();
      router.push('/dashboard');
    } catch (e) {
      completing.current = false;
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }
  async function lookupPin() {
    if (!/^[1-9]\d{5}$/.test(form.pincode)) return;
    try {
      const pin = form.pincode;
      const loc = await request<{
        city: string;
        state: string;
        localities: string[];
      }>(`/api/v1/locations/pincode/${pin}`, null);
      setForm((old) =>
        old.pincode !== pin
          ? old
          : {
              ...old,
              city: old.city || loc.city,
              state: old.state || loc.state,
              locality: old.locality || loc.localities[0] || '',
            },
      );
    } catch {
      setNotice(
        'PIN lookup is unavailable. Enter your city, state and locality manually.',
      );
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setNotice('Enter your location manually.');
      return;
    }
    setLocating(true);
    const revision = ++geoRevision.current;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (revision !== geoRevision.current) return;
        update('latitude', Math.round(p.coords.latitude * 1000) / 1000);
        update('longitude', Math.round(p.coords.longitude * 1000) / 1000);
        setNotice('Approximate location saved. Your coordinates stay private.');
      },
      () => {
        setLocating(false);
        setNotice(
          'Location permission is unavailable. Enter your location manually.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }
  function toggleInterest(value: string) {
    update(
      'participation_interests',
      form.participation_interests.includes(value)
        ? form.participation_interests.filter((x) => x !== value)
        : [...form.participation_interests, value],
    );
  }
  function toggleSlot(day: number, time: string) {
    const exists = form.availability.some(
      (x) => x.weekday === day && x.time_slot === time,
    );
    update(
      'availability',
      exists
        ? form.availability.filter(
            (x) => x.weekday !== day || x.time_slot !== time,
          )
        : [...form.availability, { weekday: day, time_slot: time }],
    );
  }
  if (profile.error && !profile.data)
    return <ErrorNotice message={profile.error} retry={profile.reload} />;
  if (!ready) return <CardSkeletons />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {editing ? 'Your profile' : 'A little hello before we play'}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-3 text-3xl font-semibold outline-none"
        >
          {titles[step]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Step {step + 1} of 6 ·{' '}
          {editing
            ? 'Update your details anytime.'
            : 'Your progress saves as you go.'}
        </p>
      </div>
      <nav aria-label="Onboarding steps" className="grid grid-cols-6 gap-2">
        {titles.map((title, index) => (
          <button
            key={title}
            type="button"
            disabled={busy || index > step}
            aria-label={`Step ${index + 1}: ${title}`}
            aria-current={index === step ? 'step' : undefined}
            onClick={() => void move(index)}
            className={`h-2 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </nav>
      <form onSubmit={submit} className="space-y-6">
        <ErrorNotice message={error || catalog.error} retry={catalog.reload} />
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <Card className="rounded-3xl border-primary/10 shadow-none">
          <CardHeader>
            <CardTitle>{titles[step]}</CardTitle>
            <CardDescription>
              {step === 0
                ? 'Introduce yourself on your terms.'
                : step === 4
                  ? 'Optional, editable, and never inferred from your identity.'
                  : 'Your game. Your crew.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <>
                <ProfilePhotoUpload
                  name={form.name}
                  url={avatar}
                  onChange={setAvatar}
                />
                <Field id="name" label="Display name">
                  <Input
                    id="name"
                    autoComplete="name"
                    required
                    maxLength={150}
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="nickname" label="Nickname (optional)">
                    <Input
                      id="nickname"
                      maxLength={80}
                      value={form.nickname}
                      onChange={(e) => update('nickname', e.target.value)}
                    />
                  </Field>
                  <Field id="age" label="Age (optional, private)">
                    <Input
                      id="age"
                      type="number"
                      min={18}
                      max={120}
                      value={form.age}
                      onChange={(e) => update('age', e.target.value)}
                    />
                  </Field>
                </div>
                <Label className="flex items-start gap-3">
                  <Checkbox
                    checked={form.adult_confirmed}
                    onCheckedChange={(v) =>
                      update('adult_confirmed', v === true)
                    }
                  />
                  <span>
                    I confirm I am 18 or older. Playzo currently supports adult
                    players only.
                  </span>
                </Label>
                <OptionSelect
                  label="Gender identity (optional)"
                  value={form.gender || 'prefer_not_to_say'}
                  onChange={(v) => update('gender', v)}
                  options={[
                    { value: 'man', label: 'Male' },
                    { value: 'woman', label: 'Female' },
                    { value: 'non_binary', label: 'Non-binary' },
                    { value: 'other', label: 'Prefer to self-describe' },
                    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                  ]}
                />
                {form.gender === 'other' && (
                  <Field id="self-description" label="Your self-description">
                    <Input
                      id="self-description"
                      maxLength={100}
                      value={form.gender_self_description}
                      onChange={(e) =>
                        update('gender_self_description', e.target.value)
                      }
                    />
                  </Field>
                )}
                <OptionSelect
                  label="Gender visibility"
                  value={form.gender_visibility}
                  onChange={(v) => update('gender_visibility', v)}
                  options={[
                    { value: 'private', label: 'Private — only you' },
                    {
                      value: 'public',
                      label: 'Public — show on my player profile',
                    },
                  ]}
                />
                <Field id="phone" label="Phone number (optional, private)">
                  <Input
                    id="phone"
                    type="tel"
                    maxLength={30}
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Select multiple sports and set a pace for each.
                </p>
                {catalog.loading && !catalog.data ? (
                  <CardSkeletons />
                ) : (
                  catalog.data?.map((sport) => (
                    <div
                      key={sport}
                      className="space-y-3 rounded-xl border p-4"
                    >
                      <Label>
                        <Checkbox
                          checked={!!selected[sport]}
                          onCheckedChange={(v) => {
                            dirty.current = true;
                            setSelected((old) => {
                              const next = { ...old };
                              if (v)
                                next[sport] = {
                                  skill_level: 'beginner',
                                  play_intention: 'both',
                                };
                              else delete next[sport];
                              return next;
                            });
                          }}
                        />
                        {sport}
                      </Label>
                      {selected[sport] && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <OptionSelect
                            label={`${sport} skill level`}
                            value={selected[sport].skill_level}
                            onChange={(v) => {
                              dirty.current = true;
                              setSelected((old) => ({
                                ...old,
                                [sport]: { ...old[sport], skill_level: v },
                              }));
                            }}
                            options={skillLevels}
                          />
                          <OptionSelect
                            label={`${sport} playing style`}
                            value={selected[sport].play_intention}
                            onChange={(v) => {
                              dirty.current = true;
                              setSelected((old) => ({
                                ...old,
                                [sport]: { ...old[sport], play_intention: v },
                              }));
                            }}
                            options={[
                              { value: 'casual', label: 'Casual' },
                              { value: 'competitive', label: 'Competitive' },
                              { value: 'both', label: 'Both' },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
            {step === 2 && (
              <>
                <Field id="country" label="Country">
                  <Input id="country" value="India" readOnly />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Playzo currently supports Indian locations.
                  </p>
                </Field>
                <Field id="pincode" label="PIN code">
                  <Input
                    id="pincode"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    required
                    maxLength={6}
                    value={form.pincode}
                    onBlur={() => void lookupPin()}
                    onChange={(e) => {
                      geoRevision.current++;
                      setLocating(false);
                      dirty.current = true;
                      setForm((old) => ({
                        ...old,
                        pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                        latitude: null,
                        longitude: null,
                        city: '',
                        state: '',
                        locality: '',
                      }));
                    }}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="state" label="State">
                    <Input
                      id="state"
                      required
                      maxLength={160}
                      value={form.state}
                      onChange={(e) => update('state', e.target.value)}
                    />
                  </Field>
                  <Field id="city" label="City">
                    <Input
                      id="city"
                      required
                      maxLength={160}
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                    />
                  </Field>
                </div>
                <Field id="locality" label="Neighbourhood">
                  <Input
                    id="locality"
                    required
                    maxLength={160}
                    value={form.locality}
                    onChange={(e) => update('locality', e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={locating}
                  onClick={locate}
                >
                  <LocateFixed />
                  {locating
                    ? 'Finding your location…'
                    : 'Use approximate location'}
                </Button>
                <OptionSelect
                  label="Discovery radius"
                  value={String(form.search_radius_km)}
                  onChange={(v) => update('search_radius_km', Number(v))}
                  options={[5, 10, 15, 25, 50].map((n) => ({
                    value: String(n),
                    label: `${n} km`,
                  }))}
                />
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-sm text-muted-foreground">
                  How would you like to use Playzo? Choose as many as you like.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {interests.map(([value, label]) => (
                    <Label
                      key={value}
                      className={`rounded-xl border p-4 ${form.participation_interests.includes(value) ? 'border-primary bg-accent' : ''}`}
                    >
                      <Checkbox
                        checked={form.participation_interests.includes(value)}
                        onCheckedChange={() => toggleInterest(value)}
                      />
                      {label}
                    </Label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tournament hosting requires separate organizer verification.
                  Your interests never grant administrative permissions.
                </p>
              </>
            )}
            {step === 4 && (
              <>
                <OptionSelect
                  label="Who would you prefer to play with?"
                  value={form.teammate_preference}
                  onChange={(v) => update('teammate_preference', v)}
                  options={[
                    { value: 'no_preference', label: 'No preference' },
                    { value: 'women', label: 'Women' },
                    { value: 'men', label: 'Men' },
                    { value: 'mixed', label: 'Mixed groups' },
                  ]}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Women and men preferences match only explicitly public gender
                  information. Hidden gender stays private. Mixed and
                  no-preference matching include non-binary players. Both
                  players’ preferences must be compatible.
                </p>
                <Label className="items-start">
                  <Checkbox
                    checked={form.discovery_visible}
                    onCheckedChange={(v) =>
                      update('discovery_visible', v === true)
                    }
                  />
                  <span>
                    Show my profile in player discovery. You can switch this off
                    at any time.
                  </span>
                </Label>
              </>
            )}
            {step === 5 && (
              <>
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-sm font-medium">
                    Preferred playing times (optional)
                  </legend>
                  {days.map((day, index) => (
                    <div
                      key={day}
                      className="grid gap-2 sm:grid-cols-[110px_1fr]"
                    >
                      <span className="text-sm text-muted-foreground">
                        {day}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {['morning', 'afternoon', 'evening'].map((time) => (
                          <Button
                            key={time}
                            type="button"
                            size="sm"
                            variant={
                              form.availability.some(
                                (x) =>
                                  x.weekday === index && x.time_slot === time,
                              )
                                ? 'secondary'
                                : 'outline'
                            }
                            aria-pressed={form.availability.some(
                              (x) =>
                                x.weekday === index && x.time_slot === time,
                            )}
                            aria-label={`${day} ${time}`}
                            onClick={() => toggleSlot(index, time)}
                            className="capitalize"
                          >
                            {time}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
                <Field
                  id="languages"
                  label="Languages (optional, comma-separated)"
                >
                  <Input
                    id="languages"
                    maxLength={400}
                    value={form.languages.join(', ')}
                    onChange={(e) =>
                      update(
                        'languages',
                        e.target.value.split(',').slice(0, 10),
                      )
                    }
                  />
                </Field>
                <OptionSelect
                  label="What brings you back to play? (optional)"
                  value={form.motivation || 'none'}
                  onChange={(v) =>
                    update('motivation', v === 'none' ? null : v)
                  }
                  options={[
                    { value: 'none', label: 'Prefer not to say' },
                    { value: 'starting_out', label: 'Starting out' },
                    { value: 'comeback', label: 'Making a comeback' },
                    {
                      value: 'try_something_new',
                      label: 'Trying something new',
                    },
                    { value: 'just_for_fun', label: 'Just for fun' },
                  ]}
                />
                <Field id="bio" label="Player bio (optional, public)">
                  <Textarea
                    id="bio"
                    maxLength={1000}
                    rows={4}
                    value={form.bio}
                    onChange={(e) => update('bio', e.target.value)}
                    placeholder="Your sport, your pace, and when you love to play."
                  />
                </Field>
                <div className="rounded-xl border border-primary/15 bg-accent/50 p-5">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Check className="size-4 text-primary" />
                    Your profile summary
                  </h2>
                  <p className="mt-2 text-sm">
                    {form.name} · {form.city || 'Add your city'} ·{' '}
                    {form.search_radius_km} km
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {Object.keys(selected).join(' · ') || 'Choose your sports'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {form.availability.length} preferred playing times ·{' '}
                    {form.participation_interests.length} participation
                    interests
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || step === 0}
            onClick={() => void move(step - 1)}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button type="submit" disabled={busy || locating}>
            <BusyLabel busy={busy}>
              {step === 5
                ? editing
                  ? 'Save profile'
                  : 'Let’s play'
                : 'Continue'}
              <ArrowRight />
            </BusyLabel>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {draftStatus}
        </p>
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          Your phone, age and exact location stay private. Only your chosen
          public profile details are shared with players.
        </p>
      </form>
    </div>
  );
}
