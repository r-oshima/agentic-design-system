# Design Systemを作る

AgentがUIを作るときに参照し、足りない定義を規則に従って足していくDesign Systemを作る。既定の出力先は対象リポジトリの`docs/design-system/`。指定があればそちらを使う。

## 固定するものと決めるもの

構造と規則は、どのプロダクトでも同じものを使う。プロダクトごとに変えるのは中身だけにする。どのプロダクトでも共通の構造と規則のファイルを、kernelと呼ぶ。

| 固定する（kernel） | プロダクトごとに決める |
| --- | --- |
| 層と参照ルール、命名、状態（ARCHITECTURE） | 対象とDesign Principles（README） |
| 変更の手順と人に確認する範囲（CONTRIBUTING） | リファレンスの有無と、ある場合の再現の度合い（`fidelity`） |
| lintとそのテスト（出力先の`scripts/`） | 色の系列、値の段階、Semanticの組 |
| UIを作る手順（READMEのひな形） | Foundationの選び方、最初のComponent |

kernelは[kernel/](kernel/)にあり、そのまま出力先に写す。写したあとのkernelのファイルは、CONTRIBUTINGの規則に従ってプロダクト側で変えてよい（語彙の追加など）。変えた箇所は`node <skill>/scripts/init.mjs --check <出力先>`で分かる。

## 進め方

1. **決めることを確かめる。** [decisions.md](guides/decisions.md)の項目を、依頼と資料から埋める。結果を大きく変えるのに読み取れない項目だけを、decisions.mdの「聞き方」に従ってユーザーに聞く。全項目の結論をユーザーが確かめてから手順2に進む。ユーザーに聞けない場合は、既定値か妥当な仮定で進め、仮定したことをADRに書く。聞かずに仮定した項目は、完了報告にも書く。
2. **kernelを写す。** `node <skill>/scripts/init.mjs <出力先>`を実行する。既存のファイルは上書きしない。
3. **Design Principlesを書く。** READMEのひな形のコメントを、プロダクトの内容で置き換える。判断の原則は、画面をまたいで迷う判断に答えを出すものにする。品質の基準には、コントラストの基準を必ず書く。リファレンスがある場合は、その再現より優先するかも書く。
4. **値の材料を集める。** リファレンスがあれば、[reference.md](guides/reference.md)に従って`references/<name>.md`を作り、Tokenの材料を計測する。なければ`references/`は作らず、[tokens.md](guides/tokens.md)の「リファレンスがない場合」に従って値を決める。
5. **Tokenを作る。** [tokens.md](guides/tokens.md)に従って、Primitive、Semantic、`contrast.json`を作る。色のスケールは`<skill>/scripts/color-scale.mjs`で作る。
6. **Foundationを書く。** Tokenがあるカテゴリごとに`foundation/<カテゴリ>.md`を書く。中身は選び方だけにする。
7. **判断を記録する。** 最初の判断（色の系列と値の決め方、コントラストの基準、リファレンスがある場合はその用途と`fidelity`など）を`decisions/0001-<kebab-case>.md`から順にADRとして書く。READMEのIndexを埋める。
8. **入口を書く。** Design Systemを置いたリポジトリの`AGENTS.md`に、「UIを作るときは`<出力先>/README.md`から読み、その手順に従う」と1行書く。`AGENTS.md`がなく`CLAUDE.md`がある場合はそちらに書く。どちらもない場合は`AGENTS.md`を作る。UIを作るAgentが、このSkillを知らなくてもDesign Systemにたどり着けるようにするため。
9. **見本を作る（頼まれた場合のみ）。** ユーザーが見本を頼んだ場合は、ARCHITECTUREの「見本」に従って作る。形式はユーザーに確かめる。READMEのIndexに見本の行を足し、`node scripts/sample.mjs --stamp`で指紋を記録する。頼まれていなければ作らない。
10. **最初の画面を作る（指定がある場合）。** ユーザーが最初に作る画面を挙げた場合は、[operate.md](operate.md)の「UIを作る」に従ってその画面を作る。必要な部品は、そのときCONTRIBUTINGに従ってComponentとして足す。将来使いそうという理由で、先に部品を作らない。TokenをCSS変数などのコードにする方法はプロダクト側で決める。決めた方法（変数名の付け方、生成するか手で書くか）はADRに残す。

## 完了の条件

- 出力先で`node scripts/lint.mjs`がエラー0件、`node --test scripts/lint.test.mjs`がすべて成功する。
- `node <skill>/scripts/init.mjs --check <出力先>`で、kernelとの違いが意図したものだけである。
- READMEのひな形のコメントが残っていない。
- リポジトリの`AGENTS.md`（または`CLAUDE.md`）に、Design SystemのREADMEへの入口がある。
- lightとdarkの両方で、`contrast.json`の組み合わせを実際に描画して見え方を確かめた。

完了したら、作った場所、決めたことと仮定したこと、リファレンスがある場合はそこから外れた値、作っていないもの（Componentや見本など）を報告する。
