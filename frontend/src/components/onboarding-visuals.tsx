'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small local illustrations keep the choices crisp without loading remote photos.
export function PlayerAvatar({
  variant = 'other',
  className,
}: {
  variant?: string;
  className?: string;
}) {
  const feminine = variant === 'woman';
  const privateChoice = variant === 'prefer_not_to_say';
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={cn('size-24', className)}
    >
      <circle
        cx="60"
        cy="60"
        r="58"
        fill={feminine ? '#FFE9DD' : variant === 'man' ? '#E4E9FF' : '#EAE2FF'}
      />
      <circle cx="96" cy="27" r="6" fill={feminine ? '#F6B79D' : '#B7A2F3'} />
      <path
        d="M20 88l5 5m-5 0 5-5"
        stroke="#9383CD"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {privateChoice ? (
        <>
          <rect x="34" y="43" width="52" height="44" rx="15" fill="#9C89CC" />
          <path
            d="M46 44v-9a14 14 0 0 1 28 0v9"
            stroke="#55448A"
            strokeWidth="7"
          />
          <circle cx="60" cy="62" r="5" fill="white" />
          <path
            d="M60 64v7"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          {feminine && (
            <path d="M35 58c-9-44 57-54 53-7l3 35H29l6-28Z" fill="#42315D" />
          )}
          <path
            d="M27 111c0-29 15-40 33-40s34 11 34 40"
            fill={
              feminine ? '#DB785E' : variant === 'man' ? '#6D6BD6' : '#7E63C3'
            }
          />
          <path
            d="m47 77 13 14 13-14"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M51 65h18v15c-6 7-12 7-18 0V65Z" fill="#DCA07E" />
          <ellipse cx="60" cy="48" rx="23" ry="28" fill="#F2BF9E" />
          <path
            d={
              feminine
                ? 'M36 43c-3-31 49-33 48 5-8-4-17-10-21-20-5 11-15 15-27 15Z'
                : variant === 'man'
                  ? 'M36 45c-5-22 8-32 23-27 11-8 32 2 26 24l-11-9c-12 6-20 7-28 2l-10 10Z'
                  : 'M35 43c-9-17 5-21 10-20-1-14 20-15 25-6 18-5 26 13 14 27l-9-12c-10 8-26 6-31 3l-9 8Z'
            }
            fill="#42315D"
          />
          <path
            d="M48 49h1m22 0h1"
            stroke="#42315D"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M54 62c4 4 9 4 13 0"
            stroke="#9B554D"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {variant === 'other' && (
            <>
              <rect
                x="42"
                y="43"
                width="14"
                height="13"
                rx="5"
                stroke="#69518E"
                strokeWidth="2"
              />
              <rect
                x="65"
                y="43"
                width="14"
                height="13"
                rx="5"
                stroke="#69518E"
                strokeWidth="2"
              />
              <path d="M56 48h9" stroke="#69518E" strokeWidth="2" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

export function PlayIllustration({ kind }: { kind: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl bg-white/60"
    >
      <div className="absolute inset-4 rounded-xl border border-dashed border-primary/15" />
      {kind === 'join_individually' ? (
        <>
          <PlayerAvatar variant="other" className="relative size-24" />
          <span className="absolute right-5 top-4 flex size-7 items-center justify-center rounded-full bg-lime-200 text-lime-900">
            <Sparkles className="size-4" />
          </span>
        </>
      ) : kind === 'find_group' ? (
        <div className="relative flex shrink-0 scale-[.38] items-end -space-x-6 sm:scale-[.8]">
          <PlayerAvatar variant="man" className="size-20 -rotate-12" />
          <PlayerAvatar variant="woman" className="z-10 size-24" />
          <PlayerAvatar variant="other" className="size-20 rotate-12" />
        </div>
      ) : (
        <>
          <div className="relative w-28 rotate-[-6deg] rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex justify-between">
              <span className="size-2 rounded-full bg-violet-300" />
              <span className="size-2 rounded-full bg-violet-300" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-3 rounded-sm bg-accent',
                    i === 4 && 'bg-primary',
                  )}
                />
              ))}
            </div>
          </div>
          <span className="absolute bottom-3 right-6 flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-lg">
            <Check className="size-5" />
          </span>
        </>
      )}
    </div>
  );
}

export function IllustratedChoice({
  name,
  value,
  label,
  description,
  checked,
  onChange,
  children,
  compact = false,
}: {
  name: string;
  value: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.label
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      className="relative min-w-0 cursor-pointer"
    >
      <input
        type="radio"
        name={name}
        value={value}
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        className={cn(
          'relative flex h-full flex-col items-center rounded-2xl border-2 border-transparent bg-[#f6f5fa] p-4 text-center transition-colors peer-checked:border-primary peer-checked:bg-accent/60 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-4',
          compact
            ? 'gap-2 sm:gap-3'
            : 'grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-left sm:flex sm:gap-4 sm:text-center',
        )}
      >
        <span
          className={cn(
            'absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border bg-white transition-colors',
            checked && 'border-primary bg-primary text-white',
          )}
          aria-hidden="true"
        >
          {checked && <Check className="size-3.5" />}
        </span>
        {children && (
          <span className={cn('block w-full', !compact && 'row-span-2')}>
            {children}
          </span>
        )}
        <span
          className={cn(
            'block text-sm font-semibold sm:text-base',
            !compact && 'self-end sm:self-auto',
          )}
        >
          {label}
        </span>
        {description && (
          <span className="max-w-52 self-start text-xs leading-5 text-muted-foreground sm:self-auto">
            {description}
          </span>
        )}
      </span>
    </motion.label>
  );
}
