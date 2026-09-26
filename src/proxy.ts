import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // All pages except API routes, Next internals, and static files.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
