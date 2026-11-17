import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import {
  CATEGORY_PRESET,
  DEFAULT_FONT_SCALE,
  formatShortDate,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  STATUS_PRESET,
  type FreeComment,
  type ResearchFlowNode,
  type TaskStatus,
} from "../../model/types";
import { useMapStore } from "../../state/store";
import { addAttachmentsToNode } from "../../services/attachmentActions";

// カード上のステータスチップをクリックした時の循環順。「保留」はここに含めず詳細パネルからのみ設定する
const QUICK_STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  on_hold: "todo",
};

/**
 * カード内の好きな位置に置く付箋コメント。ドラッグで自由に動かせ、ダブルクリックで編集、
 * 本文を空にすると自動的に削除される。position:absoluteなので、カードの高さ自動フィット計算
 * （フローに参加しない）には影響しない。
 */
function FreeCommentBubble({ comment, nodeId }: { comment: FreeComment; nodeId: string }) {
  const updateCommentText = useMapStore((s) => s.updateCommentText);
  const moveComment = useMapStore((s) => s.moveComment);
  const removeComment = useMapStore((s) => s.removeComment);
  const [editing, setEditing] = useState(comment.text === "");
  const [draft, setDraft] = useState(comment.text);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; cardW: number; cardH: number } | null>(
    null,
  );

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) removeComment(nodeId, comment.id);
    else updateCommentText(nodeId, comment.id, trimmed);
    setEditing(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    e.stopPropagation();
    const cardEl = e.currentTarget.parentElement as HTMLElement | null;
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: comment.x, originY: comment.y, cardW: rect.width, cardH: rect.height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragRef.current;
    if (!ds) return;
    const dxPct = ((e.clientX - ds.startX) / ds.cardW) * 100;
    const dyPct = ((e.clientY - ds.startY) / ds.cardH) * 100;
    moveComment(nodeId, comment.id, ds.originX + dxPct, ds.originY + dyPct);
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
        left: `${comment.x}%`,
        top: `${comment.y}%`,
        // width:auto のままだと、position:absolute + overflowWrap:anywhere の組み合わせで
        // ブラウザの shrink-to-fit 計算が崩れ、短い文字列でも1文字ずつ縦に折り返される不具合が起きるため、
        // max-content を明示して「内容に合わせた幅（maxWidthが上限）」に固定する
        width: "max-content",
        maxWidth: 150,
        background: "#FEF9C3",
        border: "1px solid #FDE68A",
        borderRadius: 6,
        padding: "4px 7px",
        fontSize: 10.5,
        lineHeight: 1.4,
        color: "#78350F",
        boxShadow: "0 1px 3px rgba(0,0,0,.15)",
        cursor: dragging ? "grabbing" : "grab",
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
            removeComment(nodeId, comment.id);
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

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: "#9CA3AF",
  border: "2px solid #FFFFFF",
};

const FONT_SCALE_STEP = 0.1;

const fontScaleButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  background: "#FFFFFF",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
};

type EditingField = "title" | "body" | null;

/**
 * タスク／アイデア／疑問・仮説／実験結果・知見の4種で共有するカード。
 * 見た目の分岐は data.category / data.status だけで完結するため、
 * ほぼ同一な4ファイルに分けず1コンポーネントを4つの nodeTypes キーへ登録する（App/MapCanvasScreen 参照）。
 *
 * タイトル／本文はダブルクリックでカード上のままインライン編集できる
 * （サイドパネルを開かなくても書き込みが完結するように）。
 */
export function NodeCard({ id, data, selected }: NodeProps<ResearchFlowNode>) {
  const preset = CATEGORY_PRESET[data.category];
  const statusPreset = data.status ? STATUS_PRESET[data.status] : null;
  const updateNodeData = useMapStore((s) => s.updateNodeData);
  const setNodeHeight = useMapStore((s) => s.setNodeHeight);
  const setNodeFontScale = useMapStore((s) => s.setNodeFontScale);
  const setNodeAutoFit = useMapStore((s) => s.setNodeAutoFit);
  const setNodeStatus = useMapStore((s) => s.setNodeStatus);
  const addComment = useMapStore((s) => s.addComment);
  const isUnstartedTask = data.category === "task" && (data.status ?? "todo") === "todo";
  const fontScale = data.fontScale ?? DEFAULT_FONT_SCALE;
  const comments = data.comments ?? [];
  const attachments = data.attachments ?? [];

  const [editingField, setEditingField] = useState<EditingField>(null);
  const [draft, setDraft] = useState("");
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // ユーザーが一度でも手動リサイズしたノードは、以降「そのユーザー指定の枠サイズ」を尊重し、
  // 中身に合わせて枠を動かすのではなく、枠に合わせて文字サイズを最大化する側にまわる。
  // まだ触っていないノードは「枠=中身ぴったり、文字は既定サイズ」がデフォルト。
  // ※ data.autoFit（保存対象）で初期化する。一時的なrefだけで管理すると、マップを開き直した瞬間に
  //   「まだ誰も触っていない」扱いに戻り、手動で設定したサイズが自動フィットで上書き・消失してしまうため。
  const autoFitRef = useRef(data.autoFit !== false);
  // ドラッグでリサイズしている最中は true。この間は重い再計算（クローン測定）を止める
  const isResizingRef = useRef(false);
  const [minHeight, setMinHeight] = useState(MIN_NODE_HEIGHT);
  const fontScaleRef = useRef(fontScale);
  fontScaleRef.current = fontScale;

  // 現在のカードの複製を作り、指定した文字サイズ倍率(scale)で描画したときの
  // 自然な高さ（スクロールなしで全文が収まる高さ）を測る。
  // 表示中のカード自体（cardRef）はユーザーが自由な高さに手動リサイズできる必要があるため、
  // 測定はそれとは別に「高さ制約を外した複製」を一時的に生成して行う（＝表示中のサイズに左右されない）。
  const measureHeightAtScale = (scale: number): number | null => {
    const el = cardRef.current;
    if (!el) return null;
    const clone = el.cloneNode(true) as HTMLDivElement;
    clone.style.position = "fixed";
    clone.style.top = "-99999px";
    clone.style.left = "-99999px";
    clone.style.visibility = "hidden";
    clone.style.pointerEvents = "none";
    clone.style.height = "auto";
    clone.style.minHeight = "0px";
    clone.style.width = `${el.offsetWidth}px`;
    // クローンは今のfontScaleで描画された状態のfontSizeが焼き込まれているので、
    // 「今のfontScaleに対する倍率」を掛け直して、指定scaleでの見た目を再現する
    const factor = fontScaleRef.current > 0 ? scale / fontScaleRef.current : scale;
    const all: HTMLElement[] = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
    for (const node of all) {
      if (node.style && node.style.fontSize) {
        const px = Number.parseFloat(node.style.fontSize);
        if (!Number.isNaN(px)) node.style.fontSize = `${px * factor}px`;
      }
    }
    document.body.appendChild(clone);
    const h = Math.ceil(clone.offsetHeight);
    document.body.removeChild(clone);
    return h;
  };

  // 「高さ targetHeight にちょうど収まる、できるだけ大きい文字サイズ倍率」を二分探索で求める。
  const findBestFitScale = (targetHeight: number): number => {
    const atMin = measureHeightAtScale(MIN_FONT_SCALE);
    if (atMin === null) return fontScaleRef.current;
    if (atMin > targetHeight) return MIN_FONT_SCALE; // 最小サイズでも収まらない
    const atMax = measureHeightAtScale(MAX_FONT_SCALE);
    if (atMax !== null && atMax <= targetHeight) return MAX_FONT_SCALE; // 最大サイズでも収まりきる
    let lo = MIN_FONT_SCALE;
    let hi = MAX_FONT_SCALE;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const h = measureHeightAtScale(mid);
      if (h === null) break;
      if (h <= targetHeight) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  // 枠（幅・高さ）や中身が変わるたびに呼ぶ本体。
  // ・触っていないノード（autoFit）: 文字サイズは既定のまま、枠の高さだけを中身にぴったり合わせる
  // ・手動リサイズ済みのノード: 今の枠の高さに対して「できる限り大きく、はみ出さない」文字サイズを求める。
  //   最小サイズでも収まらない場合だけ、安全策として枠を伸ばす。
  const fitToBox = () => {
    const el = cardRef.current;
    if (!el) return;
    if (autoFitRef.current) {
      const natural = measureHeightAtScale(DEFAULT_FONT_SCALE);
      if (natural === null) return;
      setMinHeight(Math.max(MIN_NODE_HEIGHT, natural));
      if (fontScaleRef.current !== DEFAULT_FONT_SCALE) setNodeFontScale(id, DEFAULT_FONT_SCALE);
      const current = useMapStore.getState().nodes.find((n) => n.id === id)?.height ?? 0;
      if (Math.abs(current - natural) > 1) setNodeHeight(id, natural);
      return;
    }
    const atMin = measureHeightAtScale(MIN_FONT_SCALE);
    if (atMin === null) return;
    setMinHeight(Math.max(MIN_NODE_HEIGHT, atMin));
    const boxHeight = useMapStore.getState().nodes.find((n) => n.id === id)?.height ?? el.offsetHeight;
    if (atMin > boxHeight) {
      // 最小サイズでも収まらない＝枠が小さすぎる。文字は最小のまま、枠を伸ばす安全策
      setNodeFontScale(id, MIN_FONT_SCALE);
      setNodeHeight(id, atMin);
      return;
    }
    const best = findBestFitScale(boxHeight);
    if (Math.abs(best - fontScaleRef.current) > 0.01) setNodeFontScale(id, best);
  };

  // ① サイズ（幅・高さどちらでも）が変わるたびに文字サイズ／高さをフィットさせる。ドラッグ中は止める。
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const sync = () => {
      if (isResizingRef.current) return;
      fitToBox();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ② タイトル・本文・タグ・リンクなど「中身」が変わった時も同様にフィットし直す。
  useEffect(() => {
    fitToBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data.title, data.body, data.tags, data.obsidianLinks, data.attachments, data.date, data.status]);

  useEffect(() => {
    if (editingField === "title") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (editingField === "body") {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editingField]);

  // 選択中カード右上の「A－／A＋」ボタン用。自動フィットに任せず、その場で直接文字サイズを変える。
  // 大きくして枠からはみ出す場合は、はみ出さない高さまで枠も一緒に伸ばす（常に全文が収まる原則を維持）。
  const adjustFontScale = (delta: number) => {
    if (autoFitRef.current) {
      autoFitRef.current = false;
      setNodeAutoFit(id, false);
    }
    const next = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, fontScaleRef.current + delta));
    if (Math.abs(next - fontScaleRef.current) < 0.001) return;
    setNodeFontScale(id, next);
    const needed = measureHeightAtScale(next);
    if (needed === null) return;
    setMinHeight(Math.max(MIN_NODE_HEIGHT, needed));
    const current = useMapStore.getState().nodes.find((n) => n.id === id)?.height ?? 0;
    if (needed > current) setNodeHeight(id, needed);
  };

  const startEdit = (field: Exclude<EditingField, null>, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(field === "title" ? data.title : data.body);
    setEditingField(field);
  };

  const commit = () => {
    if (editingField === "title") {
      updateNodeData(id, { title: draft.trim() || data.title });
    } else if (editingField === "body") {
      updateNodeData(id, { body: draft });
    }
    setEditingField(null);
  };

  const cancel = () => setEditingField(null);

  return (
    <div
      ref={cardRef}
      onDoubleClick={(e) => {
        // カード自身の余白（タイトルや本文など子要素の上ではない場所）をダブルクリックした時だけ、
        // その位置に自由コメントを追加する。子要素側は各自 stopPropagation するか、
        // ここでは e.target === e.currentTarget で見分ける
        if (e.target !== e.currentTarget) return;
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        addComment(id, Math.min(96, Math.max(0, x)), Math.min(96, Math.max(0, y)));
      }}
      // OSのFinder等からファイルをドラッグしてきてカードに落とすと、そのノードへ添付できる。
      // React Flow自身のノード移動はpointerイベントベースで、ここで使うHTML5ネイティブDnD(drag/drop)とは
      // 別系統のため、互いに干渉しない。dataTransfer.types に "Files" が含まれる時だけ受け付ける
      // （ノード同士を繋ぐ矢印ドラッグ等、ファイル以外のドラッグまで誤反応しないように絞る）
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setAttachmentDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setAttachmentDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setAttachmentDragOver(false);
        void addAttachmentsToNode(id, e.dataTransfer.files);
      }}
      style={{
        position: "relative",
        width: "100%",
        // 高さはノードの実サイズ（node.height）にそのまま追従する。
        // 触っていない間は上のuseLayoutEffectが中身ぴったりに保ち、
        // ユーザーが手動でドラッグした後は「そのユーザー指定の高さ」がそのまま反映される
        // （＝縦横比を自由に変えられる。全文が収まらなくなった時だけ安全策として自動で伸びる）
        height: "100%",
        boxSizing: "border-box",
        background: attachmentDragOver ? "#EFF6FF" : "#FFFFFF",
        // 未着手のタスクだけ枠を太く・警告色にして目立たせる（「次にやるべきこと」が一目でわかるように）。
        // 4カテゴリ(青・オレンジ・紫・緑)のどれとも被らない赤系にする
        border: attachmentDragOver
          ? "2.5px dashed #2563EB"
          : isUnstartedTask
            ? "3px solid #DC2626"
            : `2px solid ${preset.color}`,
        borderRadius: 16,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: selected
          ? "0 0 0 2px #2563EB, 0 8px 20px rgba(37,99,235,.18)"
          : isUnstartedTask
            ? "0 0 0 3px rgba(220,38,38,.15), 0 2px 6px rgba(220,38,38,.15)"
            : "0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.06)",
        cursor: "grab",
      }}
    >
      {attachmentDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 14,
            background: "rgba(37,99,235,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#2563EB",
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          ここにドロップして添付
        </div>
      )}
      {/* 選択中だけ表示する手動の文字サイズ調整ボタン。自動フィットとは別に、その場で直接大小を変えられる。
          大きくして今の枠に入りきらなくなったら、収まる高さまで枠も一緒に自動で伸ばす */}
      {selected && (
        <div
          className="nodrag nopan"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -34,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 7,
            padding: 2,
            boxShadow: "0 2px 6px rgba(0,0,0,.1)",
            zIndex: 10,
          }}
        >
          <button
            type="button"
            title="文字を小さく"
            aria-label="文字を小さく"
            onClick={(e) => {
              e.stopPropagation();
              adjustFontScale(-FONT_SCALE_STEP);
            }}
            disabled={fontScale <= MIN_FONT_SCALE}
            style={{ ...fontScaleButtonStyle, color: fontScale <= MIN_FONT_SCALE ? "#D1D5DB" : "#374151" }}
          >
            A−
          </button>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", padding: "0 3px", minWidth: 30, textAlign: "center" }}>
            {Math.round(fontScale * 100)}%
          </span>
          <button
            type="button"
            title="文字を大きく"
            aria-label="文字を大きく"
            onClick={(e) => {
              e.stopPropagation();
              adjustFontScale(FONT_SCALE_STEP);
            }}
            disabled={fontScale >= MAX_FONT_SCALE}
            style={{ ...fontScaleButtonStyle, color: fontScale >= MAX_FONT_SCALE ? "#D1D5DB" : "#374151" }}
          >
            A＋
          </button>
        </div>
      )}
      {/* 上下左右・4隅すべてで自由にリサイズできる（縦横比は完全に自由）。
          どの方向にドラッグしても、ドラッグ終了時にその枠の大きさへ文字サイズを最大限フィットさせる。
          高さの下限は「最小文字サイズでも中身が収まる高さ」を動的に渡し、それより縮められないようにする */}
      <NodeResizer
        minWidth={MIN_NODE_WIDTH}
        minHeight={minHeight}
        isVisible={selected}
        onResizeStart={() => {
          if (autoFitRef.current) {
            autoFitRef.current = false;
            setNodeAutoFit(id, false);
          }
          isResizingRef.current = true;
        }}
        onResizeEnd={() => {
          isResizingRef.current = false;
          fitToBox();
        }}
        lineStyle={{ borderColor: "#2563EB", borderWidth: 1.5 }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: "#2563EB", border: "1.5px solid #FFFFFF" }}
      />
      {/* 4辺すべてを接続点にする。connectionMode="loose"（MapCanvasScreen側で設定）と組み合わせて、
          どの辺からドラッグ開始しても・どの辺にドロップしても繋げる。
          複数ハンドルを持つノードでは一意なidが無いと矢印の描画位置が不定になるため、位置ごとに固定idを付ける。
          ※ 全て type="source" に統一している: xyflowのエッジ描画は loose モードでも
          「edge.sourceHandle は必ずそのノードの source バケットの中から探す」という非対称な実装のため、
          target型ハンドル同士（例: 上と上）を繋ぐと接続自体は成立するのに描画だけ失敗する。
          全ハンドルを source にしておけば、どちらの向きに繋いでも常に描画側のバケット探索に一致する。 */}
      <Handle id="left" type="source" position={Position.Left} style={{ ...handleStyle, left: -5 }} />
      <Handle id="top" type="source" position={Position.Top} style={{ ...handleStyle, top: -5 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ ...handleStyle, right: -5 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -5 }} />

      <div style={{ display: "flex", flexWrap: "wrap", flexShrink: 0, alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5 * fontScale,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            background: preset.badgeBg,
            color: preset.badgeText,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: preset.color, display: "inline-block", flexShrink: 0 }} />
          {preset.label}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          {data.date && (
            <span style={{ fontSize: 12.5 * fontScale, fontWeight: 700, color: "#111827" }}>{formatShortDate(data.date)}</span>
          )}
          {statusPreset && (
            <button
              type="button"
              className="nodrag"
              onClick={(e) => {
                e.stopPropagation();
                setNodeStatus(id, QUICK_STATUS_CYCLE[data.status ?? "todo"] ?? "todo");
              }}
              title="クリックで「未着手→進行中→着手済み」を順に切り替え（「保留」は詳細パネルから）"
              style={{
                fontSize: 10 * fontScale,
                fontWeight: 700,
                padding: "3px 7px",
                borderRadius: 999,
                background: statusPreset.bg,
                color: statusPreset.text,
                border: "none",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {statusPreset.label}
            </button>
          )}
        </div>
      </div>

      {editingField === "title" ? (
        <input
          ref={inputRef}
          className="nodrag nopan"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") cancel();
          }}
          style={{
            fontSize: 16 * fontScale,
            fontWeight: 700,
            color: "#111827",
            border: "1px solid #2563EB",
            borderRadius: 6,
            padding: "3px 6px",
            width: "100%",
            fontFamily: "inherit",
            background: "#FFFFFF",
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => startEdit("title", e)}
          className="nodrag"
          title="ダブルクリックで編集"
          style={{
            fontSize: 16 * fontScale,
            fontWeight: 700,
            lineHeight: 1.35,
            color: "#111827",
            cursor: "text",
            flexShrink: 0,
            overflowWrap: "anywhere",
          }}
        >
          {data.title}
        </div>
      )}

      {editingField === "body" ? (
        <textarea
          ref={textareaRef}
          className="nodrag nopan"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          style={{
            fontSize: 14.5 * fontScale,
            fontWeight: 600,
            lineHeight: 1.5,
            color: "#111827",
            border: "1px solid #2563EB",
            borderRadius: 6,
            padding: "4px 6px",
            width: "100%",
            flex: 1,
            minHeight: 0,
            fontFamily: "inherit",
            resize: "none",
            background: "#FFFFFF",
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => startEdit("body", e)}
          className="nodrag"
          title="ダブルクリックで編集"
          style={{
            fontSize: 14.5 * fontScale,
            fontWeight: data.body ? 600 : 400,
            lineHeight: 1.5,
            color: data.body ? "#111827" : "#9CA3AF",
            fontStyle: data.body ? "normal" : "italic",
            whiteSpace: "pre-wrap",
            flexShrink: 0,
            minHeight: 18,
            overflowWrap: "anywhere",
            cursor: "text",
          }}
        >
          {data.body || "ダブルクリックで本文を入力"}
        </div>
      )}

      {(data.tags.length > 0 || data.obsidianLinks.length > 0 || attachments.length > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
            flexShrink: 0,
            borderTop: data.obsidianLinks.length > 0 || attachments.length > 0 ? "1px solid #F3F4F6" : undefined,
            paddingTop: data.obsidianLinks.length > 0 || attachments.length > 0 ? 7 : undefined,
          }}
        >
          {data.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10 * fontScale,
                color: "#4B5563",
                background: "#F3F4F6",
                borderRadius: 6,
                padding: "2px 6px",
                overflowWrap: "anywhere",
              }}
            >
              {tag}
            </span>
          ))}
          {data.obsidianLinks.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5 * fontScale,
                color: "#9CA3AF",
                flexShrink: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              {data.obsidianLinks.length}件のリンク
            </span>
          )}
          {attachments.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5 * fontScale,
                color: "#9CA3AF",
                flexShrink: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {attachments.length}件の添付
            </span>
          )}
        </div>
      )}

      {/* カード内の好きな場所に置ける自由コメント（付箋）。カードの余白をダブルクリックすると追加される */}
      {comments.map((comment) => (
        <FreeCommentBubble key={comment.id} comment={comment} nodeId={id} />
      ))}
    </div>
  );
}

export const nodeTypes = {
  task: NodeCard,
  idea: NodeCard,
  question: NodeCard,
  result: NodeCard,
};
