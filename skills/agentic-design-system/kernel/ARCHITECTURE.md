# Architecture

このDesign Systemの構造の仕様。構成要素、参照の向き、命名、状態、正本の形式を定める。

UIへの適用方法はREADME、定義の追加・変更・廃止の手順はCONTRIBUTINGで扱う。両方ともこの文書を前提にする。この文書の規則に反する定義は、内容に関わらず不正として扱う。

## 構成要素

| 要素 | 役割 | 例 |
| --- | --- | --- |
| Primitive Token | 生の値の段階。用途の意味を持たない | `color.gray.500`、`space.8` |
| Semantic Token | 用途を表す名前。テーマで参照先が変わる場合がある | `color.text.subtle`、`typography.body.sm` |
| Component Token | 1つの部品の中でだけ使う値の名前。必要な場合だけ作る | `button.label.paddingX.compact` |
| Component | 構造・状態・操作を持つ再利用部品 | Button、Menu |
| Pattern | 複数のComponentを組み合わせた画面の型 | App shell、List-detail |

次はシステムの定義ではなく、付属の資料として扱う。

| 資料 | 役割 |
| --- | --- |
| Reference | リファレンス（参考にするサイトやアプリ。複数のページを含む）と、そこで観察・計測した内容。定義を追加・変更するときの材料であり、UIから直接参照しない。リファレンスがないDesign Systemでは作らない |
| Decision | 定義を追加・変更した理由の記録（ADR） |

## カテゴリの分類

Tokenのカテゴリは、Semanticを必ず通すかどうかで2種類に分ける。

| 分類 | カテゴリ | 規則 | 理由 |
| --- | --- | --- | --- |
| 役割系 | Color、Typography、Opacity、Border Width、Focus Offset、Icon Size、Elevation、Motion | UIから参照するときは必ずSemanticを通す | テーマや用途によって値が変わる。同じ役割の値をまとめて変更できる必要がある |
| 寸法系 | Space、Size、Radius | Primitiveを直接参照してよい | 段階そのものが選択肢になる。用途名を付けても選択の助けにならない |

寸法系のSemanticは作らない。

## 参照ルール

| 参照する側 | 参照してよいもの | 禁止 |
| --- | --- | --- |
| Primitive | 生の値 | 他のToken |
| Semantic | Primitive | 生の値、Semantic、Component Token |
| Component Token | Semantic、寸法系のPrimitive | 生の値、役割系のPrimitive、Component Token |
| Componentの指定 | Semantic、自部品のComponent Token、寸法系のPrimitive | 生の値、役割系のPrimitive、他部品のComponent Token |
| Pattern | Component、Semantic、寸法系のPrimitive | 生の値、役割系のPrimitive、Component Token |

参照は常に1段で解決する。SemanticからSemanticへの別名参照は認めない。

役割系の値は、Primitive → Semantic → 利用側の順にだけ流れる。部品に固有の色が必要な場合も、Component TokenからPrimitiveの色を直接参照せず、Semanticを通す。

この規則により、Component Tokenはテーマを持たない。テーマの切り替えはSemanticだけで完結する。

## 命名

Token名はドットで階層を分け、各語はcamelCaseにする。

| 層 | 形 | 規則 |
| --- | --- | --- |
| Primitive | `category.scale` | scaleは段階を表す数値、または`xs`〜`xl`などカテゴリごとに許可した段階名。用途の語（primary、danger、menu、control、idなど）を含めない |
| Semantic | `category.target.role[.state]` | 部品名を含めない。stateは`default`、`hovered`、`pressed`、`selected`、`disabled`を基本順とし、必要なものだけ作る |
| Component Token | `component.part.property[.variant][.state]` | 部品名から始める。部品名はComponentのフォルダ名をcamelCaseにしたもの |

例：`color.gray.500`（Primitive）、`color.background.ghost.hovered`（Semantic）、`button.label.paddingX.compact`（Component Token）。

Primitiveの補足：

- Colorは`color.<色名>.<数値>`、または`color.white`・`color.black`・`color.transparent`。番号が大きいほど暗い。
- 色の系列は50、100〜900（100刻み）、950をスケールとし、`stable`にする。スケールの間の段階（`color.gray.145`など）は、リファレンスの計測値を再現するためなどに置き、`experimental`にする。間の段階の番号は、前後の段階との明るさの位置で決める。
- 半透明色は`color.blackAlpha.40`のように`<色名>Alpha`の系列にする。DTCGではTokenが子を持てないため、`color.black.a40`とはしない。
- Font weightはCSSの数値をそのまま段階名にする（`fontWeight.450`）。
- SpaceとSizeはpxの値をそのまま段階名にする（`space.8`、`size.28`）。
- 各カテゴリで許可する段階名は`scripts/lint.mjs`で定める。

## 状態

Token、Component、Patternはすべて状態を1つ持つ。Tokenの状態はグループに書いて配下へ継承でき、個別のTokenで上書きできる。

| 状態 | 使う側にとっての意味 |
| --- | --- |
| `experimental` | 使ってよいが、変更・削除される可能性がある |
| `stable` | 標準。同じ用途の候補が複数あれば優先する |
| `deprecated` | 新しく使わない。代わりの定義を必ず明記する |

`stable`な定義は、`experimental`な定義を参照してはならない。状態を上げる条件はCONTRIBUTINGで定める。

役割系のPrimitiveはTokenからだけ参照されるため、参照されていない段階はlintで分かる。`stable`な段階は、まだ使われていなくても予約として残す。`experimental`と`deprecated`の段階は、参照されていなければ削除する。

## 正本

### ファイル構成

```text
docs/design-system/
  README.md            UIへの適用方法
  ARCHITECTURE.md      この文書
  CONTRIBUTING.md      追加・変更・廃止の手順
  CHANGELOG.md         利用側に影響する変更の一覧
  tokens/
    primitive.json     テーマを持たない基礎値
    semantic.json      テーマを持たない用途（Typography、Opacityなど）
    semantic.light.json
    semantic.dark.json テーマで値が変わる用途（Color、Elevation）
    component/
      <component>.json 部品ごとのComponent Token
  foundation/
    <カテゴリ>.md      カテゴリごとのTokenの選び方
  components/
    <name>/
      README.md        部品の役割・Usage・Interaction
      spec.json        部位・Variationの軸・指定
  patterns/
    <name>/README.md   画面の型
  contrast.json        前景と背景の組み合わせと、求めるコントラスト比
  decisions/           ADR。NNNN-<kebab-case>.md
  references/
    <name>.md          リファレンスごとの用途・見る画面・計測条件・観察
  scripts/             lintとそのテスト、Tokenの使われ方（usage.mjs）、見本の指紋（sample.mjs）
```

空のフォルダや将来用の空文書は作らない。必要になった時点で追加する。

### 正本の割り当て

| 情報 | 正本 | 備考 |
| --- | --- | --- |
| Tokenの名前・値・参照・状態 | `tokens/*.json` | 見本のVariableなどはここから作るか、ここと照合する |
| Tokenの選び方 | `foundation/*.md` | 値を書き写さない。Token名で参照する |
| 部品の使い方 | `components/*/README.md`、`patterns/*/README.md` | 状態をfrontmatterに書く |
| 部品の見た目の指定 | `components/*/spec.json` | 見本はここから作る |
| 見た目の確認 | 見本 | 正本ではない。tokensやspecと食い違えば、tokensとspecを正とする |

### 見本

見本は、人が見た目を確かめるための、Design Systemから作る派生物である。Agentは読まない。人が見本を直して、Design Systemに戻すことはない。見本を直接直しても、次に作り直すときに上書きされる。

作るのは、人に頼まれたときだけにする。形式は自由で、Pen、Figma、HTML、デスクトップアプリのカタログなどを使える。置き場所は、このフォルダの外でもよい。

形式によらず、次を見せる。

- Token：Colorの段階（Primitive）、ThemeごとのSemantic Color、Typography、Space、Radius、Elevationなど。状態（experimental / stable / deprecated）も分かるようにする。
- Component：`spec.json`の軸（Variation、状態）の組み合わせを、Themeごとに全て。
- 前景と背景の組み合わせ：`contrast.json`のコントラスト比。

見本を作ったら、`README.md`のIndexに、次の形の行を1行足す。

```
| 見本 | <形式と場所>。作り直し方：<Agentが実行する手順やコマンド>。同期：<指紋> |
```

指紋は、見本の元になる`tokens/`、`components/*/spec.json`、`contrast.json`の内容から`node scripts/sample.mjs`が計算する。見本を作り直したら、`node scripts/sample.mjs --stamp`で行の指紋を更新する。見本がある場合、これらを変える変更では、同じ変更の中で見本を作り直して指紋を更新する。lintは、指紋が今の内容と違うと警告する。Figmaなどの道具が使えず作り直せない場合は、警告を残して作業を進め、報告にその旨を書く。

### Tokenファイルの形式

[Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)（DTCG）に従う。

- 値は`$value`、型は`$type`、説明は`$description`に書く。
- 参照は`"{color.gray.500}"`の形で書く。
- 状態は`$extensions.ds.status`に書く。グループに書いた値は配下のTokenへ継承する。`deprecated`の場合は、代わりの定義を記した`$deprecated`も付ける。
- `semantic.light.json`と`semantic.dark.json`は、同じTokenの集合を持つ。片方にだけ存在するTokenは不正。
- Typographyは`typography`型の複合Tokenとして、`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`の5つすべてにPrimitiveの参照を書く。字間を変えない場合も`letterSpacing.none`のような段階を参照する。
- `color`型と`shadow`型のSemanticはテーマで値が変わるため、`semantic.light.json`と`semantic.dark.json`に置く。`semantic.json`には置かない。
- 影の基礎値は`shadow`型のPrimitiveとして`shadow.sm`のように段階で名付け、浮き上がりの用途は`elevation.*`のSemanticで表す。Primitiveの影に含まれる色も、参照ではなく生の値で書く。

```json
{
  "color": {
    "text": {
      "subtler": {
        "$type": "color",
        "$value": "{color.gray.600}",
        "$description": "説明・補助情報",
        "$extensions": { "ds": { "status": "stable" } }
      }
    }
  }
}
```

### Component・Patternのfrontmatter

```yaml
---
status: experimental
components:      # Patternだけ。使うComponentのフォルダ名
  - button
---
```

本文でTokenに触れる場合は、バッククォートで囲んだ名前（`` `color.text.subtle` ``）で書く。lintは本文からToken名を読み取って確かめる。

### Foundationの形式

UIがTokenを選ぶカテゴリ（Semanticのカテゴリと、Space・Size・Radius）ごとに、`foundation/<カテゴリ>.md`を1つ置く。ファイル名はカテゴリ名をkebab-caseにしたもの（`borderWidth` → `border-width.md`）。

中身は選び方だけにする。どの用途にどのTokenを使うか、候補が複数あるときの決め方、避ける使い方を書く。値は書き写さず、Token名で参照する。参照してよいのは、UIから選べるSemanticと寸法系のPrimitiveだけ。

### Componentの文書と仕様

Componentは`components/<name>/`のフォルダに、次の2つのファイルで定義する。フォルダ名はkebab-caseで、camelCaseにしたものが部品名になる。フォルダには他のファイルを置かない。

| ファイル | 内容 | 読み手 |
| --- | --- | --- |
| `README.md` | 部品の役割（タイトルの直後に1〜2文）、`## Usage`、`## Interaction`をこの順で書く | UIを作る人とAgent |
| `spec.json` | 部位、Variationの軸、指定 | Agent、lint、見本 |

Usageには、いつ使うか、近い部品との使い分け、避ける使い方を書く。Interactionには、キーボード、focus、読み上げなど操作に関わる指定を書く。見た目の指定は仕様に書き、Markdownに書かない。

仕様の形式：

```json
{
  "parts": {
    "tab": { "description": "1つのビューを表す押せる領域" },
    "label": { "parent": "tab", "description": "ビューの名前" }
  },
  "axes": { "state": ["default", "hovered", "selected"] },
  "spec": [
    { "part": "tab", "property": "minHeight", "token": "size.28" },
    { "part": "tab", "when": { "state": "selected" }, "property": "background", "token": "color.background.secondary.selected" }
  ]
}
```

- `parts`：部位のid（camelCase）。`parent`で親の部位を、`when`でその部位が存在する条件を書く。
- `axes`：Variationの軸と値。値はcamelCase。focusは軸にしない。
- `spec`：1要素に1つの指定。`when`のない指定はすべての組み合わせに当てはまる。`when`には軸ごとに値か値の配列を書く。同じ部位・property・組み合わせに当てはまる指定は1つだけにする。
- `property`：`background`、`color`、`borderColor`、`outlineColor`、`typography`、`minHeight`、`minWidth`、`maxWidth`、`size`、`paddingX`、`paddingY`、`paddingStart`、`paddingEnd`、`gap`、`radius`、`borderWidth`、`borderTopWidth`、`borderBottomWidth`、`outlineWidth`、`outlineOffset`、`opacity`のどれか。`borderWidth`は四辺、`borderTopWidth`と`borderBottomWidth`は一辺に線を描く。`outline*`はfocusの間だけ効く。一覧は`scripts/spec.mjs`で定める。
- `token`：Token名を1つ。参照ルールはComponentの指定と同じ。

lintは、軸の値のすべての組み合わせについて、各部位の`color`と、その部位か親の部位の`background`の組み合わせを求め、`contrast.json`にあるかを確かめる。背景が透明な場合や親がない場合は、`color.background.surface.*`の上に置かれるものとして扱う。focusの外周は、`outlineOffset`が負なら部位自身の背景、それ以外は親の背景と比べる。境界線は、その色が`contrast.json`の前景にある場合だけ、親の背景と比べる。入力欄の枠のように見えないと困る境界線の色は前景として登録し、区切り線のように消えても意味が変わらない境界線の色は登録しない。`opacity`で薄くした部位は無効状態として扱い、確かめない。

リファレンスの計測値や再現の制約はReferenceに書き、Componentには採用した定義だけを書く。

### Referenceの形式

リファレンス（サイトやアプリ）ごとに`references/<name>.md`を1つ作る。同じリファレンスの複数のページは、1つのファイルの「見る画面」にまとめる。ドメインが違う場合や、同じドメインでも用途が違う場合（宣伝サイトとアプリなど）は、別のファイルにする。

frontmatterに書く項目：

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `source` | 必須 | リファレンスのURL。見る画面のURLはすべてこの配下にする |
| `fidelity` | 必須 | どれだけ似せたいか。`inspire`（参考）か`match`（できる限り同じ）。意味はCONTRIBUTINGで定める |
| `access` | 任意 | 閲覧の条件（ログインが必要など） |

見出しは次の順にする。

| 見出し | 内容 |
| --- | --- |
| `## 用途` | 借りるもの、借りないもの、操作してよい範囲。借りないもの（ロゴ、イラスト、固有の文言、データなど）は必ず書く |
| `## 見る画面` | `id / URL / 見るもの`の表。idはcamelCase |
| `## 計測条件` | ファイル全体に共通する日付、環境、テーマ、計測方法、値の変換方法を、`項目 / 内容`の表で書く。表には`値の確かさ`の行を置き、`指定値`か`推定値`（推定値なら誤差の目安も）、計測していなければ`計測なし`と書く。意味はCONTRIBUTINGで定める |
| `## <対象>` | 観察した対象ごとに作る。対象は部品、Pattern、Foundationのカテゴリ、ふるまいなど。最初に`ページ：`に続けて観察したページのidを書き、`計測値 / 採用した定義 / 差・未採用`の表を置く。共通と違う条件で計測した場合は、その条件も書く |

採用した定義はToken名で書く。採用しなかった値も理由とともに残し、後で定義を追加するときの材料にする。

### コントラストの組み合わせ

`contrast.json`に、UIで重ねて使う前景と背景のSemanticの組み合わせ（`pairs`）と、求めるコントラスト比を書く。基準値はREADMEのDesign Principlesで定めた方針に従う。lintは両テーマで比を計算する。

- 前景には半透明の色を使わない。半透明の背景は、すべての`color.background.surface.*`に重ねた色で比を計算する。どの面に重ねても基準を満たす必要がある。
- 基準を下回る組み合わせは、`exceptions`に理由を書いた場合だけ残せる。判断の記録があれば`decision`にADRのパスを書く。基準を満たすようになった例外は残さない。

## 検証する不変条件

次の条件を`node scripts/lint.mjs`で検証する。違反がある状態で定義を確定しない。lint自体の変更は`node --test scripts/lint.test.mjs`で確認する。

- 参照ルールの表に従っている。生の値が許される場所はPrimitiveだけ。
- 命名規則に従っている。Primitiveに用途の語がなく、Semanticに部品名がない。
- 参照先が存在し、型が一致する。参照は1段で解決するため、循環は参照ルールにより起こらない。
- `tokens/`に規定外のファイルがない。
- light・darkのSemanticが同じTokenの集合を持つ。
- `stable`な定義が`experimental`な定義を参照していない。
- 役割系のPrimitiveで、参照されていないものが`stable`だけである。色の`stable`な段階はスケールの段階だけである。
- `deprecated`な定義に代わりの記載がある。
- Component・Patternの本文で参照するTokenが存在し、参照ルールに従う。frontmatterには規定の項目だけがある。
- Componentのフォルダに`README.md`と`spec.json`があり、`README.md`が必須の見出しを規定の順で持つ。
- Componentの仕様が規定の形式に従い、指定が重ならず、使われる色の組み合わせがすべて`contrast.json`にある。
- `color`型と`shadow`型のSemanticがテーマ別のファイルにある。
- `contrast.json`の組み合わせが、両テーマで求める比を満たす。満たさない組み合わせには理由付きの例外があり、不要な例外がない。
- Markdownの相対リンクの先が存在する。
- Referenceが規定のfrontmatterと見出しを持ち、計測条件に値の確かさがあり、採用した定義として書いたTokenが存在する。
- Tokenがあるカテゴリごとに、Foundationがある。FoundationはUIから選べるTokenだけを参照する。
- README.mdのIndexが、すべてのComponent、Pattern、Foundationにリンクしている。
