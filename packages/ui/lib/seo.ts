import type { Metadata, MetadataRoute } from "next";
import { robotsRules } from "./ai-crawlers";
import type { Product } from "./products";

/**
 * Search metadata for a product's hosted demo (devtools, observe and
 * deploy.gorbital.dev). The demo runs on sample data, so only its home page
 * is meant for search results: the screens behind it are noindex, follow.
 */

const OG_IMAGE = { url: "https://www.gorbital.dev/og.png", width: 1200, height: 630, alt: "gorbital" };

/** Every page of the demo: the layout's defaults. */
export function demoMetadata(p: Product): Metadata {
  const title = `${p.name} · ${p.kind} for gorbital`;
  return {
    metadataBase: new URL(p.url),
    title,
    description: p.metaDescription,
    robots: { index: false, follow: true },
    openGraph: { type: "website", siteName: "gorbital", title, description: p.metaDescription, url: p.url, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description: p.metaDescription, images: [OG_IMAGE.url] },
  };
}

/** The demo's home page: indexable, with its canonical address and structured data. */
export function demoHomeMetadata(): Metadata {
  return { robots: { index: true, follow: true }, alternates: { canonical: "/" } };
}

/** JSON-LD for the demo's home page. */
export function demoStructuredData(p: Product): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${p.name} for gorbital`,
    description: p.metaDescription,
    url: p.url,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (web browser)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: "gorbital", url: "https://www.gorbital.dev" },
  };
}

export function demoRobots(p: Product): MetadataRoute.Robots {
  return { rules: robotsRules(), sitemap: `${p.url}/sitemap.xml` };
}

export function demoSitemap(p: Product): MetadataRoute.Sitemap {
  return [{ url: `${p.url}/` }];
}
