import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TopBar } from "@/components/layout/top-bar";
import { routing } from "@/lib/i18n/routing";
import "../globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "common",
  });
  return { title: t("appName"), description: t("tagline") };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("layout");

  return (
    <html lang={locale} className={`${publicSans.variable} h-full antialiased`}>
      {/* One screen: the page never scrolls; panels and long page content scroll inside `main`. */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
          >
            {t("skipToContent")}
          </a>
          <TopBar />
          <main
            id="main"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
