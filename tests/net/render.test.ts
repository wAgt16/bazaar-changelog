import {beforeEach, describe, expect, it, vi} from "vitest";
import {stubState} from "../stubs/siyuan";
import {applyMarkdownHTML, markdownToHTML} from "../../src/render";

const LINK_BASE = "https://github.com/owner/repo/blob/HEAD/";

beforeEach(() => {
    vi.resetModules();
});

describe("markdownToHTML", () => {
    it("调内核的 Lute 把 Markdown 转成 HTML", async () => {
        stubState.fetchPostHandler = (_url, _data, callback) =>
            callback({code: 0, data: {html: "<p>hello</p>"}});
        expect(await markdownToHTML("# hello")).toBe("<p>hello</p>");
        expect(stubState.fetchPostCalls[0]).toEqual({
            url: "/api/lute/md2html",
            data: {markdown: "# hello", mode: ""},
        });
    });

    it("渲染失败时给空串", async () => {
        stubState.fetchPostHandler = (_url, _data, callback) => callback({code: -1, msg: "boom"});
        expect(await markdownToHTML("# hello")).toBe("");
    });
});

describe("applyMarkdownHTML", () => {
    const container = () => document.createElement("div");

    it("把 HTML 消毒后写进容器", () => {
        const sanitize = vi.fn((html: string) => html.replace(/<script>.*?<\/script>/g, ""));
        (window as any).DOMPurify = {sanitize};
        const element = container();
        expect(applyMarkdownHTML(element, `<p onclick="x()">hi</p><script>bad()</script>`, LINK_BASE)).toBe(true);
        expect(sanitize).toHaveBeenCalledWith(`<p onclick="x()">hi</p><script>bad()</script>`, {
            FORBID_TAGS: ["iframe", "frame", "frameset"],
            ALLOWED_URI_REGEXP: expect.any(RegExp),
        });
        expect(element.innerHTML).toBe(`<p onclick="x()">hi</p>`);
    });

    it("正文为空时不动容器", () => {
        const element = container();
        element.textContent = "keep";
        expect(applyMarkdownHTML(element, "", LINK_BASE)).toBe(false);
        expect(element.textContent).toBe("keep");
    });

    it("没有 DOMPurify 时不动容器", () => {
        delete (window as any).DOMPurify;
        const element = container();
        expect(applyMarkdownHTML(element, "<p>x</p>", LINK_BASE)).toBe(false);
        expect(element.innerHTML).toBe("");
    });

    it("链接改成新窗口打开，相对地址补成仓库地址", () => {
        const element = container();
        applyMarkdownHTML(element, [
            `<a href="docs/a.md">relative</a>`,
            `<a href="/owner/repo/blob/HEAD/x.md">root</a>`,
            `<a href="https://example.com/x">absolute</a>`,
            `<a href="#section">anchor</a>`,
            `<a href="//cdn.example.com/x">protocol relative</a>`,
            `<a href="mailto:a@b.com">mail</a>`,
            `<a>no href</a>`,
        ].join(""), LINK_BASE);
        const anchors = Array.from(element.querySelectorAll("a"));
        expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
            `${LINK_BASE}docs/a.md`,
            `${LINK_BASE}owner/repo/blob/HEAD/x.md`,
            "https://example.com/x",
            "#section",
            "//cdn.example.com/x",
            "mailto:a@b.com",
            null,
        ]);
        for (const anchor of anchors) {
            expect(anchor.getAttribute("target")).toBe("_blank");
            expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
        }
    });

    it("图片的相对地址同样补齐", () => {
        const element = container();
        applyMarkdownHTML(element, `<img src="assets/a.png"><img src="https://example.com/b.png">`, LINK_BASE);
        const images = Array.from(element.querySelectorAll("img"));
        expect(images.map((image) => image.getAttribute("src"))).toEqual([
            `${LINK_BASE}assets/a.png`,
            "https://example.com/b.png",
        ]);
    });
});
