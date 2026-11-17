import { useEffect, useRef, useState } from "react";
import {
  getCachedVaultHandle,
  isFileSystemAccessSupported,
  listMaps,
  pickVaultHandle,
  readMap,
  saveMap,
  type MapListEntry,
} from "../persistence/fsAccess";
import { readMapFromFile } from "../persistence/safariFallback";
import { idbGet, idbSet } from "../persistence/idb";
import { getRecentMaps, upsertRecentMap, type RecentMapEntry } from "../persistence/recent";
import { createDemoMap } from "../model/demoMap";
import { nowIso, slugifyProjectName, type ResearchMapFile } from "../model/types";
import { useMapStore } from "../state/store";

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 20,
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
};

interface DisplayEntry {
  id: string;
  projectName: string;
  updatedAt: string;
  isLocalOnly: boolean;
  open: () => void | Promise<void>;
  rename: (newName: string) => Promise<void>;
}

export function ProjectListScreen({ onOpenMap }: { onOpenMap: () => void }) {
  const [vaultEntries, setVaultEntries] = useState<MapListEntry[]>([]);
  const [recent, setRecent] = useState<RecentMapEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fsSupported = isFileSystemAccessSupported();

  const vaultHandle = useMapStore((s) => s.vaultHandle);
  const setVaultHandle = useMapStore((s) => s.setVaultHandle);
  const loadMap = useMapStore((s) => s.loadMap);
  const resetToEmpty = useMapStore((s) => s.resetToEmpty);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vaultハンドルのキャッシュ復元
  useEffect(() => {
    if (!fsSupported) return;
    void (async () => {
      const cached = await getCachedVaultHandle();
      if (cached) setVaultHandle(cached);
    })();
  }, [fsSupported, setVaultHandle]);

  // 保存済みプロジェクトの一覧を読み込む（Vault内のファイル ＋ このデバイスのローカルバックアップ）
  const refreshLists = async () => {
    setLoading(true);
    try {
      const [recentList, vaultList] = await Promise.all([
        getRecentMaps(),
        vaultHandle ? listMaps(vaultHandle) : Promise.resolve<MapListEntry[]>([]),
      ]);
      setRecent(recentList);
      setVaultEntries(vaultList);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultHandle]);

  const handleConnectVault = async () => {
    try {
      const handle = await pickVaultHandle();
      setVaultHandle(handle);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setError(e.message);
    }
  };

  const handleOpenVaultEntry = async (entry: MapListEntry) => {
    try {
      const data = await readMap(entry.handle);
      loadMap(data, entry.fileName);
      onOpenMap();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenLocalBackup = async (backupKey: string) => {
    try {
      const data = await idbGet<ResearchMapFile>(backupKey);
      if (!data) {
        setError("バックアップが見つかりませんでした");
        return;
      }
      loadMap(data, null);
      onOpenMap();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Vault側のファイルは中身の projectName だけ書き換える（ファイル名自体は変えない。
  // fileNameは作成時に決まる識別子として以後は固定で扱っている既存方針に合わせる）
  const handleRenameVaultEntry = async (entry: MapListEntry, newName: string) => {
    if (!vaultHandle) return;
    const data = await readMap(entry.handle);
    const updatedAt = nowIso();
    const updated: ResearchMapFile = { ...data, projectName: newName, updatedAt };
    await saveMap(vaultHandle, entry.fileName, updated);
    await upsertRecentMap({
      id: `vault:${entry.fileName}`,
      projectName: newName,
      updatedAt,
      location: { type: "vault", fileName: entry.fileName },
    });
  };

  const handleRenameLocalEntry = async (r: RecentMapEntry, newName: string) => {
    const backupKey = (r.location as { type: "local"; backupKey: string }).backupKey;
    const data = await idbGet<ResearchMapFile>(backupKey);
    if (!data) throw new Error("バックアップが見つかりませんでした");
    const updatedAt = nowIso();
    const updated: ResearchMapFile = { ...data, projectName: newName, updatedAt };
    await idbSet(backupKey, updated);
    await upsertRecentMap({ id: r.id, projectName: newName, updatedAt, location: r.location });
  };

  const handleRenameEntry = async (entry: DisplayEntry) => {
    const next = window.prompt("新しいプロジェクト名を入力してください", entry.projectName);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === entry.projectName) return;
    try {
      await entry.rename(trimmed);
      await refreshLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleNewMap = () => {
    const name = window.prompt("新しいプロジェクト名を入力してください", "新しいプロジェクト");
    if (!name) return;
    resetToEmpty(name);
    onOpenMap();
  };

  const handleOpenDemo = () => {
    loadMap(createDemoMap(), null);
    onOpenMap();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readMapFromFile(file);
      loadMap(data, file.name);
      onOpenMap();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = "";
    }
  };

  // Vault側に同名（スラッグ一致）のファイルがある場合は、ローカルバックアップ側を重複表示しない
  const vaultSlugs = new Set(vaultEntries.map((e) => e.fileName.replace(/\.json$/, "")));

  // Vault内のファイルはファイル自体から projectName/updatedAt を読んでいるため、
  // 他デバイスで初めて接続した場合でも（このブラウザの recentMaps キャッシュに頼らず）正しい表示になる
  const vaultDisplayEntries: DisplayEntry[] = vaultEntries.map((entry) => ({
    id: `vault:${entry.fileName}`,
    projectName: entry.projectName,
    updatedAt: entry.updatedAt,
    isLocalOnly: false,
    open: () => handleOpenVaultEntry(entry),
    rename: (newName) => handleRenameVaultEntry(entry, newName),
  }));

  const localDisplayEntries: DisplayEntry[] = recent
    .filter((r) => r.location.type === "local" && !vaultSlugs.has(slugifyProjectName(r.projectName)))
    .map((r) => ({
      id: r.id,
      projectName: r.projectName,
      updatedAt: r.updatedAt,
      isLocalOnly: true,
      open: () => handleOpenLocalBackup((r.location as { type: "local"; backupKey: string }).backupKey),
      rename: (newName) => handleRenameLocalEntry(r, newName),
    }));

  const allEntries = [...vaultDisplayEntries, ...localDisplayEntries].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

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
          padding: "0 24px",
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 900, fontSize: 16 }}>ResearchFlow</span>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>研究進捗マップ</span>
      </div>

      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 900 }}>プロジェクト一覧</h1>

        {fsSupported ? (
          vaultHandle ? (
            <div style={{ marginBottom: 24 }}>
              <div style={infoChipStyle}>
                <FolderIcon /> 保存先: {vaultHandle.name}/
                <button type="button" onClick={() => void handleConnectVault()} style={linkishButtonStyle}>
                  変更
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <button type="button" onClick={() => void handleConnectVault()} style={primaryButtonStyle}>
                Obsidian Vaultフォルダへ接続
              </button>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, maxWidth: 480, lineHeight: 1.6 }}>
                Vaultのトップフォルダ（例: obsidian）を選ぶと、その直下にマップを自動保存します。iCloud Driveで同期されるため、
                他のPCでも同じVaultフォルダへ接続すれば続きを見る・編集できます（各デバイスで一度だけ接続が必要）。
                未接続の間はこのブラウザ内にのみ保存されます。
              </p>
            </div>
          )
        ) : (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: "#9CA3AF" }}>
              このブラウザは自動保存に対応していません。「開く」でJSONファイルを選ぶか、マップ画面の「保存」でダウンロードしてください。
            </p>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={(e) => void handleFileChosen(e)} style={{ fontSize: 12.5 }} />
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 16 }}>読み込みエラー: {error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 20, marginTop: 8 }}>
          {allEntries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => void entry.open()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void entry.open();
              }}
              style={cardStyle}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{entry.projectName}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    title="名前を変更"
                    aria-label="名前を変更"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRenameEntry(entry);
                    }}
                    style={renameButtonStyle}
                  >
                    <PencilIcon />
                  </button>
                  {entry.isLocalOnly && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#92400E",
                        background: "#FFFBEB",
                        border: "1px solid #FDE68A",
                        borderRadius: 999,
                        padding: "2px 7px",
                      }}
                    >
                      このデバイスのみ
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                {new Date(entry.updatedAt).toLocaleString("ja-JP")} 更新
              </span>
            </div>
          ))}

          <button type="button" style={dashedCardStyle} onClick={handleNewMap}>
            ＋ 新規マップ
          </button>
        </div>

        {loading && <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 16 }}>読み込み中…</p>}

        {allEntries.length === 0 && !loading && (
          <button type="button" onClick={handleOpenDemo} style={{ ...linkishButtonStyle, marginTop: 24, fontSize: 12.5 }}>
            サンプルを開く（GFP融合タンパク質の例）
          </button>
        )}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const infoChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11.5,
  color: "#9CA3AF",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "5px 10px",
  marginBottom: 24,
};

const linkishButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "#2563EB",
  fontWeight: 700,
  fontSize: 11.5,
  cursor: "pointer",
  padding: 0,
  marginLeft: 4,
};

const primaryButtonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#FFFFFF",
  background: "#111827",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  cursor: "pointer",
};

const renameButtonStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  background: "#FFFFFF",
  color: "#6B7280",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

const dashedCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 96,
  border: "1.5px dashed #D1D5DB",
  borderRadius: 16,
  color: "#6B7280",
  fontSize: 13,
  fontWeight: 700,
  background: "none",
  cursor: "pointer",
};
