# ResearchFlow

研究の進捗を「結果・タスク・疑問・アイデア」のノードでつなぐ、ブラウザ上の研究進捗マップ作成ツールです。登録不要・サーバー送信なし。

**使う:** https://tomozouh3-png.github.io/research-flow/

## プライバシー

- このサイトは静的ファイルだけで動作し、入力したデータをサーバーへ送信しません。
- マップはあなたのブラウザ内(IndexedDB)、または「Vaultフォルダへ接続」で選んだ自分のフォルダにのみ保存されます。他の訪問者から見えることはありません。
- 公開リポジトリに含まれるのは架空のサンプルのみで、作者自身の研究マップは含まれません。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # dist/index.html に単一ファイルを出力
```

公開サイトは `docs/index.html`(ビルド結果)を GitHub Pages で配信しています。更新時は `npm run build` 後に `dist/index.html` を `docs/index.html` へコピーしてください。

## ライセンス

MIT
