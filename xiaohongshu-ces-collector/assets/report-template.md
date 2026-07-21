# {{TOPIC}}：小红书笔记筛选报告

> 搜索关键词：`{{KEYWORDS}}`
> 筛选/评分口径：{{SCORING_OR_FILTER_RULES}}
> 硬性条件：{{RULES}}
> 数据时区：{{TIMEZONE}}
> 采集时间：`{{COLLECTED_AT}}`
> 快照说明：互动量、粉丝数及评论内容可能在采集后变化。

## 合格结果

> 仅保留本次任务要求的列；下面的 `{{CUSTOM_COLUMNS}}` 和 `{{CUSTOM_VALUES}}` 应替换为实际字段，不保留空占位列。

| 排名 | 笔记标题 | PC 链接 | 作者 | 发布时间 | {{CUSTOM_COLUMNS}} | 入选状态 |
|---:|---|---|---|---|---|---|
| {{RANK}} | {{TITLE}} | {{URL}} | {{AUTHOR}} | {{PUBLISHED_AT}} | {{CUSTOM_VALUES}} | {{STATUS}} |

## {{RANK}}. {{TITLE}}

- 作者：{{AUTHOR}}
- 发布时间：{{PUBLISHED_AT}}
- PC 链接：{{URL}}
- 本次要求字段：{{SELECTED_FIELDS}}
- 筛选结论：{{AUDIT_SUMMARY}}

{{OPTIONAL_DETAIL_SECTIONS}}

> `{{OPTIONAL_DETAIL_SECTIONS}}` 只在用户要求时加入正文、评论摘要、地区、品类、转化适配或其他详情。
