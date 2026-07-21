# 任务配置契约

只在创建复杂筛选任务或确认字段含义时读取本文件。

## 最小配置

```json
{
  "version": 2,
  "topic": "本次主题",
  "keywords": ["关键词"],
  "target_count": 20,
  "backup_count": 4,
  "rules": {},
  "ranking": [],
  "output": {"format": "xlsx", "fields": []},
  "runtime": {"browser": "playwright", "concurrency": 3}
}
```

`topic`、`keywords`、`target_count` 和输出字段来自当前请求。未出现的可选字段表示不启用，不用 `null` 暗示旧规则。

## 可选规则

```json
{
  "rules": {
    "published": {"max_age_days": 15},
    "metrics": {"comments_gte": 5},
    "score": {
      "name": "CES",
      "formula": "likes + comments * 4 + collects",
      "gte": 20
    },
    "fans": {"lte": 10000},
    "content": {
      "competitor_terms": [],
      "forbidden_terms": [],
      "excluded_regions": [],
      "priority_types": []
    },
    "comments": {
      "policy": "author_and_spam",
      "competitor_terms": [],
      "spam_terms": []
    }
  }
}
```

示例数字只说明结构，不是默认门槛。评论策略支持：

- `none`：不核验评论。
- `strict_any_competitor`：已检查范围内任何用户命中竞品即排除。
- `author_and_spam`：仅博主竞品内容或引流刷屏导致排除。
- `custom`：完全按当次请求定义。

## 排序与去重

- 排序规则必须来自请求，例如 `score desc`、`comments desc` 或优先类型后按时间排序。
- 默认按 `note_id` 去重；只有用户要求作者唯一时才按作者去重笔记。
- 粉丝按 `author_id` 缓存；无作者 ID 时使用主页规范链接作为临时键。

## 运行参数

只有执行参数可使用安全默认值：并发数、批次大小、超时、检查点间隔和审核摘要长度。业务规则绝不使用默认值。

推荐的低消耗限制：

- Playwright 并发默认 3，遇验证码立即降为 1。
- 每批详情 10–15 篇。
- 语义审核只处理通过硬条件后的目标池与候补池。
- 模型正文摘要上限 350 字，评论证据上限 5 条。
