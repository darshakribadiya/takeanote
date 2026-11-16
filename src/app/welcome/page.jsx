import Link from "next/link";
import { Icon } from "@iconify/react";
import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME, APP_SUMMARY, SITE_URL } from "@/constants";

/*
 * Public landing page. The proxy serves it at "/" to signed-out visitors
 * (and search engines), so its canonical address is "/", not "/welcome".
 * Everything here is server-rendered text for crawlers; JSON-LD describes
 * the product, the site and the FAQ for schema.org.
 */
// The page's own openGraph replaces the inherited one, so the image from app/opengraph-image is listed again.
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${APP_NAME}: ${APP_DESCRIPTION}` };

export const metadata = {
  title: { absolute: `${APP_NAME}: fast notes, documents and flowcharts` },
  description: APP_SUMMARY,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_SUMMARY,
    url: "/",
    locale: "en_US",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: APP_NAME, description: APP_SUMMARY, images: [SHARE_IMAGE.url] },
};

const FEATURES = [
  {
    icon: "mdi:lightning-bolt-outline",
    title: "Capture in seconds",
    text: "Start typing on the home screen and a note is created for you. Press N anywhere to start another.",
  },
  {
    icon: "mdi:file-document-outline",
    title: "Real documents",
    text: "Write on A4, Letter or custom paper with page breaks, headings, tables, checklists, images and files.",
  },
  {
    icon: "mdi:shape-outline",
    title: "Canvas and flowcharts",
    text: "Lay out ideas with text, sticky notes, groups and flowchart shapes joined by arrows.",
  },
  {
    icon: "mdi:account-multiple-outline",
    title: "Live collaboration",
    text: "See who is in a note, follow their cursors and edit together in real time.",
  },
  {
    icon: "mdi:share-variant-outline",
    title: "Share by link or email",
    text: "Give view or edit access with an optional expiry, and see when people opened or edited a note.",
  },
  {
    icon: "mdi:cloud-check-outline",
    title: "Saved and synced",
    text: "Notes save as you type, keep working offline and sync across your devices when you reconnect.",
  },
];

const FAQ = [
  {
    question: `Is ${APP_NAME} free?`,
    answer: `Yes. Creating an account and writing notes, documents and canvases in ${APP_NAME} is free.`,
  },
  {
    question: "Can I share a note with someone?",
    answer:
      "Yes. Share a link that anyone signed in can open, or invite a person by email with view or edit access and an optional expiry date. You can see when they opened or edited the note and remove access at any time.",
  },
  {
    question: "Can several people edit the same note?",
    answer: "Yes. Everyone with edit access works on the same note live, with names next to their cursors.",
  },
  {
    question: "Does it work offline?",
    answer: "Notes you have open keep working offline and sync automatically when you are back online.",
  },
  {
    question: "Can I draw flowcharts?",
    answer:
      "Yes. Canvas notes include process, decision, input/output, database, document and other flowchart shapes that you connect with arrows.",
  },
];

function structuredData() {
  const logo = `${SITE_URL}/logo.svg`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: APP_NAME,
        url: `${SITE_URL}/`,
        logo: { "@type": "ImageObject", url: logo },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: APP_NAME,
        url: `${SITE_URL}/`,
        description: APP_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: APP_NAME,
        url: `${SITE_URL}/`,
        description: APP_SUMMARY,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript and a modern web browser.",
        image: `${SITE_URL}/opengraph-image`,
        featureList: FEATURES.map((feature) => feature.title),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export default function WelcomePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />

      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link aria-label={`${APP_NAME} home`} href="/">
            <Logo />
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <Button render={<Link href="/login" />} variant="ghost">
              Sign in
            </Button>
            <Button render={<Link href="/login" />}>Get started</Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 pb-16 text-center md:px-6 md:pt-28">
          <LogoMark className="mb-6" size={56} />
          <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Notes, documents and flowcharts in one fast app
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl">{APP_SUMMARY}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button render={<Link href="/login" />} size="lg">
              Start writing, it&apos;s free
            </Button>
            <Button render={<a href="#features" />} size="lg" variant="outline">
              See features
            </Button>
          </div>
        </section>

        <section aria-labelledby="features-title" className="border-t bg-muted/40" id="features">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <h2 className="text-center font-heading text-3xl font-semibold tracking-tight" id="features-title">
              Everything you need to think on the page
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <li className="flex flex-col gap-3 rounded-2xl border bg-background p-6" key={feature.title}>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                    <Icon aria-hidden="true" className="size-5" icon={feature.icon} />
                  </span>
                  <h3 className="font-heading text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-center font-heading text-3xl font-semibold tracking-tight" id="faq-title">
            Frequently asked questions
          </h2>
          <div className="mt-8 flex flex-col divide-y rounded-2xl border">
            {FAQ.map((item) => (
              <details className="group px-5 py-4" key={item.question}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.question}
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    icon="mdi:chevron-down"
                  />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center md:px-6">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Your next thought deserves a note</h2>
            <Button render={<Link href="/login" />} size="lg">
              Create a free account
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row md:px-6">
          <Logo className="text-foreground" size={22} />
          <p>
            © {APP_NAME}. {APP_DESCRIPTION}
          </p>
        </div>
      </footer>
    </>
  );
}
