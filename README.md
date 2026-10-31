# design-system-skill

プロダクトのUIを作るAgentが参照し、プロダクトと一緒に変えていくDesign Systemを、作って運用するためのSkill。Claude CodeとCodexで使える。

## 解く問題

AgentにUIを作らせると、画面ごとに色や余白の値が少しずつずれ、似た部品が増えていく。人が書いたスタイルガイドは、Agentが読んで守るには曖昧で、プロダクトが育つと古くなる。

このSkillは、Agentが読んで守れる形のDesign Systemを作る。規則を文章だけにせず、lintで機械的に確かめる。足りない定義は、Agentが規則に従って足せる。人の確認が要る変更は、あらかじめ範囲を決めてある。

## 何ができるか

- **Design Systemを作る。** プロダクトの内容を聞き、Design Principles、Token、Foundation、Componentの置き場を作る。参考にするプロダクトがあり、ブラウザを操作できる場合は、その画面を計測して値の材料にする。なければ、既定の手順で値を決める。
- **Design Systemに沿ってUIを作る。** 足りない定義は、規則に従ってDesign Systemに足す。画面へのフィードバックを定義に反映する手順、Tokenの状態（experimental / stable / deprecated）の見直しもある。
- **Skillがなくても運用できる。** 作ったDesign Systemは、README、ARCHITECTURE、CONTRIBUTING、lintだけで運用が完結する。Skillは作るための雛形で、作ったあとに更新を配ることはしない。

使い方の詳細は[SKILL.md](skills/design-system/SKILL.md)にある。このSkill自体を改善する場合は[MAINTAINING.md](skills/design-system/MAINTAINING.md)に従う。

## 作られるもの

対象リポジトリの`docs/design-system/`（指定があればそこ）に、次の構造ができる。

```
docs/design-system/
  README.md             Design Principlesと、UIを作る手順
  ARCHITECTURE.md       構造と規則（層、命名、状態）
  CONTRIBUTING.md       定義の追加・変更の手順と、人に確認する範囲
  tokens/               Token（DTCG形式のJSON）。Primitive → Semantic の層
  foundation/           カテゴリごとのTokenの選び方
  components/           部品ごとの役割と、見た目の指定（spec.json）
  contrast.json         前景と背景の組み合わせと、求めるコントラスト比
  decisions/            判断の記録（ADR）
  scripts/              lintとそのテスト
```

リファレンス（参考にするプロダクトの計測結果）を使う場合は`references/`も作る。

## 必要なもの

- Node.js。付属のスクリプト（lint、色のスケール生成など）が使う。外部のパッケージは使わない。
- Claude CodeまたはCodex。
- 参考にするプロダクトの画面を計測する場合は、ブラウザを操作する道具（Claude Codeの場合はClaude in Chromeなど）。

## 入れ方

以下の`r-oshima/design-system-skill`は、公開先のリポジトリ名である。

### npx

```sh
npx skills add r-oshima/design-system-skill
```

入れる先のAgentは`--agent claude-code`や`--agent codex`で選ぶ。ユーザー単位で入れる場合は`--global`を付ける。

### Claude Code（プラグイン）

```
/plugin marketplace add r-oshima/design-system-skill
/plugin install design-system@design-system-skill
```

### Codex

Codexの中で、次のように頼む。入れたあとはCodexを再起動する。

```
$skill-installer install https://github.com/r-oshima/design-system-skill/tree/main/skills/design-system
```

### 手動

cloneして、`skills/design-system`をAgentのskillsフォルダへコピーするか、リンクを張る。リンクなら、更新は`git pull`だけで済む。

```sh
git clone https://github.com/r-oshima/design-system-skill ~/design-system-skill

# Claude Code
ln -s ~/design-system-skill/skills/design-system ~/.claude/skills/design-system

# Codex
ln -s ~/design-system-skill/skills/design-system ~/.agents/skills/design-system
```

Skillの置き場所は、ツールの版によって変わることがある。入れたあと、`/design-system`（Claude Code）や`/skills`（Codex）で見えることを確かめる。プロジェクトだけで使う場合は、プロジェクトの`.claude/skills/`や`.agents/skills/`に同じようにする。

## 使い方

Agentに頼む。たとえば次のように言う。

- 「このプロダクトのDesign Systemを作って」
- 「Design Systemに沿って、この画面を作って」

Design Systemがなければ新しく作り、あればそれに沿ってUIを作る。

作るときは、Agentがまず、対象のプロダクト、参考にするものの有無、色の方向などを聞く。あいまいな答えには具体的な選択肢を示し、決めたことの一覧をあなたが確かめてから、Tokenなどを作り始める。聞けない場合は、既定値で進め、仮定したことを記録する。

## 現時点の状態

- 初期のバージョンである。Web UI（CSSで表せるもの）を前提にしている。
- Skillの文書は日本語である。英語版は、内容が安定してから作る予定。
- 入れ方のうち、動作を確かめたのはリンクによる手動の入れ方だけである。他は、公開後に確かめる。

## ライセンス

[MIT](LICENSE)
