# agentic-design-system

**AgentがUIを作る途中で足りない定義を追加し、規則違反はlintが止めるDesign Systemを作るSkill。**

Agentは、定義を選んでUIを作る。定義が足りなければ、規則に従ってその場で追加する。参照の誤り、命名、コントラストなどの規則違反は、lintが検出する。画面が増えても、色や余白のずれと、似た部品の乱立が起きない。Claude CodeとCodexで使える。

## 課題

AgentにUIを作らせると、画面ごとに色や余白が少しずつずれ、似た部品が増えていく。人が書いたスタイルガイドは、Agentが読んで守るには曖昧で、プロダクトの変更に追従できず古くなる。逆に、定義を固定すると、足りないものが出たときにAgentが止まるか、定義の外で勝手に作ってしまう。

## アプローチ

Design Systemを、**Agentが読み、守り、自分で更新するもの**として作る。

- **読む：** READMEの手順に従えば、Agentは定義を選んでUIに適用できる。定義は、Token（Primitive → Semantic の層）、Foundation（選び方）、Component（役割と見た目の指定）に分かれている。
- **守る：** 守らせたい規則は、文章に書くだけでなく、lintで機械的に確かめる。
- **更新する：** 足りない定義が出たら、Agentが規則に従って足す。判断した内容は、UIだけで終わらせず、必ずDesign Systemに残す。次に同じ判断が必要になったとき、Design Systemの中で答えが見つかるようにするため。

```
UIを作る → 定義が足りない → 規則に従って定義を足す → lintで確かめる → 記録する → UIに戻る
```

### 安定した定義と実験的な定義

定義は、安定したものと実験的なものに分けて持つ。Agentが足した定義は実験的なものから始まり、Agentが自由に変えられる。使われて確定したものだけを安定にし、安定した定義を変えるときは、人に確認する。（状態の名前は`experimental`、`stable`で、廃止予定のものは`deprecated`。）

## 強み

- **lintが標準で入る。規則をAgentに守らせられる。** 作ったDesign Systemに、lintとそのテストが最初から入る（Node.jsだけで動く）。文章の規則を、機械で確かめる。エラーには直し方を書いてあるので、Agentはそれを見て直せる。確かめるのは、たとえば次の項目である。
  - **コントラスト：** 文字・アイコン・focusの前景と背景の組み合わせを、lightとdarkの両方でWCAG 2.2 AAの比（文字4.5:1、アイコンとfocusの外周3:1）と照らす。半透明の背景は、重なり得る全ての面の上に合成して確かめる。足りない組み合わせは、色の段階を足して直す。例外は、理由を書いたものしか認めず、基準を満たすようになった例外は削除を求める。
  - **部品の指定の抜け：** 部品のVariationと状態の全ての組み合わせで、前景と背景の組み合わせがコントラストの検査に登録されているかを確かめる。
  - **参照と命名：** 層をまたぐ参照（Semanticを飛ばしてPrimitiveを使うなど）、Tokenの名前、テーマごとの定義の食い違い、未定義の参照。
  - **安定度：** 安定した定義が実験的な定義に依存していないか、廃止予定の定義に代わりの定義があるか。
  - **文書の構成：** 部品の文書の節（Usage、Interaction）、リファレンスの必須の項目、READMEの索引に定義が載っているか。
- **Agentが規則に従って定義を変えられる。** 使われ方（`usage.mjs`）を見て、実験的な定義を安定にするか、廃止するかを決める。人の確認が要る変更は範囲が決まっていて、それ以外はAgentが進められる。規則そのものも、CONTRIBUTINGに従ってプロジェクトごとに変えられる。
- **リファレンスから材料を取れる。** 参考にするプロダクトの画面を計測して、Tokenや部品の材料にする。どれだけ似せるか（`inspire`は参考、`match`はできる限り同じ）と、値がどれだけ正確か（指定値か推定値か）を分けて扱い、規則と食い違う値は理由を記録する。
- **必要になったときに、またリファレンスを調べる。** UIを作っていて定義が足りなくなったら、Agentがリファレンスの「見る画面」から該当する箇所を探しに行く。見つけたものは、見ただけで終わらせず、定義に取り込む。
- **フィードバックが定義に反映される。** 画面への指摘を、画面だけの問題か、定義の問題かに分ける。定義を変えると他の画面にも効く場合は、範囲をユーザーに確かめてから反映する。同じ指摘を別の画面で繰り返させない。
- **判断の理由が残る。** 複数の選択肢から選んだ判断や、規則を変えた判断は、ADRに記録する。
- **作る前に聞く。** 対象や色の方向があいまいなら、具体的な選択肢を示して聞き、決めたことの一覧をユーザーが確かめてから作り始める。聞けない場合は、既定値で進め、仮定したことを記録する。
- **Skillがなくても運用できる。** 作ったDesign Systemは、README、ARCHITECTURE、CONTRIBUTING、lintだけで運用が完結する。Skillは作るための雛形で、作ったあとに更新を配ることはしない。

使い方の詳細は[SKILL.md](skills/agentic-design-system/SKILL.md)にある。このSkill自体を改善する場合は[MAINTAINING.md](skills/agentic-design-system/MAINTAINING.md)に従う。

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

**npx**

```sh
npx skills add r-oshima/agentic-design-system
```

**Claude Code（プラグイン）**

```
/plugin marketplace add r-oshima/agentic-design-system
/plugin install agentic-design-system@agentic-design-system

# 呼び出しは /agentic-design-system:agentic-design-system
```

**Codex**

```
$skill-installer install https://github.com/r-oshima/agentic-design-system/tree/main/skills/agentic-design-system
```

**手動**

```sh
git clone https://github.com/r-oshima/agentic-design-system ~/agentic-design-system
ln -s ~/agentic-design-system/skills/agentic-design-system ~/.claude/skills/agentic-design-system  # Claude Code
ln -s ~/agentic-design-system/skills/agentic-design-system ~/.agents/skills/agentic-design-system  # Codex
```

## 使い方

Agentに頼む。Design Systemがなければ新しく作り、あればそれに沿ってUIを作る。

### 作る

依頼の細かさは問わない。読み取れない項目だけを聞き、あいまいな答えには具体的な選択肢を示して聞き直す。決めたことの一覧をあなたが確かめてから、作り始める。聞けない場合は、既定値で進め、仮定したことを記録する。

| 依頼の例 | Agentがすること |
| --- | --- |
| 「CSVとパスを編集するWebツール。Linearを参考に、色の使い方と密度を借りて。ロゴと文言は借りない。できる限り同じ見た目にして」 | 参考にする画面を計測して、Tokenと部品の材料にする。どれだけ似せるか（`match`）と、借りないものを記録する。コントラストの基準に合わない値は、基準を優先し、外れた理由を記録する。再現を優先したい場合は、あなたに確認する |
| 「落ち着いた、業務ツールらしい印象で」 | 印象を、密度・色・角丸などの具体的な違いに直した選択肢を示し、選んでもらう |
| 「強調色は#2F6FED、ニュートラルはグレー、基準の文字は14px、角丸は4px」 | 指定した色を色の段階の基準点にし、指定した大きさや角丸をそのまま値にする。足りない項目だけを聞く。コントラストが足りない組み合わせは、lintが検出し、基準を満たす段階を割り当てる |
| 「参考はなし。まず一覧画面を作りたい」 | リファレンスなしで、Design Principlesと一般的な基準から値を決める。一覧画面に必要な定義を足す |

### 使う・変える

| 依頼の例 | Agentがすること |
| --- | --- |
| 「Design Systemに沿って、プロジェクト一覧の画面を作って」 | 定義を選んでUIを作る。足りない定義は、規則に従って追加する。リファレンスがあれば、足りない部分をそこから調べる |
| 「ボタンの色が薄い」「この画面だけ行を詰めたい」 | 画面だけの問題か、定義の問題かを分ける。定義を変えると他の画面にも効く場合は、範囲を確かめてから反映する |
| 「Tokenの使われ方を見て、整理して」 | 使われ方を集計し、安定にする候補、廃止する候補、使われていない定義を出す。安定にするか、廃止するかは、あなたに確認する |
| 「見た目を確認できる見本を作って（Figma、HTMLなど）」 | Design Systemから見本を作る。以後、定義を変えるたびに作り直す |

## 現時点の状態

- 初期のバージョンである。Web UI（CSSで表せるもの）を前提にしている。
- Skillの文書は日本語である。英語版は、内容が安定してから作る予定。
- 入れ方は、すべて動作を確かめた。Codexの`$skill-installer`は、同じ処理のインストーラーのスクリプトで確かめた。

## ライセンス

[MIT](LICENSE)
