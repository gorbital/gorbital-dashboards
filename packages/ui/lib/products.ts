/**
 * The three tools built around apistock. The `id` is the stable identifier
 * (folder, subdomain, package name); `name` is what the product is called
 * in every UI. Rename a product here and everywhere follows.
 */
export type ProductId = "devtools" | "observe" | "deploy";

export type Product = {
  id: ProductId;
  /** Display name. */
  name: string;
  /** One word for tight spaces (the icon rail, chips). */
  short: string;
  /** What it is, in plain words. */
  kind: string;
  tagline: string;
  url: string;
  port: number;
};

export const products: Record<ProductId, Product> = {
  devtools: {
    id: "devtools",
    name: "Dev Portal",
    short: "Dev",
    kind: "devtools",
    tagline: "Inspect the app on your bench while aps dev runs it.",
    url: "https://devtools.apistock.dev",
    port: 3100,
  },
  observe: {
    id: "observe",
    name: "Observability Portal",
    short: "Observability",
    kind: "observability",
    tagline: "Requests, traces, jobs and errors from the data your app already sends.",
    url: "https://observe.apistock.dev",
    port: 3200,
  },
  deploy: {
    id: "deploy",
    name: "Deployment Portal",
    short: "Deploy",
    kind: "deploy",
    tagline: "Releases, rollouts, migrations and the fleet, from commit to running instance.",
    url: "https://deploy.apistock.dev",
    port: 3300,
  },
};
