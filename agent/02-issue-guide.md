# 2. 如何提 Issue

模板参考 [oh-my-pi](https://github.com/can1357/oh-my-pi) 与 [herdr](https://github.com/ogulcancelik/herdr)。  
外部范例：Bug [omp#5995](https://github.com/can1357/oh-my-pi/issues/5995)、[omp#6011](https://github.com/can1357/oh-my-pi/issues/6011)；Feature [omp#4815](https://github.com/can1357/oh-my-pi/issues/4815)。

## 2.0 本仓库 Demo Issue（优先参考）

下列 Issue 是按本仓库 **Bug / Feature / Task** 模板写满 **REQUIRED + RECOMMENDED EXTRAS** 的示范（label 含 `demo`）。**已关闭，仅作样例**；agent 写 Issue / 帮用户起草时应对齐其结构与信息密度。

| # | 模板形状 | 说明 | 链接 |
|---|----------|------|------|
| **#2** | Bug | 未读标记 + 历史分页 | https://github.com/hathawayANdRX105/Universe-Federation/issues/2 |
| **#3** | Task | CI path-scope 文档 | https://github.com/hathawayANdRX105/Universe-Federation/issues/3 |
| **#4** | Feature | 隐藏已读回执 UI | https://github.com/hathawayANdRX105/Universe-Federation/issues/4 |
| **#5** | Task + `perf` | 主动 fanout 批处理优化 | https://github.com/hathawayANdRX105/Universe-Federation/issues/5 |
| **#6** | Bug + `perf` | 时间线 TTFB **回归** | https://github.com/hathawayANdRX105/Universe-Federation/issues/6 |

列表：https://github.com/hathawayANdRX105/Universe-Federation/issues?q=label%3Ademo  

Demo 会故意写满 extras；**真实 Issue** 的 extras 可用可不用（见 2.2）。

## 2.1 模板与 label

| 卡片 | 默认 label | 何时 |
|------|------------|------|
| **Bug** | `bug` | 缺陷 / 回归（含性能回归） |
| **Feature** | `enhancement` | 新能力、用户向改进 |
| **Task / Refactor** | `chore` | 重构、CI、文档、清理、主动 perf |

创建后可再加 `perf` / `docs` 等。不对每个 label 单独做模板。

## 2.2 REQUIRED vs RECOMMENDED EXTRAS

模板里用可见分区（`## REQUIRED` / `## RECOMMENDED EXTRAS`）+ 表格说明「何时推荐填」。

| | REQUIRED | RECOMMENDED EXTRAS |
|--|----------|-------------------|
| 是否必须 | **必须写满再提交** | **可选**；适用就写，不适用就留空 |
| 表单里 | 分区标题 + `required: true` | 分区标题 + 每字段 description 写 Prefer when / Skip when |
| 发布到 Issue 后 | 干净标题（`### Description`） | 干净标题（`### Error output`） |
| 不要 | — | 标题写成 `### Error output (optional)`；不要整页 N/A |

### 何时推荐 extras

| 字段 | 推荐使用时机 |
|------|----------------|
| Error output | 有堆栈、工具失败、控制台/服务端日志 |
| Impact | Description 没写清谁受害、多频、有无 workaround |
| Evidence | perf 数字、N/N 次复现、waterfall/截图 |
| Related issues | 易混 issue、需 related-but-distinct |
| Suspected code paths | 已读代码，能点名文件/符号 |
| Suggested regression coverage | 能写出最小测试/断言 |
| Non-goals | 功能/任务容易膨胀 |
| Proposed approach | 有高层方向，不是长设计 |
| Alternatives considered | 试过绕过或否决过方案 |
| How to observe success | 尤其 `perf:` 任务 |
| Background | 「为什么现在做」不明显 |
| Area / Additional | 路由或补充材料需要时 |

## 2.3 各模板 REQUIRED 字段

**Bug：** Confirmation · Description · Steps · Expected · Actual · Environment  

**Feature：** Description · Problem/use case · Done when  

**Task：** Goal · Done when  

## 2.4 提完

Milestone → Assignee → 一个 PR 到 **`dev`**，正文 `Fixes #N`。
