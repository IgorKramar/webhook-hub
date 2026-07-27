import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Webhook Hub",
    template: "%s — Webhook Hub",
  },
  description:
    "Панель просмотра и повторной доставки webhook-событий",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <Link href="/" className="brand">
              Webhook Hub
            </Link>

            <nav aria-label="Основная навигация">
              <Link href="/" className="navLink">
                События
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
