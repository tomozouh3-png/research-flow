import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import {
  DEFAULT_EDGE_LABEL_FONT_SIZE,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  MAX_EDGE_LABEL_FONT_SIZE,
  MAX_FONT_SCALE,
  MIN_EDGE_LABEL_FONT_SIZE,
  MIN_FONT_SCALE,
  SCHEMA_VERSION,
  createEdge,
  createNode,
  nowIso,
  uid,
  type EdgeComment,
  type FreeComment,
  type NodeAttachment,
  type NodeCategory,
  type ObsidianLink,
  type ResearchFlowEdge,
  type ResearchFlowNode,
  type ResearchMapFile,
  type TaskStatus,
} from "../model/types";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface MapStoreState {
  // --- projectSlice ---
  projectName: string;
  devFolderPath?: string;
  vaultName: string;
  createdAt: string;
  dirty: boolean;

  // --- mapSlice ---
  nodes: ResearchFlowNode[];
  edges: ResearchFlowEdge[];

  // --- uiSlice ---
  selectedNodeId: string | null;

  // --- viewportSlice ---
  viewport: Viewport;

  // --- persistSlice ---
  vaultHandle: FileSystemDirectoryHandle | null;
  currentFileName: string | null;
  saveState: SaveState;
  saveError: string | null;

  // actions
  loadMap: (file: ResearchMapFile, fileName: string | null) => void;
  resetToEmpty: (projectName: string) => void;

  onNodesChange: (changes: NodeChange<ResearchFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ResearchFlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  /** 既存の矢印の端をドラッグして、繋ぎ先ノードを変更する */
  onReconnect: (oldEdge: ResearchFlowEdge, newConnection: Connection) => void;

  addNode: (category: NodeCategory, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<ResearchFlowNode["data"]>) => void;
  removeNode: (id: string) => void;
  /** 本文などの内容量に合わせてカードの実測高さへ追従させる（自動レイアウトのみ。編集内容ではないので updatedAt は更新しない） */
  setNodeHeight: (id: string, height: number) => void;
  /** 角（4隅）ハンドルで枠全体を拡大・縮小した時だけ呼ぶ、文字サイズ倍率の更新（自動レイアウトのみ） */
  setNodeFontScale: (id: string, scale: number) => void;
  /** ユーザーが手動でリサイズ／文字サイズ調整した瞬間に一度だけ false にする。保存されるのでリロード後も維持される */
  setNodeAutoFit: (id: string, autoFit: boolean) => void;

  addTag: (nodeId: string, tag: string) => void;
  removeTag: (nodeId: string, tag: string) => void;
  addObsidianLink: (nodeId: string, link: Omit<ObsidianLink, "id">) => void;
  removeObsidianLink: (nodeId: string, linkId: string) => void;
  setNodeStatus: (nodeId: string, status: TaskStatus) => void;

  /** 添付ファイルのメタ情報だけをストアへ追加する（実ファイルの読み書きは呼び出し側がpersistence層で行う） */
  addAttachment: (nodeId: string, attachment: NodeAttachment) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;

  /** カード内の好きな位置（%座標）に自由コメントを追加する */
  addComment: (nodeId: string, x: number, y: number) => string;
  updateCommentText: (nodeId: string, commentId: string, text: string) => void;
  moveComment: (nodeId: string, commentId: string, x: number, y: number) => void;
  removeComment: (nodeId: string, commentId: string) => void;

  updateEdgeLabel: (id: string, label: string) => void;
  setEdgeLabelFontSize: (id: string, fontSize: number) => void;
  adjustEdgeLabelFontSize: (id: string, delta: number) => void;
  removeEdge: (id: string) => void;

  /** 矢印上の好きな位置（t: 0〜1, offset: 垂線方向px）に自由コメントを追加する */
  addEdgeComment: (edgeId: string, t: number, offset: number) => string;
  updateEdgeCommentText: (edgeId: string, commentId: string, text: string) => void;
  moveEdgeComment: (edgeId: string, commentId: string, t: number, offset: number) => void;
  removeEdgeComment: (edgeId: string, commentId: string) => void;

  selectNode: (id: string | null) => void;
  setViewport: (vp: Viewport) => void;
  renameProject: (name: string) => void;

  setVaultHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setCurrentFileName: (name: string | null) => void;
  setSaveState: (state: SaveState, error?: string | null) => void;
  markClean: () => void;

  serialize: () => ResearchMapFile;
}

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

export const useMapStore = create<MapStoreState>()(
  immer((set, get) => ({
    projectName: "無題のプロジェクト",
    devFolderPath: undefined,
    vaultName: "obsidian",
    createdAt: nowIso(),
    dirty: false,

    nodes: [],
    edges: [],

    selectedNodeId: null,
    viewport: defaultViewport,

    vaultHandle: null,
    currentFileName: null,
    saveState: "idle",
    saveError: null,

    loadMap: (file, fileName) =>
      set((s) => {
        s.projectName = file.projectName;
        s.devFolderPath = file.devFolderPath;
        s.vaultName = file.vaultName;
        s.createdAt = file.createdAt;
        // width/height を持たないノード（古い保存データ等）は、タイミングによって
        // React Flow の自動計測が極小サイズに失敗することがあるため既定値を補う
        s.nodes = file.nodes.map((n) => ({
          ...n,
          width: n.width ?? DEFAULT_NODE_WIDTH,
          height: n.height ?? DEFAULT_NODE_HEIGHT,
        })) as typeof s.nodes;
        s.edges = file.edges;
        s.viewport = file.viewport ?? defaultViewport;
        s.selectedNodeId = null;
        s.currentFileName = fileName;
        s.dirty = false;
        s.saveState = "idle";
        s.saveError = null;
      }),

    resetToEmpty: (projectName) =>
      set((s) => {
        s.projectName = projectName;
        s.devFolderPath = undefined;
        s.vaultName = s.vaultName || "obsidian";
        s.createdAt = nowIso();
        s.nodes = [];
        s.edges = [];
        s.viewport = defaultViewport;
        s.selectedNodeId = null;
        s.currentFileName = null;
        s.dirty = false;
        s.saveState = "idle";
        s.saveError = null;
      }),

    onNodesChange: (changes) =>
      set((s) => {
        s.nodes = applyNodeChanges(changes, s.nodes as ResearchFlowNode[]) as typeof s.nodes;
        // "dimensions" は自動計測でも飛んでくるため、実際にリサイズ操作されたときだけ dirty にする
        const touchesData = changes.some((c) => {
          if (c.type === "select") return false;
          if (c.type === "dimensions") return c.resizing === true;
          return true;
        });
        if (touchesData) s.dirty = true;
      }),

    onEdgesChange: (changes) =>
      set((s) => {
        s.edges = applyEdgeChanges(changes, s.edges as ResearchFlowEdge[]) as typeof s.edges;
        const touchesData = changes.some((c) => c.type !== "select");
        if (touchesData) s.dirty = true;
      }),

    onConnect: (connection) =>
      set((s) => {
        if (!connection.source || !connection.target) return;
        const edge = createEdge(connection.source, connection.target, connection.sourceHandle, connection.targetHandle);
        s.edges.push(edge);
        s.dirty = true;
      }),

    onReconnect: (oldEdge, newConnection) =>
      set((s) => {
        s.edges = reconnectEdge(oldEdge, newConnection, s.edges as ResearchFlowEdge[]) as typeof s.edges;
        s.dirty = true;
      }),

    addNode: (category, position) =>
      set((s) => {
        const node = createNode(category, position);
        s.nodes.push(node);
        s.selectedNodeId = node.id;
        s.nodes = s.nodes.map((n) => ({ ...n, selected: n.id === node.id })) as typeof s.nodes;
        s.dirty = true;
      }),

    updateNodeData: (id, patch) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        Object.assign(node.data, patch, { updatedAt: nowIso() });
        s.dirty = true;
      }),

    removeNode: (id) =>
      set((s) => {
        s.nodes = s.nodes.filter((n) => n.id !== id) as typeof s.nodes;
        s.edges = s.edges.filter((e) => e.source !== id && e.target !== id) as typeof s.edges;
        if (s.selectedNodeId === id) s.selectedNodeId = null;
        s.dirty = true;
      }),

    setNodeHeight: (id, height) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node || node.height === height) return;
        node.height = height;
        s.dirty = true;
      }),

    setNodeFontScale: (id, scale) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale));
        if (node.data.fontScale === clamped) return;
        node.data.fontScale = clamped;
        s.dirty = true;
      }),

    setNodeAutoFit: (id, autoFit) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node || node.data.autoFit === autoFit) return;
        node.data.autoFit = autoFit;
        s.dirty = true;
      }),

    addTag: (nodeId, tag) =>
      set((s) => {
        const trimmed = tag.trim();
        if (!trimmed) return;
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node || node.data.tags.includes(trimmed)) return;
        node.data.tags.push(trimmed);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    removeTag: (nodeId, tag) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.data.tags = node.data.tags.filter((t) => t !== tag);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    addObsidianLink: (nodeId, link) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node || !link.filePath.trim()) return;
        node.data.obsidianLinks.push({ id: `link_${Date.now().toString(36)}`, ...link });
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    removeObsidianLink: (nodeId, linkId) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.data.obsidianLinks = node.data.obsidianLinks.filter((l) => l.id !== linkId);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    setNodeStatus: (nodeId, status) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.data.status = status;
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    addAttachment: (nodeId, attachment) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        (node.data.attachments ??= []).push(attachment);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    removeAttachment: (nodeId, attachmentId) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node || !node.data.attachments) return;
        node.data.attachments = node.data.attachments.filter((a) => a.id !== attachmentId);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    addComment: (nodeId, x, y) => {
      const commentId = uid("comment");
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const comment: FreeComment = { id: commentId, text: "", x, y };
        (node.data.comments ??= []).push(comment);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      });
      return commentId;
    },

    updateCommentText: (nodeId, commentId, text) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        const comment = node?.data.comments?.find((c) => c.id === commentId);
        if (!node || !comment) return;
        comment.text = text;
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    moveComment: (nodeId, commentId, x, y) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        const comment = node?.data.comments?.find((c) => c.id === commentId);
        if (!node || !comment) return;
        comment.x = Math.min(100, Math.max(0, x));
        comment.y = Math.min(100, Math.max(0, y));
        s.dirty = true;
      }),

    removeComment: (nodeId, commentId) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node || !node.data.comments) return;
        node.data.comments = node.data.comments.filter((c) => c.id !== commentId);
        node.data.updatedAt = nowIso();
        s.dirty = true;
      }),

    updateEdgeLabel: (id, label) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === id);
        if (!edge) return;
        edge.label = label;
        s.dirty = true;
      }),

    setEdgeLabelFontSize: (id, fontSize) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === id);
        if (!edge || !edge.data) return;
        edge.data.labelFontSize = fontSize;
        s.dirty = true;
      }),

    adjustEdgeLabelFontSize: (id, delta) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === id);
        if (!edge || !edge.data) return;
        // 連打時も必ず「今のストア上の値」を基準にする（コンポーネント側の古い値を使わない）
        const current = edge.data.labelFontSize ?? DEFAULT_EDGE_LABEL_FONT_SIZE;
        edge.data.labelFontSize = Math.min(
          MAX_EDGE_LABEL_FONT_SIZE,
          Math.max(MIN_EDGE_LABEL_FONT_SIZE, current + delta),
        );
        s.dirty = true;
      }),

    removeEdge: (id) =>
      set((s) => {
        s.edges = s.edges.filter((e) => e.id !== id) as typeof s.edges;
        s.dirty = true;
      }),

    addEdgeComment: (edgeId, t, offset) => {
      const commentId = uid("comment");
      set((s) => {
        const edge = s.edges.find((e) => e.id === edgeId);
        if (!edge) return;
        const comment: EdgeComment = { id: commentId, text: "", t, offset };
        (edge.data ??= { lineStyle: "dashed" }).comments ??= [];
        edge.data.comments!.push(comment);
        s.dirty = true;
      });
      return commentId;
    },

    updateEdgeCommentText: (edgeId, commentId, text) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === edgeId);
        const comment = edge?.data?.comments?.find((c) => c.id === commentId);
        if (!edge || !comment) return;
        comment.text = text;
        s.dirty = true;
      }),

    moveEdgeComment: (edgeId, commentId, t, offset) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === edgeId);
        const comment = edge?.data?.comments?.find((c) => c.id === commentId);
        if (!edge || !comment) return;
        comment.t = Math.min(0.95, Math.max(0.05, t));
        comment.offset = offset;
        s.dirty = true;
      }),

    removeEdgeComment: (edgeId, commentId) =>
      set((s) => {
        const edge = s.edges.find((e) => e.id === edgeId);
        if (!edge || !edge.data?.comments) return;
        edge.data.comments = edge.data.comments.filter((c) => c.id !== commentId);
        s.dirty = true;
      }),

    selectNode: (id) =>
      set((s) => {
        s.selectedNodeId = id;
      }),

    setViewport: (vp) =>
      set((s) => {
        s.viewport = vp;
      }),

    renameProject: (name) =>
      set((s) => {
        s.projectName = name || s.projectName;
        s.dirty = true;
      }),

    setVaultHandle: (handle) =>
      set((s) => {
        s.vaultHandle = handle;
      }),

    setCurrentFileName: (name) =>
      set((s) => {
        s.currentFileName = name;
      }),

    setSaveState: (state, error) =>
      set((s) => {
        s.saveState = state;
        s.saveError = error ?? null;
        if (state === "saved") s.dirty = false;
      }),

    markClean: () =>
      set((s) => {
        s.dirty = false;
      }),

    serialize: () => {
      const s = get();
      return {
        schemaVersion: SCHEMA_VERSION,
        appVersion: "0.1.0",
        projectName: s.projectName,
        devFolderPath: s.devFolderPath,
        vaultName: s.vaultName,
        createdAt: s.createdAt,
        updatedAt: nowIso(),
        nodes: s.nodes,
        edges: s.edges,
        viewport: s.viewport,
      };
    },
  })),
);
