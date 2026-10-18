import {debug} from "./logger";

/**
 * 正文里值得变成链接的几样东西，按优先级排列：
 * 1. 裸 http(s) 链接 —— GitHub 自己也会把 URL 渲染成链接；
 * 2. `owner/repo#123` 这种跨仓库引用；
 * 3. 本仓库的 `#123`（GitHub 会把 PR 号重定向到 pull）；
 * 4. `@user`。
 */
const REFERENCE =
    /https?:\/\/[^\s<>"'`]+|(?:([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*))?#(\d+)|@([A-Za-z0-9][A-Za-z0-9-]{0,38})/g;

/** 引用前面紧挨着这些字符时不算引用（`a@b.com`、路径里的 `#` 等）。 */
const WORD_BEFORE = /[A-Za-z0-9_/&.@-]/;

/** 链接末尾的标点属于句子，不属于地址。 */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/** 已经在这个元素里的链接、行内代码与代码块不再处理。 */
const SKIP = "a, code, pre, script, style";

const isBoundary = (text: string, index: number): boolean => index === 0 || !WORD_BEFORE.test(text[index - 1]);

/**
 * 把一段文字里的引用与链接换成可点的锚点，返回新建的链接数。
 * 直接改传进来的节点：正文是内核渲染的 HTML，这里只补链接，不重新解析 Markdown。
 */
export const linkifyGitHub = (container: HTMLElement, repo: string): number => {
    const texts: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        // 链接里的文字保持原样，代码块里的 # 是注释或字符串
        if (node.parentElement && node.parentElement.closest(SKIP)) {
            continue;
        }
        if (node.nodeValue) {
            texts.push(node);
        }
    }

    let created = 0;
    for (const node of texts) {
        const text = node.nodeValue || "";
        const matches = Array.from(text.matchAll(REFERENCE));
        if (matches.length === 0) {
            continue;
        }
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const matched of matches) {
            const index = matched.index ?? 0;
            // 捕获组顺序与上面的正则一一对应：整段、跨仓库、编号、用户名
            const [whole, crossRepo, number, user] = matched;
            const isURL = /^https?:\/\//i.test(whole);
            // 链接前面是 `(` 之类也算，只有紧贴字母数字的才算路径的一部分
            if (!isURL && !isBoundary(text, index)) {
                continue;
            }
            let href = "";
            let label = whole;
            if (isURL) {
                label = whole.replace(TRAILING_PUNCTUATION, "");
                href = label;
            } else if (crossRepo && number) {
                href = `https://github.com/${crossRepo}/issues/${number}`;
            } else if (number) {
                href = `https://github.com/${repo}/issues/${number}`;
            } else if (user) {
                href = `https://github.com/${user}`;
            }
            if (!href || !label) {
                continue;
            }
            const anchor = document.createElement("a");
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.href = href;
            anchor.textContent = label;
            fragment.append(text.slice(cursor, index), anchor);
            cursor = index + label.length;
            created++;
        }
        if (cursor === 0) {
            continue;
        }
        if (cursor < text.length) {
            fragment.append(text.slice(cursor));
        }
        node.replaceWith(fragment);
    }
    debug("references: linkified", {repo, links: created});
    return created;
};
