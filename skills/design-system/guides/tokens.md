# Tokenを作る

形式と規則はkernelのARCHITECTUREに従う。ここでは、最初の組をどう選ぶかを書く。

## 状態

- `primitive.json`はファイル全体を`stable`にする。予約するスケールと、選んだ寸法の段階は、使われていなくても残す。
- スケールの間に置く色の段階は`experimental`にする。
- Semanticを置く3つのファイルは、ファイル全体を`experimental`にする。プロダクトで2つ以上の画面から使われたものから、人に確認して`stable`に上げる。

## Primitive

### 色

1. 系列を決める。ニュートラル1系列と強調色1系列から始め、必要な系列だけを足す。状態色（成功、エラーなど）は、最初の画面で使う場合だけ最初の組に入れる。系列を足したら、スケールの段階はほかの系列と同じく`stable`の予約にする。
2. `<skill>/scripts/color-scale.mjs`の入力を作る。
   - `anchors`：スケールの段階に置く値。ブランドの色や、リファレンスで計測した色のうち段階の位置に近いものを置く。
   - `hue`、`chroma`：anchorがない系列や、ニュートラルの色味を指定する場合に書く。
   - `extra`：スケールの段階のほかに使いたい色。リファレンスの計測値や、コントラストの基準を満たすために足す色。スケールと見分けられる差があれば、間の段階（`experimental`）として置かれる。
3. `node <skill>/scripts/color-scale.mjs <input.json> --out <file>`を実行し、出力を`primitive.json`の`color`に入れる。
4. 生成した段階は描画して確かめる。明るさの間隔が不揃いな場合や、色味が濁った場合は、anchorや`chroma`を直して作り直す。
5. `white`、`black`、`transparent`と、必要な半透明の色（`blackAlpha.4`、`whiteAlpha.5`など、番号は百分率）を足す。

### 寸法と文字

- 段階名は、カテゴリごとに出力先の`scripts/lint.mjs`で許された形にする。SpaceとSizeはpxの値を名前にする。
- Spaceは4pxか8pxを基準にした段階を置く。リファレンスがある場合は、計測値で足りないものを足す。
- Sizeは、操作の高さ、アイコンの大きさ、固定の幅など、実際に使う値だけを置く。
- Typographyの部品（`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`）は、使う組み合わせに必要な段階だけを置く。Typographyの複合Tokenは5つすべてを参照するため、字間を変えない場合も`letterSpacing.none`を置く。
- アイコンの大きさ（`iconSize.*`）のSemanticは、`size.*`を参照する。

## リファレンスがない場合

値は対象メディア、密度、Design Principlesから決める。計測値の代わりに、決めた理由をADRに残す。

- 最初に、本文の文字の大きさと、操作の高さを決める。他の段階はこの2つとの関係で決める。
  - 本文：情報を詰める業務ツールは13〜14px、読み物は16px以上を目安にする。
  - 操作の高さ：デスクトップは28〜36px、タッチは44px以上を目安にする。
- Spaceは4pxか8pxの基準から作り、操作の高さや文字の行の高さと割り切れる関係にする。
- 角丸は、操作の高さに対して控えめな段階から始める。
- 色は、ブランドの色かユーザーに聞いた色相から強調色の系列を作り、ニュートラルはその色相に寄せたごく弱い色味にする。
- 目安から選んだ値は、候補を2〜3個並べて実際の文言で描画し、比べて決める。描画せずに数値だけで決めない。

## Semantic

最初の組の目安を下に示す。プロダクトに合わない役割は作らず、足りない役割は足す。名前が役割に合わなければ変えてよい（例：主操作の上の文字が両テーマで白なら、`text.inverse`ではなく`text.onEmphasis`）。名前は`category.target.role[.state]`にし、部品名を入れない。

| カテゴリ | 最初の組の目安 |
| --- | --- |
| 面の背景 | `color.background.surface.default`、`sunken`、`raised`、`color.background.overlay` |
| 操作の背景 | `color.background.primary.*`、`secondary.*`、`ghost.*`（`ghost`は半透明の色にすると、どの面の上でも使える） |
| 文字 | `color.text.default`、`subtle`、`subtler`、`inverse` |
| アイコン | `color.icon.default`、`subtle`、`inverse` |
| 境界 | `color.border.subtle`（区切り線）、`focus`。入力欄の枠のように見えないと困る境界を使う場合は、別のSemanticを作り、`contrast.json`に前景として3:1で登録する |
| 文字の組 | `typography.label.sm`、`label.md`、`body.sm`など、用途の名前と大きさ |
| その他 | `opacity.disabled`、`borderWidth.divider`、`borderWidth.focus`、`focusOffset.outside`、`iconSize.default` |

- 文字の濃淡の段階は、コントラストの基準を両テーマで満たせる数だけにする。満たせない段階は作らない。
- 強調色は、主操作とfocusの外周に絞って割り当てる。

## contrast.json

- UIで重ねる予定の、前景（文字・アイコン・focusの外周）と背景の組み合わせをすべて書く。基準値は、Design Principlesの品質の基準に合わせる。
- lintが両テーマで比を計算する。満たさない組み合わせは、Primitiveの段階を足して参照先を変える。リファレンスがあり、その再現を優先して残す場合は、ユーザーに確認し、理由付きの例外とADRを書く。
