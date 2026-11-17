import type { ObsidianLink } from "../model/types";

export function buildObsidianUri(link: ObsidianLink): string {
  // URLSearchParamsは空白を"+"にするが、Obsidianは"%20"でないと"+"をファイル名の一部と解釈して開けない
  const vault = encodeURIComponent(link.vaultName);
  const file = encodeURIComponent(link.filePath.replace(/\.md$/i, ""));
  return `obsidian://open?vault=${vault}&file=${file}`;
}

export function openObsidianNote(link: ObsidianLink): void {
  window.open(buildObsidianUri(link), "_blank");
}

export function displayLabel(link: ObsidianLink): string {
  if (link.label) return link.label;
  const parts = link.filePath.split("/");
  return parts[parts.length - 1] ?? link.filePath;
}
