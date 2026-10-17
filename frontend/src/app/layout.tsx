import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
export const metadata = {
  title: 'Playzo — Your game. Your crew.',
  description: 'Find players, join groups and play nearby.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
