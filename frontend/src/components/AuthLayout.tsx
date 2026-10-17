import Brand from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Users,
  CalendarDays,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1fr_1.15fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-[#f4f3ff] p-12 lg:flex xl:p-16">
        <Brand />
        <div className="relative z-10 my-12 max-w-md">
          <Badge
            variant="outline"
            className="mb-7 border-primary/20 bg-white/70 text-primary"
          >
            Your city. Your community.
          </Badge>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight">
            Good games.
            <br />
            Great people.
            <br />
            <span className="text-primary">Right nearby.</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-muted-foreground">
            Find people who love your sport. Make a plan, show up, and turn a
            good game into a great habit.
          </p>
          <div className="mt-10 space-y-5">
            {[
              {
                icon: MapPin,
                title: 'Closer to your next game',
                text: 'Discover players in your neighborhood.',
              },
              {
                icon: Users,
                title: 'Find your regular crew',
                text: 'Communities for the sports you love.',
              },
              {
                icon: CalendarDays,
                title: 'Make it happen',
                text: 'Join a game or put one on the calendar.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-white/70">
                  <item.icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A little less scrolling. A little more playing.
        </p>
        <div className="pointer-events-none absolute -right-48 -top-32 size-[500px] rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute -right-32 -top-16 size-[370px] rounded-full border border-primary/10" />
      </aside>
      <div className="flex min-w-0 flex-col bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-5 sm:px-10">
          <div className="lg:hidden">
            <Brand />
          </div>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden text-muted-foreground sm:inline-flex"
          >
            <a href="/">
              <ArrowLeft />
              Home
            </a>
          </Button>
          <nav aria-label="Account navigation" className="flex gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a href="/sign-in">Sign in</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/sign-up">Sign up</a>
            </Button>
          </nav>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="page-enter w-full max-w-[380px]">{children}</div>
        </div>
        <footer className="flex items-center justify-center gap-1.5 px-6 py-6 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Secure authentication with Clerk
        </footer>
      </div>
    </main>
  );
}
