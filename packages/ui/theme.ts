/**
 * Colour tokens for SVG charts and inline styles. Each value is a CSS
 * variable reference, so a chart drawn with `theme.primary` follows the
 * theme (theme.css sets the variables, and html[data-theme="light"]
 * overrides them). `palettes` spells the same tokens in hex for the two
 * places that cannot read CSS variables: Monaco's theme and image exports.
 * Keep both in sync with theme.css.
 */

const names = [
  "bg",
  "surface",
  "elevated",
  "raised",
  "codeBg",
  "text",
  "muted",
  "dim",
  "faint",
  "hairline",
  "border",
  "border2",
  "danger",
  "warn",
  "ok",
  "info",
  "violet",
  "primary",
  "primarySoft",
  "primaryMid",
  "primaryDeep",
  "primaryDeeper",
  "primaryShadow",
  "umbra",
] as const;

export type TokenName = (typeof names)[number];
export type Palette = Record<TokenName, string>;

/** The CSS variable each token reads, e.g. `codeBg` → `--color-code-bg`. */
const cssName: Record<TokenName, string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  elevated: "--color-elevated",
  raised: "--color-raised",
  codeBg: "--color-code-bg",
  text: "--color-text",
  muted: "--color-muted",
  dim: "--color-dim",
  faint: "--color-faint",
  hairline: "--color-hairline",
  border: "--color-border",
  border2: "--color-border-2",
  danger: "--color-danger",
  warn: "--color-warn",
  ok: "--color-ok",
  info: "--color-info",
  violet: "--color-violet",
  primary: "--color-primary",
  primarySoft: "--color-primary-soft",
  primaryMid: "--color-primary-mid",
  primaryDeep: "--color-primary-deep",
  primaryDeeper: "--color-primary-deeper",
  primaryShadow: "--color-primary-shadow",
  umbra: "--color-umbra",
};

export const theme = Object.fromEntries(names.map((n) => [n, `var(${cssName[n]})`])) as Palette;

export const palettes: Record<"dark" | "light", Palette> = {
  dark: {
    bg: "#0B0C0A",
    surface: "#16180F",
    elevated: "#1F221A",
    raised: "#272B21",
    codeBg: "#090A08",
    text: "#F2F1EC",
    muted: "#A8AB9F",
    dim: "#8E9285",
    faint: "#5E6157",
    hairline: "#22251C",
    border: "#2B2F23",
    border2: "#3B4031",
    danger: "#FF5C2B",
    warn: "#f0c86b",
    ok: "#8fd98a",
    info: "#8fc4ff",
    violet: "#c4a6ff",
    primary: "#C6F24A",
    primarySoft: "#DAF77E",
    primaryMid: "#93B534",
    primaryDeep: "#3F521A",
    primaryDeeper: "#2F3D12",
    primaryShadow: "#1F290B",
    umbra: "#000000",
  },
  light: {
    bg: "#f2f1ec",
    surface: "#faf9f5",
    elevated: "#ffffff",
    raised: "#e9e8e1",
    codeBg: "#e9e8e1",
    text: "#0b0c0a",
    muted: "#57564f",
    dim: "#6f6f66",
    faint: "#a3a39a",
    hairline: "#dcdbd2",
    border: "#cfcdc3",
    border2: "#b3b1a7",
    danger: "#c2410c",
    warn: "#a9781a",
    ok: "#3f8a3a",
    info: "#2f63a8",
    violet: "#6d4fc2",
    primary: "#5c7a12",
    primarySoft: "#4e690f",
    primaryMid: "#7f9f2c",
    primaryDeep: "#dff3a6",
    primaryDeeper: "#edf8cd",
    primaryShadow: "#f4fadf",
    umbra: "#3a3a33",
  },
};

/** The hex value a token has right now, read from the document; the dark palette when there is no document. */
export function resolveToken(name: TokenName): string {
  if (typeof document === "undefined") return palettes.dark[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(cssName[name]).trim();
  return v || palettes.dark[name];
}

export type Tone = "accent" | "muted" | "ok" | "warn" | "danger" | "info" | "violet";

export const toneColor: Record<Tone, string> = {
  accent: theme.primary,
  muted: theme.muted,
  ok: theme.ok,
  warn: theme.warn,
  danger: theme.danger,
  info: theme.info,
  violet: theme.violet,
};

/** Series order for stacked and categorical charts. */
export const series = [theme.primary, theme.muted, theme.warn, theme.danger, theme.info, theme.violet] as const;
