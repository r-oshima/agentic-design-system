---
name: design-system
description: プロダクトのUIを作るAgentが参照し、プロダクトと一緒に変えていくDesign Systemを扱う。リポジトリにDesign Systemがなければ新しく作り（DTCGのToken、層の参照規則、lintを備えた構造と、プロダクトに合わせたDesign Principles・Token・Foundation）、あればそれに沿ってUIを作る、足りない定義を足す、定義の状態を見直す。
---

# Design System

この文書では、このSkillのフォルダを`<skill>`と書く。

## どちらの手順を使うか

対象のリポジトリで、`README.md`、`ARCHITECTURE.md`、`CONTRIBUTING.md`、`tokens/`を持つフォルダを探す。既定は`docs/design-system/`。

| 状況 | 手順 |
| --- | --- |
| Design Systemがない。または新しく作るよう頼まれた | [create.md](create.md) |
| Design Systemがある。UIを作る、定義を足す・変える、状態を見直す | [operate.md](operate.md) |
| このSkill自体（`kernel/`、`guides/`、`create.md`など）を直す、と明示された。各プロジェクトで得た改善をSkillに取り込む依頼など | [MAINTAINING.md](MAINTAINING.md) |

Design Systemの定義や構造を直す依頼は、「構造」「規則」という言葉が出ても、Skill自体を直すと明示されていなければoperate.mdで扱う。Design Systemがあるのに作り直すよう頼まれた場合や、どちらか判断できない場合は、ユーザーに確かめる。
