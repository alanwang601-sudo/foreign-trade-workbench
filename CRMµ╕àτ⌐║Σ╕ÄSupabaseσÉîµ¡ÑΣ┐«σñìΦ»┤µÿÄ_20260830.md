# CRM 清空与 Supabase 同步修复说明（2026-08-30）

本版针对“本地清空客户后，一连接 Supabase 旧客户又回来”做了系统性修复。

## 已修复

1. **「彻底清空全部」不再只清本地**：Supabase 已连接时，会同时清空 `customers / ai_history / market_analyses` 云端数据；若已配置 Supabase 但尚未连接，会阻止只清本地并提示先连接。
2. **首次连接顺序改为：待删补推 → 先拉取 → 再上传**，避免旧设备把另一台设备已经删除的数据重新上传。
3. **删除请求会等待云端确认**；失败会进入待删队列，不再“只要显示已连接就假装删除成功”。
4. **待删队列写入 localStorage**，刷新页面/关浏览器后不会丢。
5. **Supabase 客户删除增加云端删除墓碑**，即使删除的是最后一个客户，其他设备也能识别这是删除操作，不会复活。
6. **全量清空增加云端 clear marker**，其他设备连接时能识别“这是一次主动全量清空”，而不是把云端空表当异常后重新上传旧客户。
7. Service Worker 缓存升级到 `ftw-cache-v13-crm-reset-fix`。

## 正确的第一次清空方法

1. 部署本版本并强制刷新（Windows: `Ctrl + Shift + R`）。
2. 进入「设置」→ 连接 Supabase，确认显示已连接。
3. 点击「彻底清空全部」。
4. 清空成功后，再开始重新录入 CRM 客户。

## 安全提醒

当前部署指南把 Supabase Project URL + publishable key 写在公开 GitHub Pages 部署资料里，同时项目说明称 RLS 允许 anon 读写。Publishable key 本身可以公开，但**如果 RLS 对 anon 放开全部读写，则任何拿到 URL + key 的人理论上都可以直接读写这些业务表**。这不是 key 是否“秘密”的问题，而是数据库授权策略问题。

建议后续增加 Supabase Auth，并把 RLS 改成仅允许已登录的指定用户访问自己的数据；至少不要继续使用“anon 对业务表全读写”的策略。

## 同步层额外安全修复

原版本的 `fullPush()` 会把整个 `state.settings` 上传云端，其中可能包含 `apiKey`、Tavily/Google/Bing/Brave 搜索 Key、WebDAV 用户名/密码等。新版同步前会过滤这些敏感字段，只同步公司画像、主题、跟进周期等非敏感设置。

如果旧版本已经连接过 Supabase，建议部署新版后**连接一次并执行一次「上传到云端」**，新版会覆盖 `settings` 记录中的 data 内容，移除旧版本曾上传的敏感字段。
