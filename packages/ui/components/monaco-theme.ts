import { palettes, type Palette } from "../theme";
import type { ThemeMode } from "../lib/theme-store";

/**
 * The Monaco themes built from the design tokens, one per theme mode: the
 * editor is the page's ground, keywords are the one accent, strings warm,
 * numbers cool, comments dim. The only place besides theme.ts that spells
 * a colour: Monaco wants hex strings, not CSS variables, so each theme is
 * built from the matching hex palette.
 */
export const MONACO_THEMES: Record<ThemeMode, string> = { dark: "gorbital-dark", light: "gorbital-light" };

/** Kept for callers that only know the dark theme's name. */
export const MONACO_THEME = MONACO_THEMES.dark;

/** A hex colour with an alpha byte appended, for Monaco's UI colours. */
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

export function buildMonacoTheme(mode: ThemeMode, t: Palette = palettes[mode]) {
  const light = mode === "light";
  return {
    base: (light ? "vs" : "vs-dark") as "vs" | "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: t.text.slice(1) },
      { token: "keyword", foreground: t.primary.slice(1), fontStyle: "bold" },
      { token: "operator", foreground: t.muted.slice(1) },
      { token: "delimiter", foreground: t.dim.slice(1) },
      { token: "identifier", foreground: t.text.slice(1) },
      { token: "identifier.quote", foreground: t.dim.slice(1) },
      { token: "predefined", foreground: t.violet.slice(1) },
      { token: "string", foreground: t.warn.slice(1) },
      { token: "number", foreground: t.info.slice(1) },
      { token: "comment", foreground: t.dim.slice(1), fontStyle: "italic" },
      { token: "comment.quote", foreground: t.dim.slice(1), fontStyle: "italic" },
      { token: "white", foreground: t.text.slice(1) },
    ],
    colors: {
      "editor.background": t.bg,
      "editor.foreground": t.text,
      "editorLineNumber.foreground": t.faint,
      "editorLineNumber.activeForeground": t.dim,
      "editorCursor.foreground": t.primary,
      "editor.selectionBackground": alpha(light ? t.primaryDeep : t.primary, light ? 0.9 : 0.22),
      "editor.inactiveSelectionBackground": alpha(light ? t.primaryDeep : t.primary, light ? 0.5 : 0.12),
      "editor.selectionHighlightBackground": alpha(t.primary, 0.1),
      "editor.lineHighlightBackground": alpha(t.surface, 0.9),
      "editor.lineHighlightBorder": t.hairline,
      "editor.wordHighlightBackground": alpha(t.info, 0.12),
      "editor.findMatchBackground": alpha(t.warn, 0.35),
      "editor.findMatchHighlightBackground": alpha(t.warn, 0.18),
      "editorBracketMatch.background": alpha(t.primary, 0.15),
      "editorBracketMatch.border": t.primaryMid,
      "editorBracketHighlight.foreground1": light ? t.primary : t.primarySoft,
      "editorBracketHighlight.foreground2": t.info,
      "editorBracketHighlight.foreground3": t.violet,
      "editorIndentGuide.background1": t.hairline,
      "editorIndentGuide.activeBackground1": t.border2,
      "editorWhitespace.foreground": t.hairline,
      "editorGutter.background": t.bg,
      "editorError.foreground": t.danger,
      "editorWarning.foreground": t.warn,
      "editorInfo.foreground": t.info,
      "editorMarkerNavigationError.background": t.danger,
      "editorOverviewRuler.border": t.bg,
      "editorOverviewRuler.errorForeground": t.danger,
      "editorWidget.background": t.elevated,
      "editorWidget.border": t.border,
      "editorWidget.foreground": t.text,
      "editorSuggestWidget.background": t.elevated,
      "editorSuggestWidget.border": t.border,
      "editorSuggestWidget.foreground": t.text,
      "editorSuggestWidget.selectedBackground": t.raised,
      "editorSuggestWidget.selectedForeground": t.text,
      "editorSuggestWidget.highlightForeground": t.primary,
      "editorSuggestWidget.focusHighlightForeground": t.primarySoft,
      "editorHoverWidget.background": t.elevated,
      "editorHoverWidget.border": t.border,
      "input.background": t.codeBg,
      "input.border": t.border,
      "input.foreground": t.text,
      "input.placeholderForeground": t.faint,
      "inputOption.activeBorder": t.primaryMid,
      "inputOption.activeBackground": alpha(t.primary, 0.15),
      focusBorder: alpha(t.primary, 0.5),
      "list.hoverBackground": t.raised,
      "list.focusBackground": t.raised,
      "list.activeSelectionBackground": t.raised,
      "scrollbarSlider.background": alpha(t.border2, 0.6),
      "scrollbarSlider.hoverBackground": alpha(t.border2, 0.9),
      "scrollbarSlider.activeBackground": t.border2,
      "scrollbar.shadow": alpha(t.bg, 0),
      "widget.shadow": alpha(t.umbra, light ? 0.18 : 0.6),
      "minimap.background": t.bg,
      "textLink.foreground": t.primary,
      "textLink.activeForeground": t.primarySoft,
      "editorLink.activeForeground": t.primary,
      "editorLineNumber.dimmedForeground": t.faint,
      "editorCodeLens.foreground": t.dim,
      "editorGhostText.foreground": t.faint,
      "editorStickyScroll.background": t.bg,
      "editorStickyScroll.shadow": alpha(t.bg, 0),
      "peekView.border": t.border,
      "badge.background": t.primaryDeep,
      "badge.foreground": t.primarySoft,
      "quickInput.background": t.elevated,
      "quickInput.foreground": t.text,
      "pickerGroup.foreground": t.primary,
      "keybindingLabel.background": t.codeBg,
      "keybindingLabel.border": t.border,
      "keybindingLabel.bottomBorder": t.border2,
      "keybindingLabel.foreground": t.dim,
    },
  };
}

/** The dark theme, kept for callers that read it directly. */
export const monacoTheme = buildMonacoTheme("dark");

/** Defines both themes on a Monaco instance; call it in `beforeMount`. */
export function defineMonacoThemes(editor: { defineTheme: (name: string, theme: ReturnType<typeof buildMonacoTheme>) => void }): void {
  editor.defineTheme(MONACO_THEMES.dark, buildMonacoTheme("dark"));
  editor.defineTheme(MONACO_THEMES.light, buildMonacoTheme("light"));
}

/** Editor options that don't change per instance. */
export const monacoDefaults = {
  fontFamily: 'var(--font-geist-mono), "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12.5,
  lineHeight: 20,
  letterSpacing: 0,
  fontLigatures: false,
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  matchBrackets: "always" as const,
  bracketPairColorization: { enabled: true },
  renderLineHighlight: "line" as const,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: "smooth" as const,
  cursorSmoothCaretAnimation: "on" as const,
  padding: { top: 10, bottom: 10 },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
  overviewRulerBorder: false,
  overviewRulerLanes: 2,
  hideCursorInOverviewRuler: true,
  wordWrap: "off" as const,
  tabSize: 2,
  insertSpaces: true,
  automaticLayout: true,
  fixedOverflowWidgets: true,
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on" as const,
  wordBasedSuggestions: "off" as const,
  suggest: { showWords: false, preview: false },
  contextmenu: false,
  stickyScroll: { enabled: false },
  guides: { indentation: true, bracketPairs: false },
  renderWhitespace: "none" as const,
  occurrencesHighlight: "singleFile" as const,
  selectionHighlight: true,
  roundedSelection: true,
  unicodeHighlight: { ambiguousCharacters: false },
};
