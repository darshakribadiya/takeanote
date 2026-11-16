import { SITE_URL } from "@/constants";

/*
 * Only the public landing page is for search engines. Notes (/n/), shared
 * notes (/s/), attachments (/a/) and auth pages are private or per-user.
 */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/n/", "/notes", "/s/", "/a/", "/auth/", "/reset-password", "/welcome"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
