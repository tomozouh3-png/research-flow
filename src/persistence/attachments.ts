import { idbDelete, idbGet, idbSet } from "./idb";

export const ATTACHMENTS_FOLDER_NAME = "添付ファイル";

async function getNestedDir(
  root: FileSystemDirectoryHandle,
  parts: string[],
  create = true,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

/** Vaultハンドル起点の相対パスを組み立てる。同じ添付を指すIDをファイル名の先頭に付け、同名ファイルの衝突を避ける */
export function attachmentRelativePath(projectSlug: string, nodeId: string, attachmentId: string, fileName: string): string {
  return `${ATTACHMENTS_FOLDER_NAME}/${projectSlug}/${nodeId}/${attachmentId}_${fileName}`;
}

export async function writeAttachmentToVault(
  vaultHandle: FileSystemDirectoryHandle,
  relativePath: string,
  file: File,
): Promise<void> {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  if (!fileName) throw new Error("不正なパスです");
  const dir = await getNestedDir(vaultHandle, parts);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function readAttachmentFromVault(vaultHandle: FileSystemDirectoryHandle, relativePath: string): Promise<File> {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  if (!fileName) throw new Error("不正なパスです");
  // 読み取りでは空フォルダを作らない（create:false）。見つからなければ分かりやすいエラーにする
  try {
    const dir = await getNestedDir(vaultHandle, parts, false);
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      throw new Error(`Vault内に添付ファイルが見つかりません（${relativePath}）。Vaultの接続先フォルダが以前と違う可能性があります`);
    }
    throw e;
  }
}

export async function deleteAttachmentFromVault(vaultHandle: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  if (!fileName) return;
  try {
    const dir = await getNestedDir(vaultHandle, parts);
    await dir.removeEntry(fileName);
  } catch {
    // 既に存在しない場合は何もしない（孤立参照の掃除なので失敗しても致命的ではない）
  }
}

/** Vault未接続時、この端末のIndexedDBにのみファイル実体を保存する */
export function localAttachmentKey(nodeId: string, attachmentId: string): string {
  return `attachment:${nodeId}:${attachmentId}`;
}

export async function writeAttachmentToLocal(key: string, file: File): Promise<void> {
  await idbSet(key, file);
}

export async function readAttachmentFromLocal(key: string): Promise<File | undefined> {
  return idbGet<File>(key);
}

export async function deleteAttachmentFromLocal(key: string): Promise<void> {
  await idbDelete(key);
}
