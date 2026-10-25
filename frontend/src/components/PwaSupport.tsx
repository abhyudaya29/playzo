'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    )
      return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) =>
        console.error('playhud offline support could not start:', error),
      );
  }, []);
  return null;
}

type InstallState = {
  prompt: InstallPrompt | null;
  ios: boolean;
  android: boolean;
  installed: boolean;
  busy: boolean;
  install: () => Promise<boolean>;
};
const InstallContext = createContext<InstallState | null>(null);

// Keep the browser's single-use install event across client-side navigation.
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const standalone =
      display.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(!!standalone);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    );
    setAndroid(/Android/i.test(navigator.userAgent));
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const changed = () => {
      if (display.matches) complete();
    };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    display.addEventListener('change', changed);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
      display.removeEventListener('change', changed);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return false;
    const event = prompt;
    setPrompt(null);
    setBusy(true);
    try {
      // Called directly from the button click, preserving the required user gesture.
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <InstallContext.Provider
      value={{ prompt, ios, android, installed, busy, install }}
    >
      <PwaRegistration />
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const state = useContext(InstallContext);
  const [help, setHelp] = useState(false);
  if (
    !state ||
    state.installed ||
    (!state.prompt && !state.ios && !state.android)
  )
    return null;
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Install playhud"
        aria-expanded={help}
        disabled={state.busy}
        onClick={async () => {
          setHelp(false);
          if (!(await state.install())) setHelp(true);
        }}
      >
        <Download className="size-4" />
        <span>{state.busy ? 'Installing…' : 'Install app'}</span>
      </Button>
      {help && (
        <div
          role="status"
          className="absolute right-0 top-12 z-50 w-60 rounded-xl border bg-white p-4 text-sm shadow-lg"
        >
          {state.ios
            ? 'In Safari, tap Share, then “Add to Home Screen” to install playhud.'
            : !window.isSecureContext
              ? 'Open Playhud over HTTPS in Chrome to install the app.'
              : 'In Chrome, open the ⋮ menu and tap “Install app” or “Add to Home screen”. If you’re in another app’s browser, open this page in Chrome first.'}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setHelp(false)}
          >
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}
