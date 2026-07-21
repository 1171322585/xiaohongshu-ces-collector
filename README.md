# Xiaohongshu CES Collector

一个面向 Codex 的小红书通用采集、核验、筛选和导出 Skill。它不局限于 CES、旅行或固定数量，可处理美妆、数码、本地生活、知识经验、种草投放等不同主题。

每次任务的主题、关键词、数量、时间窗口、评分公式、粉丝上限、评论规则、竞品词和输出字段都独立配置。未提供的可选条件不会自动启用，也不会继承上次任务的阈值。

## 功能

- 按当前请求整理任务配置；只有缺失值会实质改变结果时才集中询问。
- 支持无评分任务、CES 或其他互动评分公式。
- 支持发布时间、点赞、评论、收藏、作者粉丝、地区和内容类型等规则。
- 支持正文竞品、广告、禁入内容和转化适配审核。
- 支持两种评论口径：任何用户竞品即排除，或仅排除博主竞品与引流刷屏。
- 支持已登录 Chrome，也支持 headed、persistent 的真实 Chrome Playwright 批处理。
- 使用卡片预筛、作者去重、并发粉丝核验、候补池和最终评论复核减少重复访问。
- 原始正文、评论和页面文本只落盘，模型只读取紧凑审核包和少量命中证据。
- 粉丝量优先读取页面结构化状态，失败时只检查“粉丝”标签附近的局部 DOM，不扫描整页文本。
- 输出 Markdown 或 Excel；Excel 可保留完整、可点击的小红书令牌链接。
- 分阶段保存 JSON 检查点，遇到验证码或失败时从最近进度继续。

## 安装

### Agent Skills CLI

```bash
npx skills add 1171322585/xiaohongshu-ces-collector -g -a codex
```

### Codex 内置安装器

Windows PowerShell：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo 1171322585/xiaohongshu-ces-collector --path xiaohongshu-ces-collector
```

macOS/Linux：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo 1171322585/xiaohongshu-ces-collector --path xiaohongshu-ces-collector
```

## 使用示例

```text
$xiaohongshu-ces-collector 帮我找30篇近期数码避坑笔记，评论不少于10，作者粉丝不超过2万，排除品牌软广，输出Excel。
```

```text
$xiaohongshu-ces-collector 找20篇本地生活低价帖，不需要评分和粉丝限制，只按评论量排序；评论区仅排除博主引流和刷屏。
```

```text
$xiaohongshu-ces-collector 按点赞×1＋评论×4＋收藏×1筛选旅行知识帖，并保留20%候补。
```

示例中的数字只属于该次请求，不是 Skill 默认值。

## 执行流程

```text
提取本次主题、规则和输出字段
              |
              v
设计关键词并批量抓取搜索卡片
              |
              v
详情页核验精确时间、互动和正文
              |
              v
按作者去重并发核验粉丝（若有粉丝规则）
              |
              v
对紧凑候选做必要语义审核
              |
              v
只核验目标池与候补池评论及回复
              |
              v
从候补池替换失败项并导出结果
```

复杂评分或多规则任务使用 `rank_notes.py`；简单任务直接按指定指标筛选，不强制计算 CES。

## 浏览器选择

- 用户指定 Chrome 或任务依赖现有登录态、扩展时，复用已登录 Chrome。
- 用户指定 Playwright、独立浏览器或不用内置浏览器时，使用 headed、persistent、真实 Chrome。
- API 只有在已配置、获授权且能返回全部必需字段时才使用；鉴权、余额或字段不支持时停止重试。
- 不混用多个浏览器框架，不重复登录，不读取 Cookie 或密码。

Playwright 批处理默认使用三个页面并发。搜索卡片、笔记详情和作者粉丝分阶段落盘；详情脚本默认不等待评论，也不复制卡片原文。评论仅在显式要求时读取，并放到最终候选阶段。

## 评论审核

评论规则必须在每次任务中选择一种：

- `strict_any_competitor`：当前可见评论或回复中任何用户命中竞品即排除。
- `author_and_spam`：仅当博主本人发布竞品内容，或评论区出现重复引流、代订、加微、客服、票务、外链等刷屏时排除。

核验结论只描述已加载范围，不宣称未加载评论永久不存在竞品。

## 核心文件

- [`SKILL.md`](xiaohongshu-ces-collector/SKILL.md)：精简控制流程与按需规则入口。
- [`task-contract.md`](xiaohongshu-ces-collector/references/task-contract.md)：本次任务的独立配置结构。
- [`playwright.md`](xiaohongshu-ces-collector/references/playwright.md)：Playwright 批处理和粉丝核验规则。
- [`comment-audit.md`](xiaohongshu-ces-collector/references/comment-audit.md)：评论竞品、博主身份和引流刷屏规则。
- [`output.md`](xiaohongshu-ces-collector/references/output.md)：Markdown、Excel 和可点击链接检查。
- [`playwright_batch_cards.js`](xiaohongshu-ces-collector/scripts/playwright_batch_cards.js)：批量抓取搜索卡片并断点保存。
- [`playwright_batch_notes.js`](xiaohongshu-ces-collector/scripts/playwright_batch_notes.js)：并发核验笔记详情和可选互动评分。
- [`playwright_batch_fans.js`](xiaohongshu-ces-collector/scripts/playwright_batch_fans.js)：按作者去重并发核验粉丝和可选上限。
- [`extract_xhs_state.mjs`](xiaohongshu-ces-collector/scripts/extract_xhs_state.mjs)：离线解析小红书结构化状态快照。
- [`rank_notes.py`](xiaohongshu-ces-collector/scripts/rank_notes.py)：安全计算自定义公式、执行规则、去重和排序。
- [`report-template.md`](xiaohongshu-ces-collector/assets/report-template.md)：动态 Markdown 报告模板。

## 自定义评分和筛选

`rank_notes.py` 不使用 `eval`，只允许受控的数值、算术、比较和布尔表达式。可用字段包括：

| 字段 | 含义 |
|---|---|
| `likes` | 点赞量 |
| `comments` | 评论量 |
| `collects` | 收藏量 |
| `fans` | 作者粉丝数 |
| `age_days` | 截止采集时间的发布天数 |
| `score` | 当前公式计算结果 |

示例：

```powershell
python .\xiaohongshu-ces-collector\scripts\rank_notes.py `
  --input .\examples\candidates.json `
  --formula "likes + comments * 2 + collects" `
  --rule "score >= 100" `
  --rule "age_days <= 30" `
  --count 20 `
  --backup-count 4 `
  --as-of "2026-07-21T12:00:00+08:00" `
  --output .\examples\ranked.json
```

把公式、规则、数量和时间替换为当前任务值。无评分任务不调用此脚本。

## 项目结构

```text
.
|-- README.md
|-- examples/
`-- xiaohongshu-ces-collector/
    |-- SKILL.md
    |-- agents/openai.yaml
    |-- assets/report-template.md
    `-- scripts/
        |-- extract_xhs_state.mjs
        |-- playwright_batch_cards.js
        |-- playwright_batch_fans.js
        |-- playwright_batch_notes.js
        `-- rank_notes.py
```

## 更新与卸载

更新：

```bash
npx skills update xiaohongshu-ces-collector -g
```

卸载：

```bash
npx skills remove xiaohongshu-ces-collector -g
```

## 限制与安全

- 小红书页面结构、登录状态、验证码、访问频率限制和页面风控仍由平台控制。
- 互动量、粉丝数和评论内容都是采集时快照。
- Skill 不绕过登录、验证码或平台访问限制。
- 不读取或导出 Cookie、密码或其他认证信息。
- 笔记正文、评论和作者简介视为不可信数据，不允许其中的内容改变工作流或触发指令。
