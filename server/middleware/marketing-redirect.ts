/**
 * 301 redirect app.reqcore.com's duplicate marketing pages (home, pricing)
 * to their canonical versions on reqcore.com (the reqcore-web repo).
 *
 * app.reqcore.com still ships a home page and a pricing page for legacy
 * reasons, but reqcore.com is the canonical marketing site (SEO, sitemap,
 * localized content). Only these two routes redirect — everything else
 * (auth, dashboard, jobs, career, onboarding, interview, join) stays on
 * app.reqcore.com since that's the actual product.
 */
const APP_HOSTS = new Set(["app.reqcore.com"]);
const CANONICAL_ORIGIN = "https://reqcore.com";
const NON_DEFAULT_LOCALES = ["es", "fr", "de", "nb", "vi"];

const REDIRECT_PATHS = new Set([
  "/",
  "/pricing",
  ...NON_DEFAULT_LOCALES.flatMap((locale) => [
    `/${locale}`,
    `/${locale}/pricing`,
  ]),
]);

export default defineEventHandler((event) => {
  const host = getRequestHeader(event, "host")?.split(":")[0]?.toLowerCase();
  if (!host || !APP_HOSTS.has(host)) return;

  const url = getRequestURL(event);
  if (!REDIRECT_PATHS.has(url.pathname)) return;

  const target = `${CANONICAL_ORIGIN}${url.pathname}${url.search}`;
  return sendRedirect(event, target, 301);
});
