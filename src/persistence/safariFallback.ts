import type { ResearchMapFile } from "../model/types";

/** File System Access API 非対応ブラウザ（Safari等）向けの手動保存。ダウンロードフォルダに書き出す。 */
export function downloadMap(data: ResearchMapFile, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readMapFromFile(file: File): Promise<ResearchMapFile> {
  const text = await file.text();
  return JSON.parse(text) as ResearchMapFile;
}
