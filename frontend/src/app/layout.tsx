import './globals.css';
import { PwaRegistration } from '@/components/PwaSupport';
import ClerkProfileSync from '@/components/ClerkProfileSync';
import AnalyticsProvider from '@/components/AnalyticsProvider';
import { ClerkProvider } from '@clerk/nextjs';
export const metadata = {
  applicationName: 'playhud',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'playhud' },
  icons: {
    icon: { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    apple: '/icons/apple-touch-icon.png',
  },
  title: 'playhud — Your game. Your crew.',
  description: 'Find players, join groups and play nearby.',
};
export const viewport = {
  themeColor: '#09086b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <PwaRegistration />
          <ClerkProfileSync />
          <AnalyticsProvider />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
