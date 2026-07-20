# 3. 如何提 Pull Request

模板：`.github/pull_request_template.md`  
流程：[01-dev-workflow.md](./01-dev-workflow.md)

合入用 **`Fixes #N`** 关 Issue。PR **base 选 `dev`**（不要默认合 `main`）。

## 3.1 开 PR 前

- 已有 Issue 并认领  
- 分支从 **`dev`** 拉出  
- 只含这一件 Issue  
- 工作区干净；能解释自己的改动  

## 3.2 REQUIRED（每次）

| 区块 | 写什么 |
|------|--------|
| **What** | 合入后变什么 |
| **Why** | 动机 / 根因 |
| **Issue** | `Fixes #N` |
| **How to test** | 步骤 + 命令 |
| **Checklist** | 一 Issue、无密钥垃圾、已测或说明 |

## 3.3 RECOMMENDED EXTRAS（可选）

模板底部 HTML 注释里有可复制块。规则：

1. **适用才贴进正文**；不贴空标题。  
2. 正文用干净标题：`## Screenshots`（不要 `## Screenshots (optional)`）。  
3. 「何时用」写在注释 / 下表，不写进标题。

| 章节 | 推荐使用时机 |
|------|----------------|
| **Screenshots** | UI 改动，diff 看不出效果 |
| **Risk** | 迁移、数据形态、难 revert、安全敏感 |
| **Changelog** | 用户可见行为/API 变化 |
| **Notes for reviewers** | 边角、请重点看某处、后续 Issue |

Demo PR 可以故意带上 extras；日常 PR 按需使用。

## 3.4 CI / Review

红了同分支修。Reviewer 看是否对上 Issue、范围、测试是否可信。合入目标是 **`dev`**。
