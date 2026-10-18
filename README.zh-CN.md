# bazaar-changelog

[English](README.md)

思源笔记插件：把集市包的 GitHub 发行说明与仓库 CHANGELOG 做成思源原生的「更新日志」弹窗，
并用同一个弹窗来确认集市包更新。

![预览图](https://gcore.jsdelivr.net/gh/wmy2981/bazaar-changelog@dev/assets/preview.png)

## 功能

- **集市包详情页的版本号可点开更新日志**：设置 → 集市 → 任意包 → 「集市信息 - 版本」。
- **更新按钮改用更新日志弹窗确认**：设置 → 集市 → 已下载 → 更新，或包详情页右侧的「更新」。
  点确认后才真正开始更新，思源自身的下载进度、列表刷新与错误提示都照常。
- **弹窗顶部可选来源**：发行说明（按版本列出，可切换历史版本）、CHANGELOG（仓库里的
  changelog 文件，不分版本）或提交记录（两个版本之间的提交）。
- **「最新」以集市为准**：集市索引检索到的版本才算已知最新，GitHub 上比它新的发行版暂不显示。
- **发行说明为空时自动改看 CHANGELOG**：打开弹窗那一刻如果集市这一版没有发行说明，
  本次自动切到 CHANGELOG；默认 CHANGELOG 而仓库没有 changelog 时反过来切回发行说明。
  下一次打开仍按设置里的优先来源。
- **提交记录默认取「本机已安装版本 → 集市最新版本」**：可在弹窗里改起始与终止版本，起点选
  「不限」时列出该端点最近的提交。列表一行一条，显示 7 位短哈希，点哈希跳转到 GitHub 上的
  这条提交，点提交信息原地展开完整提交说明（不列出改动了哪些文件）。发行说明与 CHANGELOG
  都没有内容时，提示里也给「查看提交记录」的入口。
- **自动生成的发行说明按「该版本没有发行说明」处理**：正文只有一行
  `Full Changelog: v1.0.1...v1.0.2` 链接时（多为自动生成），打开弹窗直接看这段范围对应的提交记录；
  手工写的说明只要多一行就不算。
- **#PR / Issue 与 @user 变成 GitHub 链接**：发行说明、CHANGELOG 与提交记录里的 `#123`、
  `owner/repo#123` 与 `@user` 都渲染成跳转链接（其他仓库的引用也按各自的仓库拼），正文里的
  裸链接同样可点，可在设置里关闭。
- **在 GitHub 中打开**：来源与版本下拉同一行右侧的图标按钮，直接打开当前内容在 GitHub 上的位置 ——
  发行说明对应该版本的发行页面，CHANGELOG 对应仓库里实际命中的那个文件，提交记录对应 `a...b` 的
  compare 页面（起点选「不限」时是该端点的提交列表）；暂时没有可用地址时按钮置灰。
- **弹窗里直接换来源**：正文里指向本仓库 changelog 文件、发行版页面（`/releases/tag/...`）或
  提交对比（`/compare/a...b`）的链接，点开时不跳浏览器，而是在弹窗里切到对应来源并选好版本或范围；
  发行说明、CHANGELOG 与提交记录里的链接一视同仁。按住 Ctrl/⌘ 再点仍交给浏览器打开。
- **可填 GitHub 令牌**：设置里填个人访问令牌，发行说明与提交记录改用你自己的额度，不再撞匿名接口
  每小时约 60 次的限流；令牌只随发往 `api.github.com` 的请求发送。
- **GitHub 加速开关**：默认分别直连 `api.github.com` 与 `raw.githubusercontent.com`，需要时在插件
  设置里手动填一个加速地址并打开开关，发行说明与 CHANGELOG 的请求都会改走它。

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 优先加载 | 发行说明 | 打开更新日志弹窗时默认显示哪一种来源（发行说明 / CHANGELOG / 提交记录）。 |
| 识别空发行说明 | 开启 | 正文只有一行 `Full Changelog: v1.0.1...v1.0.2` 链接的发行说明按「该版本没有发行说明」处理，打开时直接看这段范围的提交记录。 |
| 链接化引用 | 开启 | 把 `#123`、`owner/repo#123` 与 `@user` 渲染成指向 GitHub 的链接。 |
| GitHub 加速 | 关闭 | 关闭时发行说明直连 `api.github.com`，CHANGELOG 直连 `raw.githubusercontent.com`。 |
| 加速地址 | 空 | 前缀式反代地址，例如 `https://gh-proxy.com/` 。开启加速且地址是 http(s) 时，发行说明与 CHANGELOG 请求都会拼在它后面。 |
| GitHub 令牌 | 空 | 个人访问令牌（PAT），提高 `api.github.com` 的额度。加密后存在插件私有存储里（钥匙另存一个文件），只随发往 `api.github.com` 的请求发送；开启加速时请求由第三方反代转发，不带令牌。 |
| 调试模式 | 关闭 | 在控制台输出本插件的完整过程日志（请求地址、耗时、版本过滤、回退原因等），前缀为 `[bazaar-changelog]`。 |

## 数据来源

- **发行说明**：GitHub Releases API（`https://api.github.com/repos/<owner>/<repo>/releases`），
  最多 100 条，过滤草稿，按发布时间倒序；同一仓库 30 分钟内只请求一次。超时的不算失败，
  仍可点「重新获取」。
- **CHANGELOG**：走 `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>`（`HEAD` 由 GitHub
  解析成仓库默认分支），`path` 为 `CHANGELOG.md`、`docs/CHANGELOG.md`、`doc/CHANGELOG.md`
  三个候选**并发**请求，谁先返回 200 就用谁，随后取消其余请求。只有 `404`（以及 200 但正文为空）
  算「这个路径上没有文件」；`403` / `429` / `5xx` / 网络错误只算这次没拿到，不会拿来当「没有」。
  三个候选都是 404 才提示「这个仓库没有 CHANGELOG」（慢网络下这几个 404 也可能超过首次超时，
  所以这个结论最多等到 8 秒）；其余情况提示超时，并在第二行说明「网络状况差或这个仓库没有
  CHANGELOG」。超时不会自动换来源 —— 同一条线路慢，换来源也拿不到。
- **集市最新版本**：内核 `/api/bazaar/getBazaarPackage` 的 `available.version`，
  用来判定「最新」以及过滤掉集市还没检索到的发行版。
- **提交记录**：GitHub Compare API（`https://api.github.com/repos/<owner>/<repo>/compare/<base>...<head>`），
  起点选「不限」时改用 `/commits` 取该端点最近 100 条提交；compare 一次最多返回 250 条，超出时
  列表下方注明。同一仓库 30 分钟内只请求一次，超时同样可以「重新获取」。
- **Markdown 渲染**：内核 `/api/lute/md2html`，与思源集市 README 同一套 Lute，再用 DOMPurify 消毒。

## 已知限制

- 只支持 GitHub 仓库的集市包（思源集市本身也只收录 GitHub 仓库）。
- 发行说明与提交记录都走 GitHub 的匿名接口，同一 IP 每小时约 60 次；触发限流时弹窗会提示读不到。
  填了 GitHub 令牌就用你自己的额度（通常 5000 次/小时）。
- 令牌在插件里没有系统密钥环可用，只能加密后与钥匙一起放在插件私有存储
  （`data/storage/petal/<插件名>/`）里；能读到整个目录的人仍然解得开，它挡的是设置文件被单独贴出去。
- 提交记录一次最多列出 250 条（compare 接口的上限），更早的提交要去 GitHub 看。
- 开启 GitHub 加速时，部分反代不代理 `compare` 接口（返回 403），提交记录会取不到；弹窗会提示
  「GitHub 加速服务可能不支持获取选定版本范围的提交」，关掉加速或改用直连即可。
- 「最新」与版本过滤都依赖集市索引，索引 1–3 小时才更新一次。
- 更新确认弹窗依赖思源集市自己的更新流程；若思源改了集市结构，插件会在控制台留一条警告，
  此时更新按钮不再被替换，也不会自己造一套更新流程。
- 弹窗里的代码块按纯文本渲染，不做语法高亮。
- GitHub 加速对发行说明与 CHANGELOG 都生效；关闭时两者分别直连 `api.github.com` 与
  `raw.githubusercontent.com`，这两个域名在大陆都可能不可达。
- CHANGELOG 只有这一个入口，没有第二个 CDN 兜底：拿不到时会提示超时并给「重新获取」。

## 开发

```bash
npm install
npm run typecheck   # 静态检查
npm run build       # 产出 dist/ 与 package.zip
npm run icon        # assets/icon.svg -> assets/icon.png
node scripts/build-preview-css.mjs <思源仓库路径>   # 重生成 assets/preview.css
npm run preview     # assets/preview.html -> assets/preview.png（首次需 npx playwright install chromium）
```

构建产物（`dist/`、`package.zip`、仓库根的 `index.js` / `index.css` / `i18n/`）不入库。

## 许可证

[MIT](LICENSE)
