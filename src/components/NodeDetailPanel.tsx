import { useRef, useState } from "react";
import { CATEGORY_PRESET, STATUS_ORDER, STATUS_PRESET, type NodeAttachment, type TaskStatus } from "../model/types";
import { useMapStore } from "../state/store";
import { buildObsidianUri, displayLabel } from "../obsidian/uri";
import { deleteAttachmentFromLocal, deleteAttachmentFromVault, readAttachmentFromLocal, readAttachmentFromVault } from "../persistence/attachments";
import { ACCEPTED_ATTACHMENT_EXT, addAttachmentsToNode } from "../services/attachmentActions";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: "#6B7280" };
const fieldStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#111827",
  padding: "9px 10px",
  borderRadius: 9,
  border: "1px solid #E5E7EB",
  background: "#FAFAFA",
  width: "100%",
};

export function NodeDetailPanel() {
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const node = useMapStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const updateNodeData = useMapStore((s) => s.updateNodeData);
  const setNodeStatus = useMapStore((s) => s.setNodeStatus);
  const addTag = useMapStore((s) => s.addTag);
  const removeTag = useMapStore((s) => s.removeTag);
  const addObsidianLink = useMapStore((s) => s.addObsidianLink);
  const removeObsidianLink = useMapStore((s) => s.removeObsidianLink);
  const removeNode = useMapStore((s) => s.removeNode);
  const vaultName = useMapStore((s) => s.vaultName);
  const selectNode = useMapStore((s) => s.selectNode);
  const vaultHandle = useMapStore((s) => s.vaultHandle);
  const removeAttachment = useMapStore((s) => s.removeAttachment);

  const [tagDraft, setTagDraft] = useState("");
  const [linkPathDraft, setLinkPathDraft] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedNodeId || !node) {
    return (
      <div
        style={{
          width: 320,
          flexShrink: 0,
          background: "#FFFFFF",
          borderLeft: "1px solid #E5E7EB",
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: "#9CA3AF",
          fontSize: 12.5,
        }}
      >
        ノードをクリックすると
        <br />
        詳細を編集できます
      </div>
    );
  }

  const preset = CATEGORY_PRESET[node.data.category];

  const commitTag = () => {
    if (tagDraft.trim()) addTag(node.id, tagDraft);
    setTagDraft("");
  };

  const commitLink = () => {
    if (linkPathDraft.trim()) {
      addObsidianLink(node.id, { vaultName, filePath: linkPathDraft.trim() });
    }
    setLinkPathDraft("");
    setAddingLink(false);
  };

  const handleFilesChosen = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setAttachmentError(null);
    setAttachmentBusy(true);
    try {
      const { errors } = await addAttachmentsToNode(node.id, files);
      if (errors.length > 0) setAttachmentError(errors.join(" / "));
    } finally {
      setAttachmentBusy(false);
    }
  };

  // ブラウザは基本的にpptx/xlsxをインライン表示できないため、ダウンロードして手元のアプリで開いてもらう形にする
  // （PDFだけ新規タブで開く等の出し分けはせず、全種類で統一した確実な挙動にする）
  const handleDownloadAttachment = async (att: NodeAttachment) => {
    setAttachmentError(null);
    try {
      const file =
        att.storage.type === "vault"
          ? vaultHandle
            ? await readAttachmentFromVault(vaultHandle, att.storage.relativePath)
            : (() => {
                throw new Error("Vaultが接続されていません");
              })()
          : await readAttachmentFromLocal(att.storage.blobKey);
      if (!file) throw new Error("ファイルが見つかりませんでした");
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setAttachmentError(`「${att.fileName}」を開けませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRemoveAttachment = async (att: NodeAttachment) => {
    try {
      if (att.storage.type === "vault" && vaultHandle) {
        await deleteAttachmentFromVault(vaultHandle, att.storage.relativePath);
      } else if (att.storage.type === "local") {
        await deleteAttachmentFromLocal(att.storage.blobKey);
      }
    } catch {
      // 実ファイルの削除に失敗しても、一覧からの除去自体は進める（孤立ファイルより参照切れ表示を避ける方を優先）
    }
    removeAttachment(node.id, att.id);
  };

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: "#FFFFFF",
        borderLeft: "1px solid #E5E7EB",
        padding: 20,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>ノード詳細</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            background: preset.badgeBg,
            color: preset.badgeText,
          }}
        >
          {preset.label}
        </span>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>タイトル</span>
        <input
          type="text"
          value={node.data.title}
          onChange={(e) => updateNodeData(node.id, { title: e.target.value })}
          style={{ ...fieldStyle, fontWeight: 700 }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>日付</span>
        <input
          type="date"
          value={node.data.date ?? ""}
          onChange={(e) => updateNodeData(node.id, { date: e.target.value || undefined })}
          style={{ ...fieldStyle, fontWeight: 700, colorScheme: "light" }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>本文</span>
        <textarea
          rows={5}
          value={node.data.body}
          onChange={(e) => updateNodeData(node.id, { body: e.target.value })}
          style={{ ...fieldStyle, lineHeight: 1.6, resize: "vertical" }}
        />
      </label>

      {node.data.category === "task" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>ステータス</span>
          <select
            value={node.data.status ?? "todo"}
            onChange={(e) => setNodeStatus(node.id, e.target.value as TaskStatus)}
            style={{ ...fieldStyle, fontWeight: 700, color: STATUS_PRESET[node.data.status ?? "todo"].text }}
          >
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>
                {STATUS_PRESET[st].label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>タグ</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {node.data.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "#4B5563",
                background: "#F3F4F6",
                borderRadius: 7,
                padding: "4px 6px 4px 9px",
              }}
            >
              {tag}
              <button
                type="button"
                aria-label={`タグ ${tag} を削除`}
                onClick={() => removeTag(node.id, tag)}
                style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 11, padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              }
            }}
            onBlur={commitTag}
            placeholder="＋追加してEnter"
            style={{
              fontSize: 11,
              border: "1px dashed #D1D5DB",
              borderRadius: 7,
              padding: "4px 9px",
              width: 110,
              background: "#FFFFFF",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={labelStyle}>Obsidianリンク</span>
        {node.data.obsidianLinks.map((link) => (
          <div
            key={link.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 9,
              border: "1px solid #E5E7EB",
              background: "#FAFAFA",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <a
              href={buildObsidianUri(link)}
              style={{
                flex: 1,
                fontSize: 11.5,
                color: "#374151",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
              title={link.filePath}
            >
              {displayLabel(link)}
            </a>
            <button
              type="button"
              aria-label="リンクを削除"
              onClick={() => removeObsidianLink(node.id, link.id)}
              style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 12, padding: 0 }}
            >
              ×
            </button>
          </div>
        ))}

        {addingLink ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              autoFocus
              type="text"
              value={linkPathDraft}
              onChange={(e) => setLinkPathDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLink();
                if (e.key === "Escape") setAddingLink(false);
              }}
              placeholder="Vault相対パス（例: Notes/xxx.md）"
              style={{ ...fieldStyle, fontSize: 11.5 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={commitLink}
                style={{ fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", background: "#2563EB", border: "none", borderRadius: 8, padding: "7px 12px" }}
              >
                追加
              </button>
              <button
                type="button"
                onClick={() => setAddingLink(false)}
                style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7280", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 12px" }}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingLink(true)}
            style={{ fontSize: 11.5, fontWeight: 700, color: "#374151", background: "#FFFFFF", border: "1px dashed #D1D5DB", borderRadius: 9, padding: "8px 10px" }}
          >
            ＋ リンクを追加
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={labelStyle}>添付ファイル</span>
        {(node.data.attachments ?? []).map((att) => (
          <div
            key={att.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 9,
              border: "1px solid #E5E7EB",
              background: "#FAFAFA",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} style={{ flexShrink: 0 }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <button
              type="button"
              onClick={() => void handleDownloadAttachment(att)}
              title="ダウンロード"
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                border: "none",
                background: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11.5, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.fileName}>
                {att.fileName}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>{formatFileSize(att.size)}</div>
            </button>
            <button
              type="button"
              aria-label="添付ファイルを削除"
              onClick={() => void handleRemoveAttachment(att)}
              style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 12, padding: 0, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_ATTACHMENT_EXT}
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFilesChosen(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachmentBusy}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setAttachmentDragOver(true);
          }}
          onDragLeave={() => setAttachmentDragOver(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            setAttachmentDragOver(false);
            void handleFilesChosen(e.dataTransfer.files);
          }}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: attachmentDragOver ? "#2563EB" : "#374151",
            background: attachmentDragOver ? "#EFF6FF" : "#FFFFFF",
            border: attachmentDragOver ? "1.5px dashed #2563EB" : "1px dashed #D1D5DB",
            borderRadius: 9,
            padding: "8px 10px",
            cursor: attachmentBusy ? "default" : "pointer",
            opacity: attachmentBusy ? 0.6 : 1,
          }}
        >
          {attachmentBusy ? "保存中…" : "＋ ファイルを追加 または ドラッグ＆ドロップ"}
        </button>
        <span style={{ fontSize: 9.5, color: "#9CA3AF" }}>PPT/Excel/Word/PDF/TIFF/JPG/PNG</span>
        {attachmentError && <span style={{ fontSize: 10.5, color: "#DC2626" }}>{attachmentError}</span>}
        {!vaultHandle && (node.data.attachments?.length ?? 0) === 0 && (
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>
            Vault未接続のため、添付ファイルはこの端末のブラウザ内にのみ保存されます。
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 12,
          borderTop: "1px solid #F3F4F6",
          fontSize: 10.5,
          color: "#9CA3AF",
        }}
      >
        <span>更新: {new Date(node.data.updatedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        <button
          type="button"
          onClick={() => {
            removeNode(node.id);
            selectNode(null);
          }}
          style={{ color: "#DC2626", background: "none", border: "none", fontSize: 11, fontWeight: 700, padding: 0 }}
        >
          削除
        </button>
      </div>
    </div>
  );
}
