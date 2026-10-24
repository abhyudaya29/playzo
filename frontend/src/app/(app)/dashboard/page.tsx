'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  ArrowRight,
  MapPin,
  Users,
  Settings2,
  Compass,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  PageHeader,
  ErrorNotice,
  EmptyState,
  CardSkeletons,
  BusyLabel,
} from '@/components/page-ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/page-ui';
import { refreshActivity } from '@/lib/social-types';
import { OptionSelect } from '@/components/option-select';
import { useResource } from '@/lib/use-resource';
import { request } from '@/lib/api';
import { useSports } from '@/lib/use-sports';
import PlayerPhoto from '@/components/PlayerPhoto';
import { trackEvent } from '@/lib/analytics';
import { Profile, skillLevels } from '@/lib/types';
type Player = {
  id: string;
  name: string;
  locality: string;
  distance_km: number;
  skill_level: string;
  sport: string;
  bio?: string;
  avatar_url?: string | null;
  match_score?: number;
  explanation?: string[];
  connection_status?: string | null;
  connection_direction?: string | null;
};
export default function Dashboard() {
  const { getToken } = useAuth();
  const router = useRouter();
  const catalog = useSports();
  const sports = catalog.data || [];
  const [page, setPage] = useState(1);
  const profile = useResource<Profile>('/api/v1/users/me');
  const [sport, setSport] = useState('Badminton');
  const [radius, setRadius] = useState(5);
  const [searchRadius, setSearchRadius] = useState(5);
  const [level, setLevel] = useState('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState<Player | null>(null);
  const [introduction, setIntroduction] = useState('');
  const [notice, setNotice] = useState('');
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (profile.data && !initialized) {
      setRadius(profile.data.search_radius_km);
      setSearchRadius(profile.data.search_radius_km);
      setSport(profile.data.sports[0]?.sport || 'Badminton');
      setInitialized(true);
    }
  }, [profile.data, initialized]);
  const result = useResource<Player[]>(
    profile.data?.onboarding_completed && initialized
      ? `/api/v1/discover/players?sport=${encodeURIComponent(sport)}&radius_km=${searchRadius}&skill_level=${level}&page=${page}&page_size=24`
      : null,
    10000,
  );
  const trackedSearch = useRef('');
  useEffect(() => {
    const key = `${sport}:${searchRadius}:${level}:${page}`;
    if (!result.data || result.loading || trackedSearch.current === key) return;
    trackedSearch.current = key;
    trackEvent('player_search_performed', {
      sport,
      discovery_radius_bucket:
        searchRadius <= 5
          ? '5'
          : searchRadius <= 15
            ? '10–15'
            : searchRadius <= 25
              ? '25'
              : '50',
    });
    if (result.data.length) trackEvent('recommendation_viewed', { sport });
  }, [result.data, result.loading, sport, searchRadius, level, page]);
  async function connect(id: string) {
    setBusy(id);
    setError('');
    try {
      await request('/api/v1/connections', await getToken(), {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: id,
          introduction: introduction.trim() || null,
          sport: target?.sport || sport,
        }),
      });
      setTarget(null);
      setIntroduction('');
      setNotice('Connection request sent. Track the response in Requests.');
      refreshActivity();
      await result.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-enter flex flex-col gap-3">
      <PageHeader
        eyebrow="Your local playground"
        title={
          profile.data?.name
            ? `Find your next game, ${profile.data.name.split(' ')[0]}.`
            : 'Find your next game.'
        }
        description="Good games start with the right people. Discover players who share your sport and your pace."
        action={
          <Button variant="outline" asChild>
            <Link href="/onboarding">
              <Settings2 />
              Preferences
            </Link>
          </Button>
        }
      />
      {notice && (
        <Alert>
          <AlertDescription>
            {notice}{' '}
            <Link href="/requests" className="font-medium underline">
              View requests
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setTarget(null);
            setError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect with {target?.name}</DialogTitle>
            <DialogDescription>
              Start with a hello. A private chat opens only after your request
              is accepted.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (target) connect(target.id);
            }}
            className="space-y-5"
          >
            <ErrorNotice message={error} />
            <Field id="introduction" label="Introductory message (optional)">
              <Textarea
                id="introduction"
                maxLength={500}
                rows={3}
                placeholder="Hi! Are you up for a game this weekend?"
                value={introduction}
                onChange={(event) => setIntroduction(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => setTarget(null)}
              >
                Cancel
              </Button>
              <Button disabled={!!busy}>
                <BusyLabel busy={!!busy}>Send connection request</BusyLabel>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ErrorNotice message={catalog.error} retry={catalog.reload} />
      <ErrorNotice message={profile.error} retry={profile.reload} />
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-r from-accent/80 via-white to-white shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="hidden rounded-xl border border-primary/15 bg-white p-3 sm:block">
              <Users className="size-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                Make a little room for play.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Join a local crew or find an open game this week.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="bg-white">
            <Link href="/games">
              Explore games <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
      {profile.loading && !profile.data ? (
        <CardSkeletons />
      ) : profile.data && !profile.data.onboarding_completed ? (
        <EmptyState
          title="Your next teammate is out there"
          description="Add your location and sports to discover players near you."
          action={
            <Button asChild>
              <Link href="/onboarding">
                Complete your profile <ArrowRight />
              </Link>
            </Button>
          }
        />
      ) : profile.data ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Players near you</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Find a match for your next session.
              </p>
            </div>
            <Badge variant="secondary">
              {profile.data.location?.locality || 'Your neighborhood'}
            </Badge>
          </div>
          <Card className="gap-4 shadow-none">
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {sports.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={sport === item ? 'default' : 'outline'}
                    onClick={() => {
                      setSport(item);
                      setPage(1);
                      trackEvent('discovery_filter_changed', { sport: item });
                    }}
                    aria-pressed={sport === item}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              <Separator />
              <div className="grid items-center gap-6 sm:grid-cols-[1fr_180px_auto]">
                <div className="flex items-center gap-4">
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {radius} km
                  </span>
                  <Slider
                    aria-label="Search radius in kilometers"
                    min={1}
                    max={50}
                    step={1}
                    value={[radius]}
                    onValueChange={([v]) => setRadius(v)}
                    onValueCommit={([v]) => {
                      setSearchRadius(v);
                      setPage(1);
                    }}
                  />
                </div>
                <OptionSelect
                  label="Skill level"
                  value={level}
                  onChange={(v) => {
                    setLevel(v);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All skill levels' },
                    ...skillLevels,
                  ]}
                />
                <span
                  className="text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {result.loading
                    ? 'Updating…'
                    : `${result.data?.length ?? 0} players`}
                </span>
              </div>
            </CardContent>
          </Card>
          <ErrorNotice message={error || result.error} retry={result.reload} />
          {result.loading && !result.data ? (
            <CardSkeletons />
          ) : result.error && !result.data ? null : result.data?.length ? (
            <div
              className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
              aria-busy={result.loading}
            >
              {result.data.map((player) => (
                <Card
                  key={player.id}
                  data-player-id={player.id}
                  onClick={(event) => {
                    if (
                      !(event.target as Element).closest(
                        'a,button,input,textarea',
                      ) &&
                      !window.getSelection()?.toString()
                    )
                      router.push(`/players/${player.id}`);
                  }}
                  className="cursor-pointer gap-5 shadow-none transition-shadow hover:shadow-md"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/players/${player.id}`}
                        aria-label={`View ${player.name}'s profile`}
                        onClick={() =>
                          trackEvent('recommendation_clicked', {
                            sport: player.sport,
                          })
                        }
                      >
                        <PlayerPhoto
                          name={player.name}
                          url={player.avatar_url}
                        />
                      </Link>
                      <div>
                        <CardTitle className="text-base">
                          <Link
                            href={`/players/${player.id}`}
                            className="hover:text-primary hover:underline"
                            onClick={() =>
                              trackEvent('recommendation_clicked', {
                                sport: player.sport,
                              })
                            }
                          >
                            {player.name}
                          </Link>
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs">
                          {player.locality || 'Nearby player'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    {player.match_score !== undefined && (
                      <p className="text-xs font-medium text-primary">
                        {player.match_score}% match ·{' '}
                        {player.explanation?.join(' · ')}
                      </p>
                    )}
                    <p className="min-h-10 text-sm leading-6 text-muted-foreground">
                      {player.bio ||
                        `Looking for ${player.sport.toLowerCase()} partners and a good game.`}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{player.sport}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {player.skill_level}
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="flex-wrap justify-between gap-3 border-t">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {player.distance_km.toFixed(1)} km away
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/players/${player.id}`}>View profile</Link>
                      </Button>
                      {player.connection_status === 'accepted' ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/messages?player=${player.id}`}>
                            <MessageSquare />
                            Message
                          </Link>
                        </Button>
                      ) : player.connection_status === 'pending' &&
                        player.connection_direction === 'incoming' ? (
                        <Button size="sm" asChild>
                          <Link href="/requests">Respond</Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!!busy || !!player.connection_status}
                          onClick={() => {
                            setTarget(player);
                            setIntroduction('');
                            setError('');
                          }}
                        >
                          {player.connection_status === 'declined'
                            ? 'Declined'
                            : player.connection_status
                              ? 'Requested'
                              : 'Connect'}
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="A little quiet around here"
              description="Try another sport or a wider radius. More players means more possibilities."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setRadius(50);
                    setSearchRadius(50);
                    setLevel('all');
                  }}
                >
                  <Compass />
                  Widen your search
                </Button>
              }
            />
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page === 1 || result.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              disabled={result.loading || (result.data?.length || 0) < 24}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
