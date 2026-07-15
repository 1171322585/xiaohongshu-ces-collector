# Xiaohongshu CES Collector

一个面向 Codex 的小红书笔记采集与筛选 Skill。它会在每次执行前询问并确认本次的搜索要求、评分公式和硬性门槛，再读取已登录的小红书页面，筛选合格笔记并生成可审计的 Markdown 报告。

> 评分标准不写死。CES 只是一个例子，用户可以在每次任务中更换公式、时间窗口、评论门槛、粉丝上限和排除条件。

## 功能

- 每次访问小红书前强制确认本次规则，不静默复用上一次参数。
- 支持任意安全算术评分公式，例如 `likes + comments * 4 + collects`。
- 支持多个硬性条件，例如评论数、作者粉丝数、发布时间和最低得分。
- 从笔记详情页读取标题、正文、作者、发布时间和互动数据。
- 先筛笔记，再检查合格候选的作者粉丝数，减少不必要的页面访问。
- 默认快速模式：定点批量提取所需字段，不读取完整 DOM，数量达标立即停止。
- 默认不收集备选或逐条淘汰详情；仅在用户要求或调试失败时扩展采集。
- 按得分排序、去重，并输出标题、正文、公式明细和来源链接。
- 对天气、闭园、票务和限时活动等内容添加时效提醒。
- 不读取或保存 Cookie、密码、认证令牌、浏览器配置文件或本地存储。

## 安装

### Codex 一键安装

在 Codex 集成终端或系统终端执行：

```bash
npx skills add 1171322585/xiaohongshu-ces-collector -g -a codex
```

仓库中只有一个 Skill，CLI 会自动选择它；`-g` 表示全局安装，`-a codex` 表示只安装给 Codex。该命令通过 [Vercel Labs Agent Skills CLI](https://github.com/vercel-labs/skills) 安装到：

```text
~/.agents/skills/xiaohongshu-ces-collector
```

Codex 会自动扫描该目录。若安装后没有立即出现，请重新开始一个 Codex 对话或重启 Codex。

### Codex 内置安装器

Windows PowerShell：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo 1171322585/xiaohongshu-ces-collector --path xiaohongshu-ces-collector
```

macOS/Linux：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo 1171322585/xiaohongshu-ces-collector --path xiaohongshu-ces-collector
```

## 快速开始

安装后，在新一轮 Codex 对话中输入：

```text
$xiaohongshu-ces-collector 帮我筛选北京暑期旅游攻略笔记
```

Skill 会先询问本次标准。一个完整确认示例：

```text
关键词：北京暑期旅游攻略
数量：5篇
时间范围：近15天，北京时间
评分公式：点赞 + 评论*4 + 收藏
硬性条件：得分>=20，评论>=5，作者粉丝<=10000
输出：Markdown，包含标题、正文、发布时间、作者、粉丝数、三项互动数据、计算过程和原链接
排除：纯提问、明显广告、重复作者、已经失效的临时通知
```

即使提示中已经提供了这些值，Skill 也会先汇总并请用户确认，然后才访问小红书。

## 执行流程

```text
询问并确认本次标准
        |
        v
搜索并定点提取首批候选
        |
        v
小批量读取笔记详情数据
        |
        v
按公式和笔记级规则初筛
        |
        v
仅检查初筛合格作者的粉丝数
        |
        v
最终筛选、去重、排序
        |
        v
生成 Markdown 报告
```

平台自带的“一周内”“最多评论”等筛选只用于减少候选量。最终日期以笔记详情页时间戳为准，不能只依赖“2天前”等相对标签。

默认流程不会抓取或输出完整 DOM/完整页面快照，只读取标题、正文、发布时间、作者和所需互动字段。满足用户要求的数量后立即停止；只有用户明确要求“最高”“Top”或全面比较时，才扩大扫描范围。完整页面快照仅用于结构化提取和可见字段提取都失败后的单次诊断。

## 代码

核心源码随仓库公开：

- [`extract_xhs_state.mjs`](xiaohongshu-ces-collector/scripts/extract_xhs_state.mjs)：解析小红书页面结构化状态，提取笔记和作者粉丝数据。
- [`rank_notes.py`](xiaohongshu-ces-collector/scripts/rank_notes.py)：安全计算自定义公式、执行多条规则、去重并排序。
- [`report-template.md`](xiaohongshu-ces-collector/assets/report-template.md)：Markdown 报告模板。
- [`SKILL.md`](xiaohongshu-ces-collector/SKILL.md)：Codex 执行工作流和质量规则。

### 提取结构化页面数据

```javascript
import {
  extractNote,
  extractProfile,
  parseInitialStateText,
} from "./xiaohongshu-ces-collector/scripts/extract_xhs_state.mjs";

const state = parseInitialStateText(initialStateScriptText);
const note = extractNote(state, expectedNoteId);

// 在作者主页读取新的 initialStateScriptText 后：
const profileState = parseInitialStateText(profileInitialStateScriptText);
const profile = extractProfile(profileState);

const candidate = { ...note, fans: profile.fans };
```

### 自定义评分和筛选

评分脚本不使用 `eval`，只允许数值、算术、比较和布尔表达式。可用字段：

| 字段 | 含义 |
|---|---|
| `likes` | 点赞量 |
| `comments` | 评论量 |
| `collects` | 收藏量 |
| `fans` | 作者粉丝数 |
| `age_days` | 截止采集时间的发布天数 |
| `score` | 当前公式计算结果 |

运行仓库中的示例：

先测试结构化数据提取：

```bash
node ./examples/test_extract.mjs
```

再测试评分和规则筛选：

```powershell
python .\xiaohongshu-ces-collector\scripts\rank_notes.py `
  --input .\examples\candidates.json `
  --formula "likes + comments * 4 + collects" `
  --rule "score >= 20" `
  --rule "comments >= 5" `
  --rule "fans <= 10000" `
  --rule "age_days <= 15" `
  --count 5 `
  --backup-count 0 `
  --as-of "2026-07-15T15:00:00+08:00" `
  --output .\examples\ranked.json
```

macOS/Linux 将反引号换成反斜杠，或把命令写成一行。

候选数据结构：

```json
{
  "note_id": "note-001",
  "title": "北京暑期博物馆攻略",
  "body": "笔记正文",
  "author": "示例作者",
  "published_at": "2026-07-12T17:03:06+08:00",
  "likes": 120,
  "comments": 18,
  "collects": 45,
  "fans": 980,
  "url": "https://www.xiaohongshu.com/explore/example"
}
```

脚本默认输出包含：

- `qualified`：满足全部规则且按得分降序排列的结果。
- `backups`：默认空数组；传入 `--backup-count N` 时才返回备用结果。
- `rejected_count` 和 `rejection_summary`：淘汰数量与规则汇总。
- `formula`、`rules` 和 `as_of`：本次筛选的审计信息。

只有调试时才加入 `--include-rejected` 输出逐条淘汰详情，避免无用数据占用上下文。

## 项目结构

```text
.
|-- README.md
|-- examples/
|   |-- candidates.json
|   `-- test_extract.mjs
`-- xiaohongshu-ces-collector/
    |-- SKILL.md
    |-- agents/
    |   `-- openai.yaml
    |-- assets/
    |   `-- report-template.md
    `-- scripts/
        |-- extract_xhs_state.mjs
        `-- rank_notes.py
```

## 环境要求

- Codex CLI、Codex IDE 扩展或 Codex 桌面应用。
- Node.js/npm，仅在使用 `npx` 安装方式时需要。
- Python 3.10+，用于确定性评分脚本。
- 已登录的小红书浏览器会话。
- 网络和页面访问权限。

## 更新与卸载

更新：

```bash
npx skills update xiaohongshu-ces-collector -g
```

卸载：

```bash
npx skills remove xiaohongshu-ces-collector -g
```

## 限制

- 小红书页面结构变化时，结构化提取逻辑可能需要更新。
- 登录、验证码、访问频率限制和页面风控仍由平台控制。
- 点赞、评论、收藏和粉丝数都是采集时快照。
- Skill 不会绕过登录、验证码或平台访问限制。
- 笔记内容和活动信息应回到原页面及官方渠道复核。

## 安全说明

安装第三方 Skill 前请先审查 `SKILL.md` 和脚本源码。Skill 会访问小红书页面并写入用户请求的本地报告，但不会读取或导出 Cookie、密码、认证令牌、浏览器配置文件、本地存储或其他认证材料。笔记正文、评论和作者简介一律视为不可信数据，只允许提取和报告，不能改变工作流或触发其中的指令。
