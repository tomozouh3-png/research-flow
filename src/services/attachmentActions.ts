import { nowIso, slugifyProjectName, uid, type NodeAttachment } from "../model/types";
import {
  attachmentRelativePath,
  localAttachmentKey,
  writeAttachmentToLocal,
  writeAttachmentToVault,
} from "../persistence/attachments";
import { useMapStore } from "../state/store";

/** ノード詳細パネルの「＋ファイルを追加」とカードへのドラッグ＆ドロップ、両方から共有する受け入れ拡張子 */
export const ACCEPTED_ATTACHMENT_EXT = ".ppt,.pptx,.xls,.xlsx,.doc,.docx,.pdf,.tif,.tiff,.jpg,.jpeg,.png";

export function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

/**
 * ファイル実体をVault接続中ならVault内へ、未接続ならこの端末のIndexedDBへ保存し、
 * ノードには参照（メタ情報）だけを追加する。詳細パネルの「＋ファイルを追加」と
 * カードへのドラッグ＆ドロップの両方から呼ぶ共通処理（store.getState()で直接state参照するため、
 * Reactコンポーネントの外からでも呼べる）。複数ファイルは1つずつ処理し、途中で失敗しても続行する。
 */
export async function addAttachmentsToNode(nodeId: string, files: FileList | File[]): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    const { vaultHandle, projectName, addAttachment } = useMapStore.getState();
    const attachmentId = uid("attachment");
    try {
      let storage: NodeAttachment["storage"];
      if (vaultHandle) {
        const relativePath = attachmentRelativePath(slugifyProjectName(projectName), nodeId, attachmentId, file.name);
        await writeAttachmentToVault(vaultHandle, relativePath, file);
        storage = { type: "vault", relativePath };
      } else {
        const key = localAttachmentKey(nodeId, attachmentId);
        await writeAttachmentToLocal(key, file);
        storage = { type: "local", blobKey: key };
      }
      addAttachment(nodeId, {
        id: attachmentId,
        fileName: file.name,
        mimeType: file.type || guessMimeType(file.name),
        size: file.size,
        addedAt: nowIso(),
        storage,
      });
    } catch (e) {
      errors.push(`「${file.name}」の保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { errors };
}
