'use client';
import { useEffect, useState } from 'react';
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
        console.error('Playzo offline support could not start:', error),
      );
  }, []);
  return null;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    );
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const installed = () => {
      setPrompt(null);
      setIos(false);
      setHelp(false);
    };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!prompt && !ios) return null;
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Install Playzo"
        onClick={async () => {
          if (!prompt) {
            setHelp((value) => !value);
            return;
          }
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Install app</span>
      </Button>
      {help && (
        <div
          role="status"
          className="absolute right-0 top-12 z-50 w-60 rounded-xl border bg-white p-4 text-sm shadow-lg"
        >
          In Safari, tap Share, then “Add to Home Screen” to install Playzo.
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
