import { useState } from "react";
import { ProjectListScreen } from "../screens/ProjectListScreen";
import { MapCanvasScreen } from "../screens/MapCanvasScreen";

type Screen = "list" | "canvas";

export function App() {
  const [screen, setScreen] = useState<Screen>("list");

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {screen === "list" ? (
        <ProjectListScreen onOpenMap={() => setScreen("canvas")} />
      ) : (
        <MapCanvasScreen onBackToList={() => setScreen("list")} />
      )}
    </div>
  );
}
