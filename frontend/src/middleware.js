import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Sign-in/sign-up pages must stay reachable while signed out; everything
// else (the chat itself) requires a session — unauthenticated visitors get
// redirected to /sign-in automatically.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
