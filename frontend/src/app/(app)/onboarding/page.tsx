'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { ArrowRight, MapPin, ShieldCheck, LocateFixed } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  PageHeader,
  ErrorNotice,
  CardSkeletons,
  Field,
  BusyLabel,
} from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
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
  const loaded = useRef(false);
  const geoRevision = useRef(0);
  function update<K extends keyof typeof initial>(
    key: K,
    value: (typeof initial)[K],
  ) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  useEffect(() => {
    if (!profile.data || loaded.current) return;
    loaded.current = true;
    const p = profile.data;
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
      router.push('/dashboard');
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
    <div className="page-enter">
      <PageHeader
        eyebrow={
          profile.data?.onboarding_completed
            ? 'Your profile'
            : 'Let’s get you playing'
        }
        title={
          profile.data?.onboarding_completed
            ? 'Make it your playground.'
            : 'A few details. Better games.'
        }
        description="Tell us what you play and where. We’ll help you find people who are a good fit."
      />
      {profile.error && !profile.data ? (
        <ErrorNotice message={profile.error} retry={profile.reload} />
      ) : !ready ? (
        <CardSkeletons />
      ) : (
        <form
          onSubmit={submit}
          className="grid items-start gap-7 xl:grid-cols-[1fr_260px]"
        >
          <div className="space-y-6">
            <ErrorNotice message={error || profile.error} />
            <Card className="shadow-none">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">01</Badge>
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
                <Field
                  id="gender"
                  label="Gender (optional)"
                  description="Only visible to you."
                >
                  <OptionSelect
                    id="gender"
                    label="Gender (optional)"
                    value={form.gender || 'skip'}
                    onChange={(value) =>
                      update('gender', value === 'skip' ? '' : value)
                    }
                    options={[
                      { value: 'skip', label: 'Skip for now' },
                      { value: 'woman', label: 'Woman' },
                      { value: 'man', label: 'Man' },
                      { value: 'non_binary', label: 'Non-binary' },
                      {
                        value: 'prefer_not_to_say',
                        label: 'Prefer not to say',
                      },
                    ]}
                  />
                </Field>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">02</Badge>
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
                    onChange={(e) => update('street_address', e.target.value)}
                  />
                </Field>
                <div className="space-y-4 border-t pt-5">
                  <div className="flex justify-between text-sm">
                    <Label htmlFor="discovery-radius">Discovery radius</Label>
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
                    Without device location, discovery uses the approximate
                    center of your PIN-code area.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">03</Badge>
                  <CardTitle>Your sports, your pace</CardTitle>
                </div>
                <CardDescription>
                  Pick at least one sport and the skill level that feels right.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {sports.map((sport) => (
                    <div
                      key={sport}
                      className={cn(
                        'space-y-4 rounded-xl border p-4',
                        selected[sport] && 'border-primary/30 bg-accent/40',
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
                              if (checked === true) next[sport] = 'beginner';
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
                                className="min-w-0 cursor-pointer text-center"
                              >
                                <input
                                  type="radio"
                                  className="peer sr-only"
                                  name={`level-${sport}`}
                                  value={level.value}
                                  checked={selected[sport] === level.value}
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
            <Card className="shadow-none">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">04</Badge>
                  <CardTitle>Make it your game</CardTitle>
                </div>
                <CardDescription>
                  Optional details to help us get to know you. Leave these blank
                  to skip for now.
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
                      { value: 'just_for_fun', label: 'Just here to enjoy' },
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
                        disabled={!language.trim() || languages.length >= 10}
                        onClick={addLanguage}
                      >
                        Add
                      </Button>
                    </div>
                  </Field>
                  <div className="flex flex-wrap gap-2" aria-live="polite">
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
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
              <p className="text-xs text-muted-foreground">
                You can update these preferences anytime.
              </p>
              <Button size="lg" disabled={busy || locating}>
                <BusyLabel busy={busy}>
                  {busy ? 'Saving your profile…' : 'Explore nearby players'}
                  {!busy && <ArrowRight />}
                </BusyLabel>
              </Button>
            </div>
          </div>
          <aside className="sticky top-24 hidden space-y-5 xl:block">
            <Card className="gap-4 border-primary/10 bg-accent/40 shadow-none">
              <CardContent>
                <ShieldCheck className="mb-3 size-6 text-primary" />
                <h3 className="font-semibold">
                  A little privacy goes a long way.
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Players see your neighborhood and approximate distance. Your
                  address and phone number stay private.
                </p>
              </CardContent>
            </Card>
            <div className="space-y-4 px-2">
              {[
                'Add your details',
                'Choose your neighborhood',
                'Pick your sports',
                'Make it personal (optional)',
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-xs text-muted-foreground"
                >
                  <span className="flex size-5 items-center justify-center rounded-full border bg-white">
                    {index + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
