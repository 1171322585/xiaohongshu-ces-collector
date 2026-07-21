# Playwright 快速路径

只在任务使用独立 Playwright 时读取本文件，并同时遵循 `playwright` skill。

## 会话与阶段

- 使用 headed、persistent、真实 Chrome，复用同一登录态。
- 搜索、详情、粉丝、评论分阶段落盘；每阶段只接收待处理 ID。
- 默认 3 个页面并发，最大不超过 6；出现验证码、空白页或连续失败时停止新增页面。
- 使用 `scripts/playwright_batch_cards.js`、`scripts/playwright_batch_notes.js` 和 `scripts/playwright_batch_fans.js`。
- 脚本通过同源 `localStorage` 接收参数，通过页面 Blob 下载 JSON；命令行只传短路径和小批参数。

## 高效顺序

1. 搜索卡片只采集 ID、必要卡片字段和有效链接。
2. 详情脚本默认只取详情和正文，不等待评论；只有显式设置 `xhs_include_initial_comments=true` 才读取初始评论。
3. 详情硬条件通过后，按 `author_id` 去重调用粉丝脚本。
4. 粉丝通过后才对目标池和候补池加载评论。

详情阶段不要把搜索卡片的 `raw`、`lines` 复制到输出。运行结果只向模型报告计数与输出路径。

## 粉丝核验

按以下两级读取，不使用整页 `body.innerText()`：

1. 读取 `window.__INITIAL_STATE__.user.userPageData.interactions` 中 `type === "fans"` 的 `count`。
2. 结构化字段缺失时，只在文本为“粉丝”的标签及其近邻容器中匹配数字。

支持 `万/w`、`千/k` 和 `+`。输出 `fans`、`fans_display`、`extraction_source`、`fans_approximate`、`status` 与兼容字段 `passes_fans`。

- 明确不超过上限：`pass`
- 明确超过上限：`reject`
- 页面失败、无数字或下界不足以证明通过：`unknown`
- 没有粉丝规则但成功读取：`measured`

未知项集中保留供一次补查，不循环刷新主页。

## 验证码与恢复

- 检测到验证码时停止当前阶段，保存已完成结果并提示用户处理一次。
- 验证完成后只继续待处理项，不重新搜索、不重建浏览器配置。
- 每批结束更新 `state.json`，记录完成 ID、失败 ID和验证码状态。

## 链接

从搜索结果获得的 `xsec_token` 只存放在任务目录和最终交付物。不得在日志或阶段性消息中输出整批令牌链接。
