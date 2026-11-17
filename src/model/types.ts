import type { Edge, Node, Viewport } from "@xyflow/react";

export type NodeCategory = "task" | "idea" | "question" | "result";
export type TaskStatus = "todo" | "in_progress" | "done" | "on_hold";
export type EdgeLineStyle = "solid" | "dashed";

export interface ObsidianLink {
  id: string;
  vaultName: string;
  /** Vault相対パス。例: "Notes/260907_....md" */
  filePath: string;
  label?: string;
}

/** カード内の好きな位置に自由に置ける付箋コメント。x/yはカードの幅・高さに対する%（0〜100） */
export interface FreeComment {
  id: string;
  text: string;
  x: number;
  y: number;
}

/**
 * ノードに添付するファイル（PPT/Excel/PDF等）のメタ情報。実体は別途保存し、ここには参照だけを持つ
 * （JSON自体にBase64埋め込みすると、大きなファイルでマップのJSONが肥大化し重くなるため）。
 * Vault接続時は実ファイルをVault内に置き他デバイスとも同期、未接続時はこの端末のIndexedDBにのみ保存する。
 */
export interface NodeAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  addedAt: string;
  storage: { type: "vault"; relativePath: string } | { type: "local"; blobKey: string };
}

export interface MapNodeData extends Record<string, unknown> {
  category: NodeCategory;
  title: string;
  body: string;
  /** category === 'task' のときのみ意味を持つ */
  status?: TaskStatus;
  /** 実験・作業そのものの日付（YYYY-MM-DD）。ユーザーが手動で設定する。未設定可 */
  date?: string;
  tags: string[];
  obsidianLinks: ObsidianLink[];
  /** カードの枠に対して、どれだけ文字を大きくするかの倍率（既定1）。リサイズ時の自動フィットや手動のA-/A+で更新される */
  fontScale?: number;
  /**
   * true（既定）＝枠は中身にぴったり自動追従、false＝ユーザーが一度でも手動リサイズ／文字サイズ調整した後。
   * これをノードデータ自身に持たせず一時的なメモリだけで管理すると、マップを開き直した瞬間に
   * 「まだ誰も触っていない」扱いに戻って手動サイズが自動フィットで上書き・消失してしまうため、保存対象にしている。
   */
  autoFit?: boolean;
  /** カード内の自由な位置に置ける付箋コメント。タイトル・本文とは別に、余白の好きな場所へ書き込める */
  comments?: FreeComment[];
  /** PPT/Excel/PDFなどの添付ファイル（メタ情報のみ。実体はVaultまたはこの端末のIndexedDB） */
  attachments?: NodeAttachment[];
  createdAt: string;
  updatedAt: string;
}

export type ResearchFlowNode = Node<MapNodeData, NodeCategory>;

/**
 * 矢印の上（ラベルとは別）に自由に置ける付箋コメント。
 * t: 矢印の始点→終点を結ぶ直線上の位置（0〜1）。offset: その直線からの垂直方向のズレ(px, 符号あり)。
 * ノード側のFreeCommentが「カードの%座標」なのに対し、矢印には固定の箱がないため、
 * 矢印の形に追従しやすい「直線上の位置＋垂線オフセット」で表現する。
 */
export interface EdgeComment {
  id: string;
  text: string;
  t: number;
  offset: number;
}

export interface MapEdgeData extends Record<string, unknown> {
  lineStyle: EdgeLineStyle;
  /** ラベルの文字サイズ(px)。未指定時は既定値(DEFAULT_EDGE_LABEL_FONT_SIZE)を使う */
  labelFontSize?: number;
  /** 矢印の中央ラベルとは別に、矢印上の好きな位置へ置ける自由コメント */
  comments?: EdgeComment[];
}

export type ResearchFlowEdge = Edge<MapEdgeData>;

export const DEFAULT_EDGE_LABEL_FONT_SIZE = 13;
export const MIN_EDGE_LABEL_FONT_SIZE = 8;
export const MAX_EDGE_LABEL_FONT_SIZE = 36;

export const SCHEMA_VERSION = 1;

export interface ResearchMapFile {
  schemaVersion: number;
  appVersion: string;
  projectName: string;
  devFolderPath?: string;
  vaultName: string;
  createdAt: string;
  updatedAt: string;
  nodes: ResearchFlowNode[];
  edges: ResearchFlowEdge[];
  viewport?: Viewport;
}

export interface CategoryPreset {
  color: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}

export const CATEGORY_PRESET: Record<NodeCategory, CategoryPreset> = {
  task: { color: "#3B82F6", badgeBg: "#EFF6FF", badgeText: "#1D4ED8", label: "タスク" },
  idea: { color: "#D97706", badgeBg: "#FFFBEB", badgeText: "#92400E", label: "アイデア" },
  question: { color: "#8B5CF6", badgeBg: "#F5F3FF", badgeText: "#6D28D9", label: "疑問・仮説" },
  result: { color: "#22C55E", badgeBg: "#ECFDF5", badgeText: "#15803D", label: "実験結果・知見" },
};

export interface StatusPreset {
  bg: string;
  text: string;
  label: string;
}

export const STATUS_PRESET: Record<TaskStatus, StatusPreset> = {
  todo: { bg: "#F3F4F6", text: "#6B7280", label: "未着手" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8", label: "進行中" },
  // 「着手済み」＝実質「完了」。カード上のクリック循環では3番目（未着手→進行中→着手済み）として使う
  done: { bg: "#DCFCE7", text: "#15803D", label: "着手済み" },
  on_hold: { bg: "#FFEDD5", text: "#C2410C", label: "保留" },
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "on_hold"];
export const CATEGORY_ORDER: NodeCategory[] = ["task", "idea", "question", "result"];

let uidCounter = 0;
/** crypto.randomUUID が使えない環境（file://等）向けのフォールバック付きID生成 */
export function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "2026-08-21" -> "2026年8月21日"
 * スラッシュ区切り（26/08/21等）は年・月・日の並びを誤読しやすいため、
 * 日本語の「〇年〇月〇日」表記で曖昧さをなくす（年も常に表示）
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

export const DEFAULT_NODE_WIDTH = 220;
export const DEFAULT_NODE_HEIGHT = 168;
export const MIN_NODE_WIDTH = 180;
export const MIN_NODE_HEIGHT = 110;
export const DEFAULT_FONT_SCALE = 1;
export const MIN_FONT_SCALE = 0.6;
export const MAX_FONT_SCALE = 3;

export function createNode(category: NodeCategory, position: { x: number; y: number }): ResearchFlowNode {
  const ts = nowIso();
  return {
    id: uid("node"),
    type: category,
    position,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    data: {
      category,
      title: category === "task" ? "新しいタスク" : CATEGORY_PRESET[category].label + "を追加",
      body: "",
      status: category === "task" ? "todo" : undefined,
      tags: [],
      obsidianLinks: [],
      fontScale: DEFAULT_FONT_SCALE,
      autoFit: true,
      comments: [],
      attachments: [],
      createdAt: ts,
      updatedAt: ts,
    },
  };
}

export function createEdge(
  sourceId: string,
  targetId: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): ResearchFlowEdge {
  return {
    id: uid("edge"),
    source: sourceId,
    target: targetId,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
    type: "labeled",
    data: { lineStyle: "dashed", comments: [] },
  };
}

export function slugifyProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "untitled";
  return (
    trimmed
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}
