import "./globals.css";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { APP_DESCRIPTION, APP_NAME } from "@/constants";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
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
