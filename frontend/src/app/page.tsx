import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Users,
  CalendarDays,
  CircleDot,
  Check,
  Sparkles,
  MessageCircle,
  Heart,
} from 'lucide-react';
import Brand from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MatchCourtCard } from '@/components/MatchCourtCard';

export default function Home() {
  return (
    <main className="min-h-svh overflow-hidden bg-[#fcfbff]">
      <header className="relative z-10 mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-5 sm:px-6">
        <Brand />
        <nav
          aria-label="Landing navigation"
          className="flex items-center gap-2"
        >
          <Link
            href="#community"
            className="mr-5 hidden text-sm text-muted-foreground hover:text-primary md:block"
          >
            The community
          </Link>
          <Link
            href="#about"
            className="mr-5 hidden text-sm text-muted-foreground hover:text-primary md:block"
          >
            Our story
          </Link>
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">
              Get started <ArrowUpRight />
            </Link>
          </Button>
        </nav>
      </header>
      <section className="landing-spotlight relative">
        <div
          className="landing-dots pointer-events-none absolute inset-0 opacity-40"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-10 pt-6 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-12">
          <div className="page-enter">
            <Badge
              variant="outline"
              className="mb-7 gap-2 bg-white/80 py-2 text-primary"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              Your neighbourhood. Your next game.
            </Badge>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.07] tracking-[-.055em] sm:text-6xl lg:text-[76px]">
              Got the game.
              <br />
              <span className="text-primary">Missing the gang?</span>
            </h1>
            <img
              src="/playhud-lifecycle.svg"
              width={1200}
              height={740}
              alt="The Playhud lifecycle: the itch to play, join Playhud, match your vibe, find your people, lock the plan, and show up and play."
              className="mt-5 block h-auto w-full max-w-lg rounded-2xl"
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/sign-up">
                  Find your crew <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#community">
                  Meet your community <Users />
                </Link>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link href="#about">
                  About us <ArrowUpRight />
                </Link>
              </Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <Check className="size-4 shrink-0 text-primary" />
              All skill levels. A first game for everyone.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md rounded-[32px] border border-white bg-white/50 p-4 shadow-2xl shadow-indigo-200/40 sm:p-6">
            <div className="mb-4 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                The group chat, but with a plan
              </span>
              <Sparkles className="size-4 text-primary" />
            </div>
            <MatchCourtCard />
            <div className="relative mx-2 -mt-5 rounded-2xl border bg-white p-4 shadow-lg shadow-indigo-100/60 sm:mx-4">
              <Badge variant="secondary" className="mb-3 text-[10px]">
                Imagine your next weekend
              </Badge>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-accent p-3">
                  <CalendarDays className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Doubles, anyone?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A nearby court. A new crew. You’re in.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Heart className="size-3.5 text-primary" />
              Come for the game. Stay for the people.
            </div>
          </div>
        </div>
      </section>
      <div className="border-y bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-5 py-5 text-xs font-medium text-muted-foreground sm:text-sm">
          {[
            'Badminton',
            'Football',
            'Cricket',
            'Tennis',
            'Basketball',
            'Your next favourite sport',
          ].map((sport) => (
            <span key={sport}>{sport}</span>
          ))}
        </div>
      </div>
      <section
        id="community"
        className="mx-auto max-w-6xl scroll-mt-8 px-5 py-10 sm:px-6 lg:py-12"
      >
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
          Find your kind of people
        </p>
        <div className="mb-10 mt-4 flex flex-wrap items-end justify-between gap-5">
          <h2 className="max-w-lg text-3xl font-semibold leading-tight sm:text-4xl">
            More than a game.
            <br />A community to come back to.
          </h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            The familiar faces. The post-game chai. The “same time next week?”
            Build a little belonging around what you love.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="community-card relative overflow-hidden rounded-3xl border bg-[#eeedff] p-6 sm:p-8 md:col-span-2">
            <div className="mb-10 flex items-center gap-3" aria-hidden="true">
              <div className="flex -space-x-3">
                {['A', 'R', 'S', 'You'].map((name, i) => (
                  <span
                    key={name}
                    className={`flex size-12 items-center justify-center rounded-full border-[3px] border-[#eeedff] text-sm font-bold ${['bg-indigo-300 text-indigo-950', 'bg-orange-200 text-orange-950', 'bg-lime-200 text-lime-950', 'bg-primary text-white'][i]}`}
                  >
                    {name}
                  </span>
                ))}
              </div>
              <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs text-primary">
                There’s room for you.
              </span>
            </div>
            <Users className="mb-4 size-6 text-primary" />
            <h3 className="text-2xl font-semibold">Find your local crew.</h3>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              New in town or just ready for a new circle? Join a sports
              community nearby, meet players at your pace, and turn strangers
              into your regular teammates.
            </p>
            <Button variant="link" asChild className="mt-5 h-auto px-0">
              <Link href="/sign-up">
                Find my community <ArrowUpRight />
              </Link>
            </Button>
          </article>
          <article className="community-card rounded-3xl border bg-white p-6 sm:p-8">
            <MapPin className="mb-8 size-7 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              01 / A first hello
            </span>
            <h3 className="mt-3 text-xl font-semibold">
              Show up solo.
              <br />
              Leave with a crew.
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Find nearby players who love your sport. A simple connection could
              be the start of your next great game.
            </p>
            <Button variant="link" asChild className="mt-5 h-auto px-0">
              <Link href="/sign-up">
                Meet players <ArrowUpRight />
              </Link>
            </Button>
          </article>
          <article className="community-card rounded-3xl border bg-white p-6 sm:p-8">
            <CalendarDays className="mb-6 size-7 text-primary" />
            <h3 className="text-xl font-semibold">
              Be the “let’s play” person.
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Host a game, open up a few spots, and bring your neighbourhood
              together. Good games need someone to get the ball rolling.
            </p>
            <Button variant="link" asChild className="mt-5 h-auto px-0">
              <Link href="/sign-up">
                Get a game going <ArrowUpRight />
              </Link>
            </Button>
          </article>
          <article className="community-card flex flex-col justify-between rounded-3xl bg-[#211b50] p-6 text-white sm:p-8 md:col-span-2">
            <MessageCircle className="mb-6 size-7 text-violet-300" />
            <h3 className="max-w-md text-2xl font-medium leading-snug sm:text-3xl">
              From “anyone up for a game?”
              <br />
              <span className="text-violet-300">
                to “see you on the court.”
              </span>
            </h3>
            <p className="mt-5 max-w-lg text-sm leading-6 text-violet-100/75">
              Connect with a player, join a community, or claim a spot in a
              game. Keep the conversation and the plan together.
            </p>
          </article>
        </div>
      </section>
      <section id="about" className="relative scroll-mt-8 border-y bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 md:grid-cols-[1fr_2fr] lg:py-12">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
            A little about us
          </p>
          <div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
              We didn’t build this because we love apps. We built it because we
              love playing.
            </h2>
            <div className="mt-7 max-w-xl space-y-5 text-base leading-8 text-muted-foreground">
              <p>
                We’ve all been there. You want to play, the group chat is dead,
                half your friends are busy, and somehow the plan never happens.
              </p>
              <p>
                We wanted to change that. So we’re building a place where
                finding players, meeting your crew and getting a game going
                becomes the easy part.
              </p>
            </div>
            <p className="mt-8 text-xl font-semibold text-primary">
              Less planning. More playing. That’s Playhud.
            </p>
          </div>
        </div>
      </section>
      <section className="px-5 py-10 sm:px-6">
        <div className="landing-spotlight relative mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-primary/10 px-6 py-8 text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Your next game needs you.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            One player, one community, one good game. Let’s start there.
          </p>
          <Button size="lg" asChild className="mt-7">
            <Link href="/sign-up">
              Let’s play <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 pb-8 sm:px-6">
        <Brand />
        <p className="text-xs text-muted-foreground">
          Your game. Your crew. Your city.
        </p>
        <Link href="/sign-in" className="text-sm text-primary hover:underline">
          Already part of the gang? Sign in
        </Link>
      </footer>
    </main>
  );
}
