import { products } from "@gorbital/dash/lib/products";
import { demoRobots } from "@gorbital/dash/lib/seo";

export const dynamic = "force-static";

export default function robots() {
  return demoRobots(products.observe);
}
