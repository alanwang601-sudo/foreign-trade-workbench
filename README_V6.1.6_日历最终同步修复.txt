V6.1.6 日历同步修复

本版修复上一版仍可能看不到云端任务的根因：
1. 拉取日历后没有 persist 到 localStorage，刷新后会回到旧本地日历。
2. 过去只有“云端顶层 updatedAt > 本地 updatedAt”才整包采用云端，导致本地时间戳较新时云端新增任务完全被忽略。
3. fullPush 会直接用本地 calendar 整包覆盖云端，可能吞掉 ChatGPT/其他设备刚新增的任务。
4. 轮询过去先 push 再 pull，旧页面可在拉取前先覆盖云端。

修复：
- 日历每次 pull 始终按 todo.id 双向合并。
- pull 后立即 persist 到 localStorage。
- push 前先拉取云端日历再合并后写回。
- polling 改为先 pull 再 push。
- Service Worker 缓存版本提升到 v30。
