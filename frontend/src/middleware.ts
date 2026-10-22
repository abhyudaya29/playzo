import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
const protectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/groups(.*)',
  '/requests(.*)',
  '/messages(.*)',
  '/games(.*)',
  '/players(.*)',
  '/tournaments(.*)',
  '/admin(.*)',
]);
export default clerkMiddleware(async (auth, req) => {
  if (protectedRoute(req)) await auth.protect();
});
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf|map)).*)',
    '/(api|trpc)(.*)',
  ],
};
