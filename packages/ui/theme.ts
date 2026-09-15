/** Colour tokens for SVG charts and inline styles. Keep in sync with theme.css. */
export const theme = {
  bg: "#0c0c0a",
  surface: "#131310",
  elevated: "#1c1c18",
  raised: "#24241f",
  codeBg: "#0a0a08",
  text: "#f0efe9",
  muted: "#a5a59a",
  dim: "#8a8a80",
  faint: "#5a5a52",
  hairline: "#22221e",
  border: "#2a2a24",
  border2: "#3a3a34",
  danger: "#ff8f6b",
  warn: "#f0c86b",
  ok: "#8fd98a",
  info: "#8fc4ff",
  violet: "#c4a6ff",
  primary: "#d8ff3e",
  primarySoft: "#e9ff8a",
  primaryMid: "#a3c22f",
  primaryDeep: "#46561a",
  primaryDeeper: "#333f11",
  primaryShadow: "#232b0b",
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
