# 2. 如何提 Issue

模板参考 [oh-my-pi](https://github.com/can1357/oh-my-pi) 优质 closed issue 的**信息密度**，以及 [herdr](https://github.com/ogulcancelik/herdr) 的「事实优先、可复现」。

范例（omp）：

- Bug 质量标杆：[#5995](https://github.com/can1357/oh-my-pi/issues/5995)、[#6011](https://github.com/can1357/oh-my-pi/issues/6011)
- Feature 质量标杆：[#4815](https://github.com/can1357/oh-my-pi/issues/4815)、[#4983](https://github.com/can1357/oh-my-pi/issues/4983)、[#5793](https://github.com/can1357/oh-my-pi/issues/5793)

## 2.0 选模板（不是按 label 一张）

| 卡片 | 何时 |
|------|------|
| **Bug** | 错了、崩了、**回归**（含性能回归） |
| **Feature** | 新能力 / 用户向改进 |
| **Task / Refactor** | 重构、CI、文档、清理、**主动** perf 优化 |

`config.yml` 只负责关空白 Issue + 链接，不是第四种任务。

## 2.1 好 Issue 的共性（从 omp closed 归纳）

**标题：** 具体机制/症状，可检索（不是 “bug in chat”）。

**必有信息：**

1. **发生了什么**（Description / Current）  
2. **怎么稳定看到**（numbered Steps / deterministic repro）  
3. **权威期望**（Expected：必须怎样 / 禁止怎样）  
4. **环境**（版本、客户端/OS、相关组件）  
5. Feature/Task 还要 **Done when / acceptance**（可关单的清单）

**常见 optional（有再写，没有别空喊）：**

| Optional 块 | 何时有用 | omp 例子 |
|-------------|----------|----------|
| Error output / logs | 有堆栈、工具输出 | #5995, #5952 |
| Impact / why it matters | 安全、误导、无法自助 | #5995, #5907 |
| Evidence / measurements | perf、概率性、截图计数 | #6011, #5934 |
| Related / duplicate check | 易混 issue | #6011, #5996 |
| Suspected code paths | 已读源码 | #5995, #5934 |
| Suggested regression tests | 可写成测试契约 | #6011, #6003, #6004 |
| Workarounds | 临时绕过 | #5952, #5793 |
| Proposed approach | 方向建议，非长设计 | #5970, #5793 |
| Non-goals / out of scope | 控 PR 膨胀 | #4815, #4983 |
| Alternatives considered | Feature | #5578, #5793 |
| Area | 粗分模块 | omp 下拉；我们用自由文本 |

**不要：** 无复现的猜测；把多个不相关问题塞一条；用 Bug 表单装新功能。

## 2.2 Bug 字段

| 字段 | 必填 |
|------|------|
| Confirmation | 是 |
| Description | 是 |
| Steps to reproduce | 是 |
| Expected | 是 |
| Actual | 是 |
| Environment | 是 |
| Error / Impact / Evidence / Related / Suspected paths / Regression tests / Additional | 否 |

## 2.3 Feature 字段

| 字段 | 必填 |
|------|------|
| Description | 是 |
| Problem / use case | 是 |
| Done when | 是 |
| Non-goals / Proposed / Alternatives / Area / Additional | 否 |

## 2.4 Task 字段

| 字段 | 必填 |
|------|------|
| Goal | 是 |
| Done when | 是 |
| Background / Out of scope / How to observe success / Suspected / Additional | 否 |

## 2.5 提完

Milestone → Assignee → 一个 PR `Fixes #N`。

## 2.6 vs bd

GitHub Issue = 人类协作；bd = 本地 agent 树。
