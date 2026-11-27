"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

const GA_ID = "G-9BJG2FRNP5";

export const Analytics = () => {
  const pathname = usePathname();

  // Self-hosted / local builds must not report into the upstream GA property.
  if (process.env.NEXT_PUBLIC_DEVELOPMENT === "true") return null;

  // The address-book storage iframe is infrastructure, not a user page view.
  if (pathname === "/_storage" || pathname?.startsWith("/_storage/")) {
    return null;
  }

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  `,
        }}
      />
    </>
  );
};
