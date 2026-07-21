# 1. 如何参与项目开发

参考 [Misskey CONTRIBUTING](https://github.com/misskey-dev/misskey/blob/develop/CONTRIBUTING.md) 与常见 GitHub 协作习惯，结合本仓库实践。

## 1.1 标准流程

```text
Issue（讨论/认领）
  → fork 或本仓分支（有写权限用本仓分支即可）
  → 从最新 dev 拉分支
  → 本地开发（只做这一件 Issue）
  → 自测 / 清理工作区
  → 开 PR 到 dev（Fixes #N 或 Related #N）
  → PR CI / Actions
  → 失败则同分支修 → push → 再跑
  → Review
  → 修改后再次 CI / Review
  → 合并进 dev → 带 Fixes 的 Issue 关闭
```

稳定后由维护者再把 **`dev` → `main`**（你不日常直推 `main`）。

| 阶段 | 做什么 | 不要做什么 |
|------|--------|------------|
| Issue | 说清问题/目标，挂 Milestone，可认领 | 没 Issue 就大改代码 |
| 分支 | 从 **`dev`** 拉 `fix/12-short-name` | 直推 `main` 或 `dev` |
| 开发 | 只改本 Issue 范围 | 顺手重构半个 monorepo |
| PR | 一 PR 一主 Issue；**base = `dev`** | 默认往 `main` 合；无 Issue 号 |
| CI | 看红灯，修到绿或说明阻塞 | 无视 Actions 硬求合 |
| Review | 按评论改；范围外新开 Issue | 在 PR 里塞新需求 |

### 没有写权限时

1. Fork 本仓库。  
2. 在 fork 上从 upstream **`dev`** 开分支、推送。  
3. 向本仓库 **`dev`** 开 PR。  
4. 流程其余相同。

### 有写权限时

不必 fork；本仓从 **`dev`** 开分支 + PR 到 **`dev`** 即可。**禁止直推 `main` 与 `dev`。**

## 1.2 先 Issue，再拆小

**实现前先有 Issue**（Misskey 也要求先讨论设计/目标，否则 PR 易被拒）。

| 好 | 坏 |
|----|-----|
| 一个可独立合并的改动 = 一个 Issue | 「重构后端 + 修 5 个 bug」一条 Issue |
| 大需求拆成多条 Issue，多条 PR | 一个 PR 绑 `#1 #2 #3` 混装且无法单独回滚 |
| PR 写清关联：`Fixes #12` 或 `Related #12` | PR 无 Issue、或关一堆无关号 |

**拆分标准：** 一个 PR 能否单独 review、单独回滚、单独通过 CI？不能就再拆。

**认领：** Issue `Assignee` 写自己 = 已领；未 Assignee = 可领。一人一条。

可选：用 Milestone 管批次，用 Project 看板看 Todo / 进行中 / 完成（见 `02-issue-guide.md`）。

### 聚合预览 PR（可选）

大清理/多刀改动时，可以：

1. 每刀仍对应 **一条 GitHub Issue**（Goal / Done when / Status）。  
2. 本地多分支或同预览分支多次提交。  
3. 开 **一条** 指向 `dev` 的集成 PR，正文用 `Related #N` 列出各刀（需要自动关单时再对主 Issue 用 `Fixes #N`）。  
4. **未准备合并前**不要写一堆 `Fixes`，避免半成品把 Issue 关掉。

## 1.3 开发时保持仓库干净

| 可以 | 不可以 |
|------|--------|
| 改 Issue 相关源码/测试/必要文档 | 随手新建无关目录、dump 文件 |
| 更新 Issue 要求的配置 **示例**（`config/` 下 example） | 提交真实 `config/*`、密钥、token、用户数据 |
| 本地装依赖、跑测试 | 把 `node_modules/`、构建产物、本地工具缓存目录提交进库 |
| 临时调试 | 把调试脚本/日志永久留在仓库根目录 |

提交前自检：

```text
git status          # 只有本 Issue 相关文件
git diff            # 无无关格式化/大清理
```

多余文件：`gio trash` 或移出仓库；不要 `git add .` 一把梭。

## 1.4 分支：`dev` 与 `main`

```text
feature/fix/docs/*  ──PR──►  dev  ──稳定后──►  main
```

| 分支 | 角色 |
|------|------|
| **`dev`** | 日常集成线。从这里开分支，PR 也合回这里。 |
| **`main`** | 稳定线。不要日常 PR 进 `main`；由维护者在 `dev` 稳定后合并。 |
| 旁支如 `ci/actions-wip` | 试验/历史用，不是默认合入目标。 |

功能/修复：**从最新 `dev` 开分支**，定期 rebase/merge `dev` 减少冲突。  
合入路径：**只通过 PR 进 `dev`**。

## 1.5 CI / Actions 与修红灯

开 PR（**base = `dev`**）后，以 **GitHub Actions** 为准，不要只靠本地感觉。

### 会跑什么（当前）

| Workflow | 何时 | 作用 |
|----------|------|------|
| **CI - PR Gate** | 几乎每个 PR | Lint、misskey-js、megalodon 等快速门禁 |
| **CI - PR Validation** | 几乎每个 PR | 按改动路径选择性跑 unit / typecheck / API e2e / **container smoke** 等 |
| **CI - Integration** | 默认 skip；需 label 等条件 | 浏览器 e2e、federation 等重活 |

路径分类由 `scripts/ci-changed-scopes.py` 决定：只改文档时很多 job 会 skip；改 `Dockerfile` / `config/` / compose 等可能触发 **container smoke**。

### 推荐节奏（提高效率）

1. **先开 Issue，再开分支，再 push 出 PR**（尽早有 check 页面）。  
2. **本地做完一小刀就 commit + push**，不要攒巨大未推送 diff。  
3. **不要死等**：push 后去做下一刀本地准备；过一段时间再 `gh pr checks` / 网页看结果。  
4. **红了只修同一 PR 分支**，再 push；每修一刀对应一次新的 Actions 跑次。  
5. 绿了再要 review / 合并；CI 仍红且无说明时不要硬求合。

### 怎么查失败

```text
# 看 PR 上各 job 状态
gh pr checks <N>

# 最近 runs
gh run list --branch <your-branch> --limit 10

# 拉失败日志（run id 来自上面）
gh run view <run-id> --log-failed
```

网页：PR → **Checks** / **Actions**。

### 修 CI 时的原则

| 做 | 不做 |
|----|------|
| 先读失败 job 名与日志末尾真实 error | 凭猜乱改无关文件 |
| 根因在路径/挂载/导入时改**契约源**（config 默认路径、compose mount、测试 import） | 只改本地能过、CI 环境仍错的特判 |
| 修完单独 commit，message 写清修的是哪个 check | 把无关重构塞进 fix CI 提交 |
| 需要跟踪时再开 **Bug** Issue（`fix(ci): …`）并 `Related`/`Fixes` | 静默修完不留记录 |

典型根因类型：

- **路径搬迁**：测试仍 import 旧路径（如 `locales/zh-CN.yml` → `locales/upstream/…`）。  
- **容器契约**：应用默认读 `/sharkey/config`，CI 仍 mount `/sharkey/.config`。  
- **范围误触发**：`Dockerfile` / `deploy/compose/*` / `scripts/healthcheck.sh` 会触发 container smoke；`config/*` 走 shared（unit/typecheck 等），不单独等于 container smoke。

### Review 与合并

1. Reviewer 看：是否对上 Issue、范围、明显 bug/安全。  
2. **PR Validation + PR Gate 绿**（或失败已说明且可接受 skip）后再合。  
3. 合并进 **`dev`**；正文含 `Fixes #N` 的 Issue 会自动关。  
4. **`main` 不日常合**；稳定后再由维护者 `dev` → `main`。

## 1.6 一句话给成员

> 找/开 Issue → Assignee 自己 → 从 **dev** 开分支 → PR 到 **dev** 写 `Fixes #编号` 或 `Related #编号` → push 触发 Actions → 红了同分支修再 push → 绿了再 Review/合并。  
> 一个 PR 只干一件事（或明确的集成预览）；仓库不留垃圾文件；**不要动 main。**

## CI scopes (when jobs run)

Checks are **path-scoped** against the PR base (`dev...HEAD`), not “always full suite”.

| Workflow (Checks title) | Runs when |
|-------------------------|-----------|
| **Quality** | Non-doc code/tooling changes need lint and/or package tests |
| **Validate** | Diff touches backend/frontend/shared/container/etc. — each job only if its scope is true |
| **Integration** | Manual/`main`/schedule, or PR labeled `run-integration` |

Docs/agent/README-only PRs should skip Quality package jobs and Validate test matrices (summary jobs stay green).
