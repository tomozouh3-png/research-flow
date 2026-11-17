import { Panel, useReactFlow, useViewport } from "@xyflow/react";

interface ZoomSliderProps {
  minZoom: number;
  maxZoom: number;
}

/** キャンバス下部中央に表示する、ズーム率を直接ドラッグで操作できるスケールバー */
export function ZoomSlider({ minZoom, maxZoom }: ZoomSliderProps) {
  const { zoomTo } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <Panel position="bottom-center" style={{ marginBottom: 14 }}>
      <div
        className="nodrag nopan"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 999,
          padding: "7px 14px",
          boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 4px 10px rgba(0,0,0,.06)",
        }}
      >
        <button
          type="button"
          aria-label="縮小"
          onClick={() => zoomTo(Math.max(minZoom, zoom - 0.1))}
          style={zoomButtonStyle}
        >
          −
        </button>
        <input
          type="range"
          aria-label="ズーム率"
          min={minZoom}
          max={maxZoom}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(parseFloat(e.target.value))}
          style={{ width: 130, accentColor: "#2563EB", cursor: "pointer" }}
        />
        <button
          type="button"
          aria-label="拡大"
          onClick={() => zoomTo(Math.min(maxZoom, zoom + 0.1))}
          style={zoomButtonStyle}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoomTo(1)}
          title="100%に戻す"
          style={{ fontSize: 11, color: "#6B7280", background: "none", border: "none", width: 40, cursor: "pointer" }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </Panel>
  );
}

const zoomButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  lineHeight: 1,
  color: "#374151",
  background: "none",
  border: "none",
  cursor: "pointer",
  borderRadius: 999,
};
