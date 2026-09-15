/** Colour tokens for SVG charts and inline styles. Keep in sync with theme.css. */
export const theme = {
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
} as const;

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
