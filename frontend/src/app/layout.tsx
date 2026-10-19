import './globals.css';
import { PwaRegistration } from '@/components/PwaSupport';
import { ClerkProvider } from '@clerk/nextjs';
export const metadata = {
  applicationName: 'Playzo',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Playzo' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  title: 'Playzo — Your game. Your crew.',
  description: 'Find players, join groups and play nearby.',
};
export const viewport = {
  themeColor: '#6d28d9',
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
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
