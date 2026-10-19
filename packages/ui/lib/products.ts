/**
 * The three tools built around gorbital. The `id` is the stable identifier
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
  /** For search results and link previews: what the hosted demo is, within a snippet's 160 characters. */
  metaDescription: string;
  url: string;
  port: number;
};

export const products: Record<ProductId, Product> = {
  devtools: {
    id: "devtools",
    name: "Dev Portal",
    short: "Dev",
    kind: "devtools",
    tagline: "Inspect the app on your bench while orb dev runs it.",
    metaDescription:
      "Try the gorbital Dev Portal live with sample data: routes and guards, requests, logs, jobs, mail, the database and generators, as orb dev serves them locally.",
    url: "https://devtools.gorbital.dev",
    port: 3100,
  },
  observe: {
    id: "observe",
    name: "Observability Portal",
    short: "Observability",
    kind: "observability",
    tagline: "Requests, traces, jobs and errors from the data your app already sends.",
    metaDescription:
      "A live demo of the gorbital Observability Portal with sample data: requests, traces, background jobs, errors and logs from a Go API's own telemetry.",
    url: "https://observe.gorbital.dev",
    port: 3200,
  },
  deploy: {
    id: "deploy",
    name: "Deployment Portal",
    short: "Deploy",
    kind: "deploy",
    tagline: "Releases, rollouts, migrations and the fleet, from commit to running instance.",
    metaDescription:
      "A live demo of the gorbital Deployment Portal with sample data: releases, rollouts, database migrations, environments and instances for Go APIs.",
    url: "https://deploy.gorbital.dev",
    port: 3300,
  },
};
