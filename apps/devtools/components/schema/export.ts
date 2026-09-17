/**
 * Exports of the diagram: PNG and SVG through html-to-image (the browser
 * rasterises the React Flow viewport with the theme's fonts and colours),
 * Mermaid through `toMermaid`. Nothing here talks to the backend.
 */
import { getNodesBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { theme } from "@gorbital/dash/theme";

const PAD = 40;

/** Renders the viewport with every node in frame at 1:1 and downloads it as `<name>.<format>`. */
export async function exportImage(container: HTMLElement, nodes: Node[], format: "png" | "svg", name: string): Promise<void> {
  const viewport = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport || nodes.length === 0) throw new Error("nothing to export");
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + PAD * 2);
  const height = Math.ceil(bounds.height + PAD * 2);
  const options = {
    backgroundColor: theme.bg,
    width,
    height,
    pixelRatio: format === "png" ? (width * height > 16_000_000 ? 1 : 2) : 1,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${PAD - bounds.x}px, ${PAD - bounds.y}px) scale(1)` },
  };
  const url = format === "png" ? await toPng(viewport, options) : await toSvg(viewport, options);
  download(url, `${name}.${format}`);
}

export function download(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Copies text to the clipboard; falls back to a download when the clipboard is unavailable (an insecure origin). */
export async function copyText(text: string, fallbackName: string): Promise<"copied" | "downloaded"> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // Fall through to the download.
  }
  download(`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`, fallbackName);
  return "downloaded";
}
