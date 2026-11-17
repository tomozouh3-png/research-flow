import { idbGet, idbSet } from "./idb";
import type { ResearchMapFile } from "../model/types";

export const MAPS_FOLDER_NAME = "研究進捗マップ";
const VAULT_HANDLE_KEY = "vaultDirHandle";

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export interface MapListEntry {
  fileName: string;
  /** ファイルの projectName。パース失敗時はファイル名から推測した値 */
  projectName: string;
  /** マップ内の updatedAt（無ければファイルの更新日時） */
  updatedAt: string;
  handle: FileSystemFileHandle;
}

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  try {
    return (await handle.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

/** キャッシュ済みハンドルがあれば返す（権限確認込み）。ユーザー操作なしでは新規許可は取れない。 */
export async function getCachedVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const cached = await idbGet<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY);
  if (!cached) return null;
  const ok = await verifyPermission(cached);
  return ok ? cached : null;
}

/** ユーザー操作（クリック等）のハンドラ内でのみ呼び出せる。 */
export async function pickVaultHandle(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error("File System Access API is not supported");
  const handle = await window.showDirectoryPicker({ id: "research-flow-vault", mode: "readwrite" });
  await idbSet(VAULT_HANDLE_KEY, handle);
  return handle;
}

export async function forgetVaultHandle(): Promise<void> {
  await idbSet(VAULT_HANDLE_KEY, undefined);
}

/** マップはVault直下に保存する（専用サブフォルダは使わない）。 */
async function getMapsDir(vaultHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return vaultHandle;
}

/**
 * Vaultフォルダ内の保存済みマップを列挙する。
 * 他デバイスから初めて接続した場合でも正しいプロジェクト名が出るよう、
 * ファイル名だけでなく中身の projectName/updatedAt を読む（ファイルは小さいため許容）。
 */
export async function listMaps(vaultHandle: FileSystemDirectoryHandle): Promise<MapListEntry[]> {
  const mapsDir = await getMapsDir(vaultHandle);
  const entries: MapListEntry[] = [];
  for await (const [name, handle] of mapsDir.entries()) {
    if (handle.kind === "file" && name.endsWith(".json")) {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const fallbackName = name.replace(/\.json$/, "");
      const fallbackUpdatedAt = new Date(file.lastModified).toISOString();
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Partial<ResearchMapFile>;
        // Vault直下には他のJSONも存在しうるため、マップ形式のものだけを対象にする
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) continue;
        entries.push({
          fileName: name,
          projectName: data.projectName || fallbackName,
          updatedAt: data.updatedAt || fallbackUpdatedAt,
          handle: fileHandle,
        });
      } catch {
        entries.push({ fileName: name, projectName: fallbackName, updatedAt: fallbackUpdatedAt, handle: fileHandle });
      }
    }
  }
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return entries;
}

export async function readMap(fileHandle: FileSystemFileHandle): Promise<ResearchMapFile> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text) as ResearchMapFile;
}

export async function saveMap(
  vaultHandle: FileSystemDirectoryHandle,
  fileName: string,
  data: ResearchMapFile,
): Promise<void> {
  const mapsDir = await getMapsDir(vaultHandle);
  const fileHandle = await mapsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function deleteMap(vaultHandle: FileSystemDirectoryHandle, fileName: string): Promise<void> {
  const mapsDir = await getMapsDir(vaultHandle);
  await mapsDir.removeEntry(fileName);
}
