import Link from 'next/link';
import {
  ArrowRight,
  MapPin,
  Users,
  CalendarDays,
  CircleDot,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import Brand from '@/components/Brand';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
export default function Home() {
  return (
    <main className="min-h-svh bg-white">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Brand />
        <nav className="flex items-center gap-2">
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
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div className="page-enter">
          <Badge
            variant="outline"
            className="mb-7 gap-2 bg-accent/40 py-1.5 text-primary"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            Your neighborhood. Your next game.
          </Badge>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-.055em] sm:text-6xl lg:text-[72px]">
            A little less
            <br />
            “sometime.”
            <br />
            <span className="text-primary">A lot more play.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-muted-foreground">
            Find nearby players, meet your regular crew, and turn “we should
            play” into a game on the calendar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Find your playground <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/sign-in">I already have an account</Link>
            </Button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" />
            All skill levels. Real connections. More reasons to get outside.
          </p>
        </div>
        <div className="relative rounded-[28px] border border-primary/10 bg-[#f4f3ff] p-6 sm:p-10">
          <div
            className="relative mx-auto aspect-[1.2] max-w-sm overflow-hidden rounded-2xl bg-[#635bff] p-5 shadow-xl shadow-primary/15"
            aria-hidden="true"
          >
            <div className="relative h-full rounded border-2 border-white/60">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/60" />
              <div className="absolute inset-y-8 left-0 right-0 border-y border-white/40" />
              <div className="absolute inset-y-0 left-8 right-8 border-x border-white/40" />
              <div className="absolute left-[29%] top-[25%] size-5 rounded-full border-4 border-white bg-primary shadow-lg" />
              <div className="absolute bottom-[23%] right-[20%] size-5 rounded-full border-4 border-white bg-primary shadow-lg" />
            </div>
            <div className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-primary">
              <CircleDot className="size-8 text-white" />
            </div>
          </div>
          <Card className="relative mx-auto -mt-5 max-w-xs gap-3 border-white bg-white/95 py-5 shadow-lg shadow-primary/5">
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent p-2">
                  <CalendarDays className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Make it a regular thing.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Find a game. Find your people.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="mt-7 flex justify-center gap-5 text-[11px] text-muted-foreground">
            <span>Badminton</span>
            <span>Football</span>
            <span>Cricket</span>
            <span>& more</span>
          </div>
        </div>
      </section>
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              From a first hello to a weekly game
            </p>
            <h2 className="mt-3 text-3xl font-semibold">
              Your next good habit starts here.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: MapPin,
                title: 'Find players nearby',
                text: 'Pick your sport, set your radius, and meet people at your level.',
              },
              {
                icon: Users,
                title: 'Build your local crew',
                text: 'Join a community or bring your own people together around a shared sport.',
              },
              {
                icon: CalendarDays,
                title: 'Put play on the calendar',
                text: 'Host a game or claim an open spot. Less planning, more playing.',
              },
            ].map((item, index) => (
              <Card key={item.title} className="shadow-none">
                <CardHeader>
                  <div className="mb-5 flex items-center justify-between">
                    <item.icon className="size-6 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      0{index + 1}
                    </span>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="leading-6">
                    {item.text}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-8">
        <Brand />
        <p className="text-xs text-muted-foreground">
          Your game. Your crew. Your city.
        </p>
        <Button variant="link" asChild>
          <Link href="/sign-up">
            Let’s play <ArrowRight />
          </Link>
        </Button>
      </footer>
    </main>
  );
}
