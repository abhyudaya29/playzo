export default function OnboardingIntro() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[calc(100svh-10rem)] items-center justify-center"
    >
      <span className="sr-only">Getting your playground ready…</span>
      <picture className="block w-full">
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet="/onboarding-loader-static.svg"
        />
        <img
          src="/onboarding-loader.svg"
          width={1200}
          height={440}
          alt=""
          className="block h-auto w-full rounded-2xl"
        />
      </picture>
    </div>
  );
}
