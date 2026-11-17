import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, ConnectionMode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMapStore } from "../state/store";
import { nodeTypes } from "../components/nodes/NodeCard";
import { edgeTypes } from "../components/edges/LabeledEdge";
import { Toolbar, nextNodePosition } from "../components/Toolbar";
import { NodeDetailPanel } from "../components/NodeDetailPanel";
import { ZoomSlider } from "../components/ZoomSlider";
import { NodeContextMenu } from "../components/NodeContextMenu";
import { saveMap } from "../persistence/fsAccess";
import { downloadMap } from "../persistence/safariFallback";
import { idbSet } from "../persistence/idb";
import { upsertRecentMap } from "../persistence/recent";
import { slugifyProjectName, type NodeCategory, type ResearchFlowEdge, type ResearchFlowNode } from "../model/types";

const AUTOSAVE_DEBOUNCE_MS = 2000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

const SHORTCUT_KEYS: Record<string, NodeCategory> = { t: "task", i: "idea", q: "question", r: "result" };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function MapCanvasScreen({ onBackToList }: { onBackToList: () => void }) {
  const nodes = useMapStore((s) => s.nodes);
  const edges = useMapStore((s) => s.edges);
  const dirty = useMapStore((s) => s.dirty);
  const saveState = useMapStore((s) => s.saveState);
  const saveError = useMapStore((s) => s.saveError);
  const projectName = useMapStore((s) => s.projectName);
  const vaultHandle = useMapStore((s) => s.vaultHandle);
  const currentFileName = useMapStore((s) => s.currentFileName);
  const onNodesChange = useMapStore((s) => s.onNodesChange);
  const onEdgesChange = useMapStore((s) => s.onEdgesChange);
  const onConnect = useMapStore((s) => s.onConnect);
  const onReconnect = useMapStore((s) => s.onReconnect);
  const selectNode = useMapStore((s) => s.selectNode);
  const addNode = useMapStore((s) => s.addNode);
  const removeNode = useMapStore((s) => s.removeNode);
  const setSaveState = useMapStore((s) => s.setSaveState);
  const setCurrentFileName = useMapStore((s) => s.setCurrentFileName);

  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  const debounceRef = useRef<number | null>(null);

  const doSave = useCallback(async () => {
    const state = useMapStore.getState();
    const data = state.serialize();
    try {
      setSaveState("saving");
      if (state.vaultHandle) {
        const fileName = state.currentFileName ?? `${slugifyProjectName(state.projectName)}.json`;
        await saveMap(state.vaultHandle, fileName, data);
        if (!state.currentFileName) setCurrentFileName(fileName);
        await upsertRecentMap({
          id: `vault:${fileName}`,
          projectName: state.projectName,
          updatedAt: data.updatedAt,
          location: { type: "vault", fileName },
        });
        setSaveState("saved");
      } else {
        // Vault未接続（またはFile System Access非対応）: IndexedDBにバックアップし、
        // プロジェクト一覧の「このデバイスのみ」欄から開けるようにする
        const slug = slugifyProjectName(state.projectName);
        const backupKey = `mapBackup:${slug}`;
        await idbSet(backupKey, data);
        await upsertRecentMap({
          id: `local:${slug}`,
          projectName: state.projectName,
          updatedAt: data.updatedAt,
          location: { type: "local", backupKey },
        });
        setSaveState("saved");
      }
    } catch (e) {
      setSaveState("error", e instanceof Error ? e.message : String(e));
    }
  }, [setCurrentFileName, setSaveState]);

  const handleManualSave = useCallback(() => {
    void doSave();
    if (!vaultHandle) {
      // Vault未接続時は、バックアップに加えてファイルとしてもダウンロードできるようにする
      const data = useMapStore.getState().serialize();
      const fileName = currentFileName ?? `${slugifyProjectName(projectName)}.json`;
      downloadMap(data, fileName);
    }
  }, [currentFileName, doSave, projectName, vaultHandle]);

  useEffect(() => {
    if (!dirty) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void doSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, nodes, edges, doSave]);

  // 編集してから自動保存(2秒デバウンス)が走るまでの間にタブを閉じる／離れると、
  // その変更が保存されないまま消えてしまう。これを防ぐため:
  // ① タブが隠れる瞬間（他タブへ切替・最小化・実際に閉じる直前など）にデバウンスを待たず即座に保存する
  // ② それでも間に合わなかった場合に備え、未保存の変更があるときはブラウザ標準の離脱確認を出す
  useEffect(() => {
    const flushIfDirty = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (useMapStore.getState().dirty) void doSave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushIfDirty();
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushIfDirty();
      if (!useMapStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushIfDirty);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushIfDirty);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [doSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSave();
        return;
      }
      if (e.key === "Escape") {
        selectNode(null);
        return;
      }
      const cat = SHORTCUT_KEYS[e.key.toLowerCase()];
      if (cat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        addNode(cat, nextNodePosition(useMapStore.getState().nodes.length));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addNode, handleManualSave, selectNode]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: ResearchFlowNode) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
  }, [selectNode]);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: ResearchFlowNode) => {
      event.preventDefault();
      selectNode(node.id);
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [selectNode],
  );

  const handleDeleteFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    removeNode(contextMenu.nodeId);
    setContextMenu(null);
  }, [contextMenu, removeNode]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const saveLabel =
    saveState === "saving"
      ? "保存中…"
      : saveState === "error"
        ? `保存エラー${saveError ? `: ${saveError}` : ""}`
        : dirty
          ? "未保存の変更"
          : vaultHandle
            ? "保存済み"
            : "このデバイスのみ（未接続）";
  const dotColor = saveState === "error" ? "#DC2626" : dirty ? "#F59E0B" : "#22C55E";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#F7F6F3",
        fontFamily: "'Zen Kaku Gothic New', sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          height: 64,
          flexShrink: 0,
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontWeight: 900, fontSize: 16 }}>{projectName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, display: "inline-block" }} />
            {saveLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={onBackToList} style={navButtonStyle}>
            ← 一覧へ
          </button>
          <button type="button" onClick={handleManualSave} style={navButtonStyle}>
            保存
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <ReactFlow<ResearchFlowNode, ResearchFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onNodeContextMenu={handleNodeContextMenu}
            connectionMode={ConnectionMode.Loose}
            panOnScroll
            zoomOnScroll={false}
            zoomActivationKeyCode="Alt"
            zoomOnPinch
            fitView
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} color="#E3E1DC" />
            <Controls position="bottom-right" showInteractive={false} />
            <ZoomSlider minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
          </ReactFlow>
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <marker
                id="research-flow-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
              </marker>
              <marker
                id="research-flow-arrow-selected"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="11"
                markerHeight="11"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#2563EB" />
              </marker>
            </defs>
          </svg>
          <Toolbar />
        </div>
        <NodeDetailPanel />
      </div>
      {contextMenu && (
        <NodeContextMenu x={contextMenu.x} y={contextMenu.y} onDelete={handleDeleteFromContextMenu} />
      )}
    </div>
  );
}

const navButtonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 16px",
};
