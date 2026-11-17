import { useEffect, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore, type EdgeProps } from "@xyflow/react";
import { useMapStore } from "../../state/store";
import {
  DEFAULT_EDGE_LABEL_FONT_SIZE,
  MAX_EDGE_LABEL_FONT_SIZE,
  MIN_EDGE_LABEL_FONT_SIZE,
  type EdgeComment,
  type ResearchFlowEdge,
} from "../../model/types";

const FONT_SIZE_STEP = 1.5;
/** ドラッグ量(px) → 文字サイズ(pt) の変換係数。4pxのドラッグでほぼ1pt変わる */
const DRAG_PX_PER_PT = 4;

/**
 * 矢印の中央ラベルとは別に、矢印上の好きな位置に置ける付箋コメント。
 * 位置は「始点→終点の直線上の位置(t)＋垂線方向のオフセット(px)」で保持する。
 * ノードカードのFreeCommentBubbleと同じ操作感（ドラッグで移動／ダブルクリックで編集／空にすると自動削除）。
 */
function EdgeCommentBubble({
  comment,
  edgeId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  zoom,
}: {
  comment: EdgeComment;
  edgeId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  zoom: number;
}) {
  const updateEdgeCommentText = useMapStore((s) => s.updateEdgeCommentText);
  const moveEdgeComment = useMapStore((s) => s.moveEdgeComment);
  const removeEdgeComment = useMapStore((s) => s.removeEdgeComment);
  const [editing, setEditing] = useState(comment.text === "");
  const [draft, setDraft] = useState(comment.text);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startT: number; startOffset: number } | null>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const lenSq = dx * dx + dy * dy || 1;
  const len = Math.sqrt(lenSq);
  const nx = -dy / len;
  const ny = dx / len;
  const baseX = sourceX + comment.t * dx;
  const baseY = sourceY + comment.t * dy;
  const posX = baseX + nx * comment.offset;
  const posY = baseY + ny * comment.offset;

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) removeEdgeComment(edgeId, comment.id);
    else updateEdgeCommentText(edgeId, comment.id, trimmed);
    setEditing(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startT: comment.t, startOffset: comment.offset };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    if (!ds) return;
    // pointer移動量はスクリーンpxなので、現在のズーム倍率で割ってフロー座標系のpxに変換する
    const dxFlow = (e.clientX - ds.startX) / zoom;
    const dyFlow = (e.clientY - ds.startY) / zoom;
    const dt = (dxFlow * dx + dyFlow * dy) / lenSq;
    const doffset = dxFlow * nx + dyFlow * ny;
    moveEdgeComment(edgeId, comment.id, ds.startT + dt, ds.startOffset + doffset);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      className="nodrag nopan"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(comment.text);
        setEditing(true);
      }}
      title={editing ? undefined : "ドラッグで移動／ダブルクリックで編集"}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${posX}px, ${posY}px)`,
        maxWidth: 150,
        width: "max-content",
        background: "#FEF9C3",
        border: "1px solid #FDE68A",
        borderRadius: 6,
        padding: "4px 7px",
        fontSize: 10.5,
        lineHeight: 1.4,
        color: "#78350F",
        boxShadow: "0 1px 3px rgba(0,0,0,.15)",
        cursor: dragging ? "grabbing" : "grab",
        pointerEvents: "all",
        zIndex: 6,
        whiteSpace: editing ? "normal" : "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="nodrag nopan"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(comment.text);
              setEditing(false);
            }
          }}
          rows={2}
          placeholder="コメント"
          style={{
            fontSize: 10.5,
            fontFamily: "inherit",
            color: "inherit",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "both",
            width: 120,
            padding: 0,
          }}
        />
      ) : (
        comment.text
      )}
      {!editing && (
        <button
          type="button"
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            removeEdgeComment(edgeId, comment.id);
          }}
          title="コメントを削除"
          style={{
            position: "absolute",
            top: -7,
            right: -7,
            width: 15,
            height: 15,
            borderRadius: 999,
            border: "1px solid #FDE68A",
            background: "#FFFFFF",
            color: "#92400E",
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            padding: 0,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function sizeButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    lineHeight: 1,
    fontWeight: 700,
    color: disabled ? "#D1D5DB" : "#6B7280",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 4,
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  data,
}: EdgeProps<ResearchFlowEdge>) {
  const updateEdgeLabel = useMapStore((s) => s.updateEdgeLabel);
  const adjustEdgeLabelFontSize = useMapStore((s) => s.adjustEdgeLabelFontSize);
  const setEdgeLabelFontSize = useMapStore((s) => s.setEdgeLabelFontSize);
  const addEdgeComment = useMapStore((s) => s.addEdgeComment);
  const zoom = useStore((s) => s.transform[2]);
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [draft, setDraft] = useState(typeof label === "string" ? label : "");
  const resizeStart = useRef<{ x: number; fontSize: number } | null>(null);

  const fontSize = data?.labelFontSize ?? DEFAULT_EDGE_LABEL_FONT_SIZE;

  // ドラッグで文字サイズを連続的に変更（ノードカードのリサイズと同じ「マウスで自由な大きさに」操作）
  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: PointerEvent) => {
      if (!resizeStart.current) return;
      const deltaPt = (e.clientX - resizeStart.current.x) / DRAG_PX_PER_PT;
      const next = Math.min(
        MAX_EDGE_LABEL_FONT_SIZE,
        Math.max(MIN_EDGE_LABEL_FONT_SIZE, resizeStart.current.fontSize + deltaPt),
      );
      setEdgeLabelFontSize(id, next);
    };
    const handleUp = () => {
      setResizing(false);
      resizeStart.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [resizing, id, setEdgeLabelFontSize]);

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = { x: e.clientX, fontSize };
    setResizing(true);
  };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const commit = () => {
    updateEdgeLabel(id, draft.trim());
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(typeof label === "string" ? label : "");
    setEditing(true);
  };

  const changeFontSize = (delta: number) => {
    adjustEdgeLabelFontSize(id, delta);
  };

  const showSizeControls = editing || resizing || (hovered && !!label);

  // 矢印の線（ラベルのある中央以外の場所）をダブルクリックしたら、その位置に自由コメントを追加する。
  // クリック位置はスクリーン座標なので、path自身のCTM（座標変換行列）の逆行列で
  // sourceX/targetXと同じ「フロー内のSVGローカル座標」に変換してから、始点→終点の直線上のt・垂線オフセットへ分解する。
  const handleEdgeDoubleClick = (e: React.MouseEvent<SVGPathElement>) => {
    e.stopPropagation();
    const pathEl = e.currentTarget;
    const svg = pathEl.ownerSVGElement;
    const ctm = pathEl.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const lenSq = dx * dx + dy * dy || 1;
    const len = Math.sqrt(lenSq);
    const nx = -dy / len;
    const ny = dx / len;
    let t = ((local.x - sourceX) * dx + (local.y - sourceY) * dy) / lenSq;
    t = Math.min(0.95, Math.max(0.05, t));
    const baseX = sourceX + t * dx;
    const baseY = sourceY + t * dy;
    const offset = (local.x - baseX) * nx + (local.y - baseY) * ny;
    addEdgeComment(id, t, offset);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={selected ? "url(#research-flow-arrow-selected)" : "url(#research-flow-arrow)"}
        style={{
          stroke: selected ? "#2563EB" : "#475569",
          strokeWidth: selected ? 3 : 2.5,
          strokeDasharray: "5 4",
        }}
      />
      {/* クリック判定を広げるための透明な太い矢印線。ダブルクリックで矢印上に自由コメントを追加できる */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="nopan"
        style={{ cursor: "pointer" }}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {(data?.comments ?? []).map((comment) => (
        <EdgeLabelRenderer key={comment.id}>
          <EdgeCommentBubble
            comment={comment}
            edgeId={id}
            sourceX={sourceX}
            sourceY={sourceY}
            targetX={targetX}
            targetY={targetY}
            zoom={zoom}
          />
        </EdgeLabelRenderer>
      ))}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          title="ダブルクリックでラベルを編集"
        >
          {showSizeControls && (
            <button
              type="button"
              aria-label="文字を小さく"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(-FONT_SIZE_STEP);
              }}
              disabled={fontSize <= MIN_EDGE_LABEL_FONT_SIZE}
              style={sizeButtonStyle(fontSize <= MIN_EDGE_LABEL_FONT_SIZE)}
            >
              −
            </button>
          )}

          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              style={{
                fontSize,
                fontWeight: 700,
                color: "#374151",
                background: "#FFFFFF",
                border: "1px solid #2563EB",
                borderRadius: 6,
                padding: "2px 6px",
                width: 110,
              }}
            />
          ) : label ? (
            <span
              style={{
                fontSize,
                fontWeight: 700,
                color: "#6B7280",
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: 9,
                padding: "2px 8px",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              {label}
            </span>
          ) : (
            <span style={{ display: "inline-block", width: 24, height: 14 }} />
          )}

          {showSizeControls && (
            <button
              type="button"
              aria-label="文字を大きく"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(FONT_SIZE_STEP);
              }}
              disabled={fontSize >= MAX_EDGE_LABEL_FONT_SIZE}
              style={sizeButtonStyle(fontSize >= MAX_EDGE_LABEL_FONT_SIZE)}
            >
              ＋
            </button>
          )}

          {showSizeControls && (
            <div
              onPointerDown={startResize}
              title="ドラッグで文字の大きさを自由に変更"
              style={{
                width: 14,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "ew-resize",
                color: resizing ? "#2563EB" : "#9CA3AF",
                touchAction: "none",
              }}
            >
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <circle cx="2" cy="2" r="1.3" fill="currentColor" />
                <circle cx="6" cy="2" r="1.3" fill="currentColor" />
                <circle cx="2" cy="7" r="1.3" fill="currentColor" />
                <circle cx="6" cy="7" r="1.3" fill="currentColor" />
                <circle cx="2" cy="12" r="1.3" fill="currentColor" />
                <circle cx="6" cy="12" r="1.3" fill="currentColor" />
              </svg>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { labeled: LabeledEdge };
