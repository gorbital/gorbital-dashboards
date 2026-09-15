/**
 * The three tools built around apistock. The `id` is the stable identifier
 * (folder, subdomain, package name); `name` is what the product is called
 * in every UI. Rename a product here and everywhere follows.
 */
export type ProductId = "devtools" | "observe" | "deploy";

export type Product = {
  id: ProductId;
  /** Display name, lowercase like the apistock wordmark. */
  name: string;
  /** What it is, in plain words, for people who meet the name cold. */
  kind: string;
  tagline: string;
  url: string;
  port: number;
};

export const products: Record<ProductId, Product> = {
  devtools: {
    id: "devtools",
    name: "bench",
    kind: "devtools",
    tagline: "Inspect the app on your bench while aps dev runs it.",
    url: "https://bench.apistock.dev",
    port: 3100,
  },
  observe: {
    id: "observe",
    name: "gauge",
    kind: "observability",
    tagline: "Requests, traces, jobs and errors from the data your app already sends.",
    url: "https://gauge.apistock.dev",
    port: 3200,
  },
  deploy: {
    id: "deploy",
    name: "ship",
    kind: "deploy",
    tagline: "Releases, rollouts, migrations and the fleet, from commit to running instance.",
    url: "https://ship.apistock.dev",
    port: 3300,
  },
};
