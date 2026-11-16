import "./globals.css";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { APP_NAME, APP_SUMMARY, SITE_URL } from "@/constants";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/*
 * Site-wide SEO defaults. Pages override title / description / robots;
 * the favicon (icon.svg, apple-icon), Open Graph image, robots.txt,
 * sitemap.xml and manifest come from their file conventions in app/.
 */
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME}: fast notes, documents and canvas`, template: `%s · ${APP_NAME}` },
  description: APP_SUMMARY,
  applicationName: APP_NAME,
  keywords: [
    "note taking app",
    "online notes",
    "collaborative notes",
    "canvas whiteboard",
    "flowchart maker",
    "share notes",
    "markdown notes",
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  category: "productivity",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_SUMMARY,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: APP_NAME, description: APP_SUMMARY },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- fonts must come from Google's CDN, not next/font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400..600&family=Google+Sans+Flex:wght@400..700&display=swap"
        />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans">
        <ToastProvider position="bottom-center">
          <AnchoredToastProvider>{children}</AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
