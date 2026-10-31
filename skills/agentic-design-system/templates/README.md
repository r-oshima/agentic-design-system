# Design System

<!-- 対象のプロダクト、対象メディア、テーマを1〜2文で書く。対象外のもの（業務仕様など）も書く。 -->

| 文書 | 役割 |
| --- | --- |
| README（この文書） | 定義を選んでUIに適用する |
| [ARCHITECTURE](ARCHITECTURE.md) | Design Systemの構造と規則 |
| [CONTRIBUTING](CONTRIBUTING.md) | 定義を追加・変更・廃止する |

## Design Principles

<!-- ユーザーが何をする画面か、何を重視するかを1段落で書く。 -->

### 判断の原則

<!-- 画面をまたいで迷う判断に、答えを出す原則を4〜6個。「**原則。** 理由や具体的な判断」の形で書く。 -->

### 品質の基準

<!-- 満たしたかを確かめられる基準を書く。コントラストの基準は必ず書く。リファレンスがある場合は、その再現より優先するかも書く。 -->

## UIを作る手順

1. **部品はComponentを使う。** 独自の状態や操作を持つもの（入力欄、メニュー、タブなど）や、他の画面でも同じ役割で出てくるものは部品として扱う。[Index](#index)にあれば、その文書のUsageで使い分けを確認し、同じフォルダの仕様（`spec.json`）の指定どおりに使う。なければ手順5に進む。
2. **画面の構成はTokenで組み立てる。** 部品の配置、セクション間の余白、見出しと本文の組み合わせなど、その画面だけの構成はComponentにしない。Patternがあればそれに従い、なければTokenを直接使う。色・文字・不透明度・線幅・アイコンサイズはSemantic、余白・寸法・角丸はPrimitiveの`space.*`・`size.*`・`radius.*`から選ぶ。どの段階を選ぶかは、[Index](#index)のFoundationにカテゴリごとの基準がある。候補が複数ある場合は、実際の文言やデータを入れて描画し、比べて決める。
3. **文字・アイコン・focusの外周の色は、下にある背景色との組み合わせで選ぶ。** [contrast.json](contrast.json)に、どの背景の上にどの色を置いてよいかの一覧がある。一覧の組み合わせは、lightとdarkの両方でコントラストの基準を満たしている。一覧にない組み合わせが必要なら手順5に進む。
4. **生の値を書かない。** 色の値や`13px`などをUIに直接書かない。合うTokenがなければ手順5に進む。アイコンの図形の中の値（`viewBox`、`stroke-width`、パスの座標）は図形の一部なので対象外。アイコンの色は`currentColor`にして親の色を受け継ぎ、大きさは`iconSize.*`で指定する。
5. **足りないものがあるとき、Design Systemだけで判断できないときは、[CONTRIBUTINGの「判断できないとき」](CONTRIBUTING.md#判断できないとき)に従う。** 足りない定義をDesign Systemに足してから、UIの作業に戻る。
6. **作ったUIを確認する。** lightとdarkの両方、キーボードでのfocus、長い文言の折り返しを確かめる。

Tokenの値の正本は[tokens](tokens/)のJSONにある。状態の意味と参照の規則は[ARCHITECTURE](ARCHITECTURE.md)を参照する。

## Index

<!-- Component、Pattern、Foundationの文書すべてにリンクする。lintが抜けを確かめる。 -->

| 種類 | 定義 |
| --- | --- |
| Foundation | |
| Token | [primitive](tokens/primitive.json)、[semantic](tokens/semantic.json)、[semantic.light](tokens/semantic.light.json)、[semantic.dark](tokens/semantic.dark.json) |
| 色の組み合わせ | [contrast.json](contrast.json) |
| 判断の記録 | [decisions](decisions/) |
