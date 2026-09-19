# 外贸工作台 · GitHub Pages 免费发布指南

这是一份**手把手、零基础**的操作指南，不需要会写代码，全程用鼠标点击即可完成。

**你将得到什么：**
- 一个免费的网址（类似 `你的用户名.github.io/foreign-trade-workbench/`），手机、电脑、任何浏览器都能打开
- 数据通过 **Supabase 云端同步**（你的数据已经就绪）
- 以后想改功能，只需替换文件 + 点两个按钮，就能自动更新上线

---

## 目录

1. [准备工作（3 分钟）](#第一步注册github账号)
2. [安装 GitHub Desktop](#第二步安装-github-desktop-图形化客户端)
3. [新建仓库并发布](#第三步新建仓库并上传文件)
4. [上传 11 个部署文件](#第四步上传-11-个部署文件)
5. [开启 GitHub Pages（生成网址）](#第五步开启-github-pages-生成网址)
6. [打开网址，配置同步](#第六步打开网址配置supabase同步)
7. [以后怎么更新？](#第七步以后如何更新和维护)
8. [常见问题](#常见问题)

---

## 第一步：注册 GitHub 账号

1. 打开浏览器，访问 **https://github.com**
2. 点击右上角 **Sign up**（注册）
3. 填写：
   - **Email**：填你常用的邮箱（建议用 alan.wang601@gmail.com）
   - **Password**：设置一个密码（至少 15 位，或用系统建议的）
   - **Username**：起一个英文用户名，例如 `alanwangft`（**这个就是以后网址的一部分，记好它**）
4. 按提示完成验证（可能是拼图或字母）
5. 登录邮箱，点击 GitHub 发来的验证邮件中的按钮完成验证

> ✅ 注册完成！记住你的**用户名**，后面会用到。

---

## 第二步：安装 GitHub Desktop（图形化客户端）

GitHub Desktop 是一个"图形化上传工具"，不用记命令，点按钮就能把文件传到网上，**专门为你后续"方便维护"设计**。

1. 打开浏览器，访问 **https://desktop.github.com**
2. 点击 **Download for Windows**（下载 Windows 版）
3. 双击下载的安装包，一路点 **Next / Install** 完成安装
4. 打开 GitHub Desktop
5. 首次打开会让你登录，选择 **Sign in to GitHub.com**，用刚才注册的账号登录
6. 登录后进入主界面，右侧会有两个按钮：**Create a New Repository**（新建仓库）和 **Add Local Repository**（添加本地仓库）

> ✅ 安装完成！

---

## 第三步：新建仓库并上传文件

1. 在 GitHub Desktop 主界面，点击 **File → New repository…**（文件 → 新建仓库）
2. 填写：
   - **Name**（仓库名）：输入 `foreign-trade-workbench`（**建议用这个，网址会更好记**）
   - **Description**（描述，可留空）
   - **Local path**（保存位置）：选择桌面 `Desktop`（这样文件就在桌面上，方便找）
   - **Initialize this repository with a README**（创建README）：**勾选**它
   - 其他保持默认，点击 **Create repository**（创建仓库）
3. 创建后，GitHub Desktop 会提示 **Publish repository**（发布仓库），点击它
4. 弹出窗口，**Keep this code private**（保持私有）这一项**不要勾选**（要设为公开，GitHub Pages 才能免费托管）
5. 点击 **Publish repository**（发布仓库）

> ✅ 仓库已创建并发布！现在文件已经"挂"到 GitHub 云端了。

---

## 第四步：上传 11 个部署文件

这一步把工作台的所有文件放进刚才创建的仓库文件夹里。

1. 打开文件管理器，找到你刚才在桌面创建的文件夹，路径是：
   `桌面 → foreign-trade-workbench`

2. 解压我已经为你准备好的 **`外贸工作台-GitHubPages部署文件.zip`**，把里面的 **11 个文件**全部选中：
   ```
   index.html
   web.html
   web.js
   styles.css
   sb-sync.js
   pg-sync.js
   cloudbase-patch.js
   manifest.json
   sw.js
   icon-192.png
   icon-512.png
   ```

3. 把这 11 个文件**复制到** `桌面 → foreign-trade-workbench` 文件夹里（和 README.md 放在一起）

4. 回到 GitHub Desktop，你会看到左侧显示一堆文件变化（显示为绿色 + 号）

5. 在左下角的 **Summary** 框里输入：`首次部署外贸工作台`

6. 点击 **Commit to main**（提交到主分支）

7. 点击顶部中间的 **Push origin**（推送）按钮

> ✅ 文件已上传到 GitHub！

---

## 第五步：开启 GitHub Pages（生成网址）

1. 打开浏览器，访问 **https://github.com/你的用户名/foreign-trade-workbench**（把"你的用户名"换成你注册的用户名）

2. 点击顶部菜单的 **Settings**（设置）

3. 在左侧菜单里找到 **Pages**（页面托管）

4. 在 **Branch**（分支）下拉框里：
   - 第一项选 **main**（或显示为 `Main`）
   - 第二项选 **/ (root)**（根目录）
   - 点击 **Save**（保存）

5. 等大约 **1~3 分钟**，页面顶部会出现你的网址，格式是：
   `https://你的用户名.github.io/foreign-trade-workbench/`

   （第一次可能要等几分钟，多刷新几次页面）

> ✅ 网址生成成功！打开它就能看到你的外贸工作台了。

---

## 第六步：打开网址，配置 Supabase 同步

1. 用手机或电脑浏览器打开你的网址：
   `https://你的用户名.github.io/foreign-trade-workbench/`

2. 进入工作台后，点击左侧 **设置**（⚙）

3. 找到 **「⚡ 多端实时同步（Supabase · 免费推荐）」** 绿色卡片，填写：
   - **Project URL（项目地址）**：填入
     ```
     https://YOUR_PROJECT_REF.supabase.co
     ```
   - **Publishable Key（发布密钥）**：填入
     ```
     YOUR_SUPABASE_PUBLISHABLE_KEY
     ```

4. 点击 **连接** 按钮，等待提示"连接成功"

5. 点击 **推送** 按钮，把当前设备上的数据同步到云端

6. 之后在另一台设备（比如手机）打开同一个网址，点击 **拉取** 或等它自动同步，就能看到相同的数据了

> ✅ 配置完成！以后在电脑、手机上用同一个网址，数据就自动同步了（默认约 12 秒自动同步一次）。

---

## 第七步：以后如何更新和维护

以后你想改功能或内容，全程只需要 3 步：

1. **替换文件**：用我给你的新版文件，覆盖到 `桌面 → foreign-trade-workbench` 文件夹里（同名覆盖即可）

2. **提交**：打开 GitHub Desktop → 左下角 Summary 框输入说明（比如"更新了某功能"）→ 点击 **Commit to main**

3. **推送**：点击 **Push origin** 按钮

等约 1~2 分钟，刷新你的网址就能看到最新版本。

> 💡 **提示**：因为浏览器有缓存，如果更新后页面没变，按 `Ctrl + F5`（强制刷新）即可。版本号也已内置了自动刷新机制（`ftw-cache-v4`），一般会自动更新。

---

## 常见问题

**Q1：网址打不开，显示 404？**
- 检查你是否已经点击了 Settings → Pages 里的 **Save** 按钮
- 检查是不是还没等够时间（首次最长等 5 分钟）
- 确认网址拼写：`你的用户名.github.io/foreign-trade-workbench/`（注意仓库名是否完全一致）

**Q2：数据不同步？**
- 确认在设置页正确填写了 Supabase 的 URL 和 Key，并点击了"连接"和"推送"
- 确认网络正常
- 在手机上也打开同一个网址，进入设置页点击"拉取"

**Q3：隐私安全吗？**
- 工作台代码和网页本身是公开的（GitHub Pages 免费托管要求公开仓库）
- 你的**业务数据**存放在 Supabase；是否能被读取取决于 RLS/授权策略，不应仅依赖 publishable key
- 不过要注意：目前 Supabase 的 RLS 策略允许所有知道 URL+Key 的人读写数据。publishable key 本身可以出现在前端，但如果 RLS 对 anon 开放业务表读写，拿到 URL+key 的人仍可能访问数据。V6.1 继续兼容旧结构，但建议后续增加 Supabase Auth 并收紧 RLS；安全与是否付费不是一回事。

**Q4：我想换回 CloudBase 同步？**
- 可以，设置页里也有 CloudBase 的配置卡片，但 CloudBase 免费版不稳定（之前遇到过实例被隔离），推荐优先使用 Supabase

**Q5：Electron 桌面版还要吗？**
- 桌面版（`foreign-trade-workbench` 文件夹）仍然可以正常使用，功能更完整
- Web 版（GitHub Pages）适合在手机、平板、其他电脑上快速访问
- 两者数据通过 Supabase 同步，数据是一致的

---

## 你的专属信息速查

| 项目 | 内容 |
|------|------|
| 你的 GitHub 用户名 | （注册时填写的用户名） |
| 你的网站网址 | `https://你的用户名.github.io/foreign-trade-workbench/` |
| 仓库名 | `foreign-trade-workbench` |
| Supabase URL | `请填写你新项目的 Project URL` |
| Supabase Publishable Key | `请填写你新项目的 publishable key` |
| 数据库状态 | ✅ 5 张表已建好（customers / ai_history / market_analyses / calendar / settings） |

祝你使用愉快！有任何问题随时问我。
