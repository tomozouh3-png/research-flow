import { CATEGORY_ORDER, CATEGORY_PRESET, type NodeCategory } from "../model/types";
import { useMapStore } from "../state/store";

export function nextNodePosition(nodeCount: number): { x: number; y: number } {
  const col = nodeCount % 4;
  const row = Math.floor(nodeCount / 4);
  return { x: 40 + col * 260, y: 40 + row * 220 };
}

const categoryButtonStyle = (bg: string, border: string, text: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12.5,
  fontWeight: 700,
  color: text,
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 10,
  padding: "8px 12px",
});

const BUTTON_STYLES: Record<NodeCategory, { bg: string; border: string; text: string }> = {
  task: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" },
  idea: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
  question: { bg: "#F5F3FF", border: "#DDD6FE", text: "#6D28D9" },
  result: { bg: "#ECFDF5", border: "#A7F3D0", text: "#15803D" },
};

export function Toolbar() {
  const nodes = useMapStore((s) => s.nodes);
  const addNode = useMapStore((s) => s.addNode);

  const handleAdd = (category: NodeCategory) => {
    addNode(category, nextNodePosition(nodes.length));
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        zIndex: 5,
      }}
    >
      {CATEGORY_ORDER.map((cat) => {
        const style = BUTTON_STYLES[cat];
        return (
          <button
            key={cat}
            type="button"
            onClick={() => handleAdd(cat)}
            style={categoryButtonStyle(style.bg, style.border, style.text)}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: CATEGORY_PRESET[cat].color, display: "inline-block" }} />
            ＋ {CATEGORY_PRESET[cat].label}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ position: "relative" }}>
        <input
          type="search"
          aria-label="ノードを検索"
          placeholder="ノードを検索（今後の機能）"
          disabled
          style={{
            width: 220,
            fontSize: 12.5,
            padding: "8px 12px 8px 32px",
            borderRadius: 10,
            border: "1px solid #E5E7EB",
            background: "#F9FAFB",
            color: "#9CA3AF",
            outline: "none",
          }}
        />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth={2}
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
    </div>
  );
}
