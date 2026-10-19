import { products } from "@gorbital/dash/lib/products";
import { demoSitemap } from "@gorbital/dash/lib/seo";

export const dynamic = "force-static";

export default function sitemap() {
  return demoSitemap(products.deploy);
}
