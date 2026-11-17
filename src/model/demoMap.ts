import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  SCHEMA_VERSION,
  type ResearchFlowEdge,
  type ResearchFlowNode,
  type ResearchMapFile,
} from "./types";

const ts = "2026-01-05T09:00:00.000Z";

function node(
  id: string,
  category: ResearchFlowNode["data"]["category"],
  x: number,
  y: number,
  title: string,
  body: string,
  extra: Partial<ResearchFlowNode["data"]> = {},
): ResearchFlowNode {
  return {
    id,
    type: category,
    position: { x, y },
    // 明示的な width/height を持たないノードは、読み込みタイミングによって
    // React Flow の自動計測が極小サイズ（例: 32px）に失敗することがあるため、
    // 常に既定サイズを明示しておく（NodeResizer で後からいくらでも変更できる）
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    data: {
      category,
      title,
      body,
      tags: [],
      obsidianLinks: [],
      createdAt: ts,
      updatedAt: ts,
      ...extra,
    },
  };
}

function edge(id: string, source: string, target: string, label?: string): ResearchFlowEdge {
  return { id, source, target, type: "labeled", label, data: { lineStyle: "dashed" } };
}

export function createDemoMap(): ResearchMapFile {
  const nodes: ResearchFlowNode[] = [
    node(
      "A",
      "result",
      0, 260,
      "GFP融合タンパク質がWBで検出できない",
      "GFP融合遺伝子を導入した細胞株を樹立したが、抗GFP抗体のWBでバンドが出ない。",
      {
        date: "2026-01-08",
        tags: ["WB", "GFP"],
        obsidianLinks: [{ id: "l1", vaultName: "MyVault", filePath: "Notes/sample_experiment_note.md" }],
      },
    ),
    node(
      "B",
      "task",
      320, 60,
      "プラスミド配列をシーケンスで確認",
      "挿入部位と読み枠が設計通りか、サンガーシーケンスで確認する。",
      { date: "2026-01-10", status: "done", tags: ["配列確認"] },
    ),
    node(
      "C",
      "result",
      600, 60,
      "配列解析で構築は健全と判明",
      "挿入配列・読み枠ともに設計通り。構築自体に問題はなさそう。",
      { date: "2026-01-11" },
    ),
    node(
      "D",
      "question",
      320, 320,
      "宿主細胞で標的遺伝子自体が発現していない？",
      "構築は健全なのにシグナルが出ない→そもそも宿主側で発現していない可能性。",
      { date: "2026-01-12", tags: ["仮説"] },
    ),
    node(
      "E",
      "task",
      610, 320,
      "親株で内在タンパク質のWBを実施",
      "融合タグを持たない親株でも内在タンパク質が見えるか確認する。",
      { date: "2026-01-15", status: "done", tags: ["WB"] },
    ),
    node(
      "F",
      "result",
      900, 320,
      "親株も陰性→宿主で非発現の可能性が高い",
      "タグの有無によらず陰性。宿主細胞側の発現が原因と判断。",
      {
        date: "2026-01-16",
        tags: ["結論"],
        obsidianLinks: [
          { id: "l2", vaultName: "MyVault", filePath: "Notes/sample_RTqPCR.md" },
        ],
      },
    ),
    node(
      "G",
      "task",
      900, 560,
      "発現量をRT-qPCRで定量",
      "転写レベルでも発現していないか、翻訳段階の問題かを切り分ける。",
      { date: "2026-01-20", status: "in_progress", tags: ["qPCR"] },
    ),
    node(
      "H",
      "idea",
      610, 560,
      "別プロモーターで再導入した細胞株を作製",
      "内在プロモーターに問題がある可能性を見越し、異種プロモーター駆動の代替株を用意しておく。",
      { date: "2026-01-22", tags: ["次の一手"] },
    ),
  ];

  const edges: ResearchFlowEdge[] = [
    edge("e1", "A", "B", "まず構造確認"),
    edge("e2", "B", "C"),
    edge("e3", "A", "D", "発現側を疑う"),
    edge("e4", "D", "E"),
    edge("e5", "E", "F"),
    edge("e6", "F", "G", "定量で裏付け"),
    edge("e7", "F", "H", "対策案"),
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: "0.1.0",
    projectName: "サンプル（GFP融合タンパク質）",
    devFolderPath: undefined,
    vaultName: "MyVault",
    createdAt: ts,
    updatedAt: ts,
    nodes,
    edges,
  };
}
