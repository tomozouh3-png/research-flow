interface NodeContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
}

/** ノードカードを右クリックしたときに出す、削除用の小さなメニュー */
export function NodeContextMenu({ x, y, onDelete }: NodeContextMenuProps) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,.12)",
        padding: 4,
        minWidth: 140,
      }}
      // メニュー自体のクリックでキャンバスのペインクリック(選択解除)まで伝播しないように
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onDelete}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          fontSize: 12.5,
          fontWeight: 700,
          color: "#DC2626",
          background: "none",
          border: "none",
          borderRadius: 6,
          padding: "8px 10px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2}>
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
        削除
      </button>
    </div>
  );
}
