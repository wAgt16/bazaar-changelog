import {beforeEach, describe, expect, it, vi} from "vitest";
import zhCN from "../../src/i18n/zh-CN.json";
import {DEFAULT_SETTINGS} from "../../src/settings";
import type {ISettings} from "../../src/settings";
import {stubState} from "../stubs/siyuan";

/**
 * 弹窗的测试把三个网络来源都换成替身：这里要验的是「拿到不同结果时弹窗怎么显示、
 * 怎么在来源之间切换」，而不是怎么发请求（那部分在 tests/net 里单独测）。
 * 渲染、链接化、分类这些纯逻辑保持真实实现。
 */
const mocks = vi.hoisted(() => ({
    fetchReleases: vi.fn(),
    fetchChangelog: vi.fn(),
    fetchCommits: vi.fn(),
}));

vi.mock("../../src/github", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/github")>();
    return {...actual, fetchReleases: mocks.fetchReleases};
});

vi.mock("../../src/changelog", () => ({fetchChangelog: mocks.fetchChangelog}));

vi.mock("../../src/commits", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/commits")>();
    return {...actual, fetchCommits: mocks.fetchCommits};
});

const REPO_URL = "https://github.com/owner/repo";

const settings = (overrides: Partial<ISettings> = {}): ISettings => ({...DEFAULT_SETTINGS, ...overrides});

const releases = () => [
    {tag: "v1.2.3", publishedAt: "2024-03-01T00:00:00Z", markdown: "## 修复\n\n- 修了 #12"},
    {tag: "v1.2.2", publishedAt: "2024-02-01T00:00:00Z", markdown: "上一版说明"},
    {tag: "v1.2.1", publishedAt: "2024-01-01T00:00:00Z", markdown: ""},
    {tag: "v2.0.0", publishedAt: "2024-04-01T00:00:00Z", markdown: "比集市更新的版本"},
];

const commits = () => [
    {
        sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        message: "fix: second\n\n更多说明",
        author: "Bob",
        date: "2024-02-02T10:00:00Z",
    },
    {
        sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        message: "first",
        author: "Alice",
        date: "2024-01-01T10:00:00Z",
    },
];

type OpenChangelog = typeof import("../../src/dialog").openChangelog;
let openChangelog: OpenChangelog;

const dialogEl = () => document.querySelector(".b3-dialog") as HTMLElement | null;
const requiredDialog = () => {
    const element = dialogEl();
    if (!element) {
        throw new Error("no dialog is open");
    }
    return element;
};
const bodyEl = () => requiredDialog().querySelector(".bazaar-release-notes__body") as HTMLElement;
const control = <T extends Element>(type: string) =>
    requiredDialog().querySelector(`[data-type="${type}"]`) as T;
const bodyText = () => (bodyEl().textContent || "").replace(/\s+/g, " ").trim();

const expectBody = async (expected: string | RegExp) => {
    if (typeof expected === "string") {
        await vi.waitFor(() => expect(bodyText()).toContain(expected));
        return;
    }
    await vi.waitFor(() => expect(bodyText()).toMatch(expected));
};

const open = (overrides: Partial<Parameters<OpenChangelog>[0]> = {}) => {
    openChangelog({
        i18n: zhCN,
        settings: settings(),
        repoURL: REPO_URL,
        version: "1.2.3",
        installedVersion: "1.2.2",
        ...overrides,
    });
};

const click = (element: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent("click", {bubbles: true, cancelable: true, ...init});
    element.dispatchEvent(event);
    return event;
};

beforeEach(async () => {
    vi.resetModules();
    mocks.fetchReleases.mockReset().mockResolvedValue({status: "ok", releases: releases()});
    mocks.fetchChangelog.mockReset().mockResolvedValue({status: "missing"});
    mocks.fetchCommits.mockReset().mockResolvedValue({status: "ok", commits: commits(), total: 2});
    // 内核的 Markdown 渲染换成把原文包进 <p>，正文里的引用仍然由真实实现链接化
    stubState.fetchPostHandler = (_url, data, callback) => {
        callback({code: 0, data: {html: `<p>${String(data.markdown)}</p>`}});
    };
    ({openChangelog} = await import("../../src/dialog"));
});

describe("打开与关闭", () => {
    it("不是 GitHub 仓库时只提示，不开弹窗", () => {
        open({repoURL: "https://gitlab.com/owner/repo"});
        expect(dialogEl()).toBeNull();
        expect(stubState.messages).toEqual(["无法获取这个集市包的信息"]);
    });

    it("弹窗里有三种来源，默认选中设置里的那一项", () => {
        open({settings: settings({preferredSource: "changelog"})});
        const source = control<HTMLSelectElement>("source");
        expect(Array.from(source.options).map((option) => option.value))
            .toEqual(["releaseNotes", "changelog", "commits"]);
        expect(source.value).toBe("changelog");
    });

    it("同一时刻只留一个弹窗", () => {
        open();
        open();
        expect(document.querySelectorAll(".b3-dialog")).toHaveLength(1);
    });

    it("点关闭按钮销毁弹窗", () => {
        open();
        click(control("close"));
        expect(dialogEl()).toBeNull();
    });

    it("没有 onConfirm 时只有关闭按钮", () => {
        open();
        expect(control("close").textContent).toBe("关闭");
        expect(requiredDialog().querySelector('[data-type="confirm"]')).toBeNull();
    });

    it("有 onConfirm 时多一个更新按钮，点了先关窗再回调", () => {
        const onConfirm = vi.fn();
        open({onConfirm});
        expect(control("close").textContent).toBe("取消");
        expect(control("confirm").textContent).toBe("更新");

        click(control("confirm"));
        expect(dialogEl()).toBeNull();
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});

describe("发行说明来源", () => {
    it("显示集市这一版的发行说明，并标出「最新」", async () => {
        open();
        await expectBody("修了 #12");
        const version = control<HTMLSelectElement>("version");
        expect(version.value).toBe("v1.2.3");
        expect(Array.from(version.options).find((option) => option.value === "v1.2.3")?.textContent)
            .toBe("v1.2.3 (最新)");
        // 正文里的引用照常链接化
        expect(bodyEl().querySelector("a")?.getAttribute("href"))
            .toBe("https://github.com/owner/repo/issues/12");
    });

    it("比集市新的发行版不进下拉", async () => {
        open();
        await expectBody("修了 #12");
        const tags = Array.from(control<HTMLSelectElement>("version").options).map((option) => option.value);
        expect(tags).toEqual(["v1.2.3", "v1.2.2", "v1.2.1"]);
    });

    it("切换版本显示那一版的正文", async () => {
        open();
        await expectBody("修了 #12");
        const version = control<HTMLSelectElement>("version");
        version.value = "v1.2.2";
        version.dispatchEvent(new Event("change"));
        await expectBody("上一版说明");
        expect(mocks.fetchReleases).toHaveBeenCalledTimes(1);
    });

    it("集市这一版找不到时自动回退到 CHANGELOG", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "ok", markdown: "# 变更记录", path: "CHANGELOG.md"});
        open({version: "9.9.9"});
        await expectBody("# 变更记录");
        expect(mocks.fetchChangelog).toHaveBeenCalledTimes(1);
    });

    it("这一版正文为空时同样回退到 CHANGELOG", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "ok", markdown: "# 变更记录", path: "CHANGELOG.md"});
        open({version: "1.2.1"});
        await expectBody("# 变更记录");
    });

    it("发行说明超时给出「重新获取」", async () => {
        mocks.fetchReleases.mockResolvedValue({status: "timeout"});
        open();
        await expectBody("获取发行说明超时");
        expect(control("action").textContent).toBe("重新获取");
    });

    it("「在 GitHub 中打开」指向当前发行版", async () => {
        open();
        await expectBody("修了 #12");
        click(control("open"));
        expect(window.open).toHaveBeenCalledWith(
            "https://github.com/owner/repo/releases/tag/v1.2.3",
            "_blank",
            "noopener,noreferrer",
        );
    });
});

describe("CHANGELOG 来源", () => {
    it("显示 CHANGELOG 正文，打开按钮指向命中的文件", async () => {
        mocks.fetchChangelog.mockResolvedValue({
            status: "ok",
            markdown: "# 更新日志正文",
            path: "docs/CHANGELOG.md",
        });
        open({settings: settings({preferredSource: "changelog"})});
        await expectBody("# 更新日志正文");

        const openButton = control<HTMLButtonElement>("open");
        expect(openButton.disabled).toBe(false);
        click(openButton);
        expect(window.open).toHaveBeenCalledWith(
            "https://github.com/owner/repo/blob/HEAD/docs/CHANGELOG.md",
            "_blank",
            "noopener,noreferrer",
        );
    });

    it("仓库没有 CHANGELOG 时首次打开回退到发行说明", async () => {
        open({settings: settings({preferredSource: "changelog"})});
        await expectBody("修了 #12");
        expect(mocks.fetchChangelog).toHaveBeenCalledTimes(1);
    });

    it("超时提示分两行：主提示 + 可能是网络也可能确实没有", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "timeout"});
        open({settings: settings({preferredSource: "changelog"})});
        await expectBody("获取 CHANGELOG 超时");
        expect(requiredDialog().querySelector(".bazaar-release-notes__hint")?.textContent)
            .toBe("网络状况差或这个仓库没有 CHANGELOG");
    });

    it("点「重新获取」用更长的超时重来一次", async () => {
        mocks.fetchChangelog
            .mockResolvedValueOnce({status: "timeout"})
            .mockResolvedValueOnce({status: "ok", markdown: "# 第二次拿到了", path: "CHANGELOG.md"});
        open({settings: settings({preferredSource: "changelog"})});
        await expectBody("获取 CHANGELOG 超时");

        click(control("action"));
        await expectBody("# 第二次拿到了");
        expect(mocks.fetchChangelog).toHaveBeenCalledTimes(2);
        expect(mocks.fetchChangelog.mock.calls[1][2]).toBe(7000);
    });

    it("没有 CHANGELOG 也没有发行说明时，给出去看提交记录的入口", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "missing"});
        mocks.fetchReleases.mockResolvedValue({
            status: "ok",
            releases: [{tag: "v1.2.3", publishedAt: "", markdown: ""}],
        });
        open({settings: settings({preferredSource: "changelog"})});
        await expectBody("这个仓库没有 CHANGELOG，且该版本没有发行说明");
        expect(control("action").textContent).toBe("查看提交记录");

        click(control("action"));
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("source").value).toBe("commits");
    });
});

describe("自动生成的空发行说明", () => {
    const botNotes = "**Full Changelog**: https://github.com/owner/repo/compare/v1.2.2...v1.2.3";

    it("只有 Full Changelog 链接时直接去看那段提交", async () => {
        mocks.fetchReleases.mockResolvedValue({
            status: "ok",
            releases: [{tag: "v1.2.3", publishedAt: "2024-03-01T00:00:00Z", markdown: botNotes}],
        });
        open();
        await expectBody("共 2 个提交");
        expect(mocks.fetchCommits).toHaveBeenCalledWith(
            "owner/repo",
            {base: "v1.2.2", head: "v1.2.3"},
            expect.anything(),
            expect.any(Number),
        );
        expect(control<HTMLSelectElement>("source").value).toBe("commits");
    });

    it("关掉识别后照常当正文显示", async () => {
        mocks.fetchReleases.mockResolvedValue({
            status: "ok",
            releases: [{tag: "v1.2.3", publishedAt: "2024-03-01T00:00:00Z", markdown: botNotes}],
        });
        open({settings: settings({botReleaseNotesAsEmpty: false})});
        await expectBody("Full Changelog");
        expect(mocks.fetchCommits).not.toHaveBeenCalled();
        expect(control<HTMLSelectElement>("source").value).toBe("releaseNotes");
    });
});

describe("提交记录来源", () => {
    it("默认范围是本机已安装版本到集市最新版本", async () => {
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("from").value).toBe("v1.2.2");
        expect(control<HTMLSelectElement>("to").value).toBe("v1.2.3");
        expect(mocks.fetchCommits.mock.calls[0][1]).toEqual({base: "v1.2.2", head: "v1.2.3"});
    });

    it("已安装版本与集市一致时退回上一个发行版", async () => {
        open({settings: settings({preferredSource: "commits"}), installedVersion: "1.2.3"});
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("from").value).toBe("v1.2.2");
    });

    it("不知道已安装版本时同样退回上一个发行版", async () => {
        open({settings: settings({preferredSource: "commits"}), installedVersion: undefined});
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("from").value).toBe("v1.2.2");
    });

    it("一个发行版都没有时起点为「不限」、终点为 HEAD", async () => {
        mocks.fetchReleases.mockResolvedValue({status: "ok", releases: []});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("from").value).toBe("");
        expect(control<HTMLSelectElement>("to").value).toBe("HEAD");
        expect(mocks.fetchCommits.mock.calls[0][1]).toEqual({base: "", head: "HEAD"});
    });

    it("列表里一条提交都没有时的提示", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "empty"});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("这段范围内没有提交");
    });

    it("获取失败时的提示", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "error"});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("无法获取提交记录");
        expect(requiredDialog().querySelector(".bazaar-release-notes__hint")).toBeNull();
    });

    it("开了加速又回 403 时多给一句提示", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "error", forbidden: true});
        open({settings: settings({preferredSource: "commits", githubAcceleration: true})});
        await expectBody("无法获取提交记录");
        expect(requiredDialog().querySelector(".bazaar-release-notes__hint")?.textContent)
            .toBe("GitHub 加速服务可能不支持获取选定版本范围的提交");
    });

    it("没开加速时的 403 不加那句提示", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "error", forbidden: true});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("无法获取提交记录");
        expect(requiredDialog().querySelector(".bazaar-release-notes__hint")).toBeNull();
    });

    it("超时给出「重新获取」", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "timeout"});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("获取提交记录超时");
        expect(control("action").textContent).toBe("重新获取");
    });

    it("一条提交一行：短哈希、首行信息、作者与日期", async () => {
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");

        const rows = requiredDialog().querySelectorAll(".bazaar-release-notes__commit");
        expect(rows).toHaveLength(2);
        const first = rows[0];
        expect(first.querySelector(".bazaar-release-notes__hash")?.textContent).toBe("bbbbbbb");
        expect(first.querySelector(".bazaar-release-notes__hash")?.getAttribute("href"))
            .toBe("https://github.com/owner/repo/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
        expect(first.querySelector(".b3-list-item__text")?.textContent).toBe("fix: second");
        expect(first.querySelector(".b3-list-item__meta")?.textContent).toBe("Bob · 2024-02-02");
    });

    it("点一行展开完整提交信息，点里面的链接不展开", async () => {
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");
        const row = requiredDialog().querySelector(".bazaar-release-notes__commit") as HTMLElement;
        const detail = row.querySelector(".bazaar-release-notes__commit-detail") as HTMLElement;
        expect(detail.classList.contains("fn__none")).toBe(true);

        click(row.querySelector(".b3-list-item__text") as HTMLElement);
        expect(detail.classList.contains("fn__none")).toBe(false);
        expect(detail.textContent).toContain("更多说明");
        expect(detail.textContent).toContain("Bob · 2024-02-02");

        // 短哈希是链接，点它不该切换展开状态
        const prevent = (event: Event) => event.preventDefault();
        document.addEventListener("click", prevent);
        click(row.querySelector(".bazaar-release-notes__hash") as HTMLElement);
        document.removeEventListener("click", prevent);
        expect(detail.classList.contains("fn__none")).toBe(false);
    });

    it("没有提交信息时给占位文案", async () => {
        mocks.fetchCommits.mockResolvedValue({
            status: "ok",
            total: 1,
            commits: [{sha: "cccccccccccccccccccccccccccccccccccccccc", message: "", author: "", date: ""}],
        });
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("（无提交信息）");
        const row = requiredDialog().querySelector(".bazaar-release-notes__commit");
        expect(row?.querySelector(".b3-list-item__text")?.textContent).toBe("（无提交信息）");
    });

    it("总数大于列出条数时说明只列了一部分", async () => {
        mocks.fetchCommits.mockResolvedValue({status: "ok", commits: commits(), total: 260});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 260 个提交");
        expect(bodyText()).toContain("一次最多列出 2 个提交");
    });

    it("改起止版本会重新取一次", async () => {
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");
        const from = control<HTMLSelectElement>("from");
        from.value = "v1.2.1";
        from.dispatchEvent(new Event("change"));
        await vi.waitFor(() => expect(mocks.fetchCommits).toHaveBeenCalledTimes(2));
        expect(mocks.fetchCommits.mock.calls[1][1]).toEqual({base: "v1.2.1", head: "v1.2.3"});
    });

    it("打开按钮在起点为「不限」时指向该端点的提交列表", async () => {
        mocks.fetchReleases.mockResolvedValue({status: "ok", releases: []});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");
        click(control("open"));
        expect(window.open).toHaveBeenCalledWith(
            "https://github.com/owner/repo/commits",
            "_blank",
            "noopener,noreferrer",
        );
    });
});

describe("来源切换", () => {
    const switchTo = async (source: "releaseNotes" | "changelog" | "commits") => {
        const element = control<HTMLSelectElement>("source");
        element.value = source;
        element.dispatchEvent(new Event("change"));
    };

    it("切换来源下拉会加载另一种来源", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "ok", markdown: "CHANGELOG 正文", path: "CHANGELOG.md"});
        open();
        await expectBody("修了 #12");

        await switchTo("changelog");
        await expectBody("CHANGELOG 正文");
        expect(mocks.fetchChangelog).toHaveBeenCalledTimes(1);
    });

    it("这一版没有发行说明、但仓库另有 CHANGELOG 时只提示这一版没有", async () => {
        mocks.fetchReleases.mockResolvedValue({
            status: "ok",
            releases: [{tag: "v1.2.1", publishedAt: "2024-01-01T00:00:00Z", markdown: ""}],
        });
        open({version: "1.2.1", settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");

        await switchTo("releaseNotes");
        await expectBody("该版本没有发行说明");
        expect(requiredDialog().querySelector('[data-type="action"]')).toBeNull();
    });

    it("一个发行版都没有时提示无法获取发行说明", async () => {
        mocks.fetchReleases.mockResolvedValue({status: "ok", releases: []});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");

        await switchTo("releaseNotes");
        await expectBody("无法获取发行说明");
    });

    it("CHANGELOG 没拿到时「在 GitHub 中打开」不可用", async () => {
        mocks.fetchChangelog.mockResolvedValue({status: "missing"});
        open({settings: settings({preferredSource: "commits"})});
        await expectBody("共 2 个提交");

        await switchTo("changelog");
        await expectBody("这个仓库没有 CHANGELOG");
        const openButton = control<HTMLButtonElement>("open");
        expect(openButton.disabled).toBe(true);
        click(openButton);
        expect(window.open).not.toHaveBeenCalled();
    });
});

describe("正文里的链接", () => {
    const withBody = (markdown: string) => {
        mocks.fetchReleases.mockResolvedValue({
            status: "ok",
            releases: releases().map((release) =>
                release.tag === "v1.2.3" ? {...release, markdown} : release),
        });
    };

    const linkOf = () => {
        const anchor = bodyEl().querySelector("a");
        if (!anchor) {
            throw new Error("the body has no link");
        }
        return anchor as HTMLAnchorElement;
    };

    it("指向本仓库 changelog 文件的链接就地切换来源", async () => {
        withBody(`<a href="https://github.com/owner/repo/blob/HEAD/CHANGELOG.md">日志</a>`);
        mocks.fetchChangelog.mockResolvedValue({status: "ok", markdown: "CHANGELOG 正文", path: "CHANGELOG.md"});
        open();
        await expectBody("日志");

        const event = click(linkOf());
        expect(event.defaultPrevented).toBe(true);
        await expectBody("CHANGELOG 正文");
        expect(control<HTMLSelectElement>("source").value).toBe("changelog");
    });

    it("指向发行版页面的链接切过去并选中那一版", async () => {
        withBody(`<a href="https://github.com/owner/repo/releases/tag/v2.0.0">v2.0.0</a>`);
        open();
        await expectBody("v2.0.0");

        click(linkOf());
        await expectBody("比集市更新的版本");
        expect(control<HTMLSelectElement>("source").value).toBe("releaseNotes");
        expect(control<HTMLSelectElement>("version").value).toBe("v2.0.0");
    });

    it("指向提交对比的链接切到提交记录并套用范围", async () => {
        withBody(`<a href="https://github.com/owner/repo/compare/v1.0.0...v1.1.0">对比</a>`);
        open();
        await expectBody("对比");

        click(linkOf());
        await expectBody("共 2 个提交");
        expect(control<HTMLSelectElement>("source").value).toBe("commits");
        expect(mocks.fetchCommits.mock.calls.at(-1)?.[1]).toEqual({base: "v1.0.0", head: "v1.1.0"});
    });

    it("带修饰键的点击交给浏览器", async () => {
        withBody(`<a href="https://github.com/owner/repo/releases/tag/v2.0.0">v2.0.0</a>`);
        open();
        await expectBody("v2.0.0");

        const event = click(linkOf(), {ctrlKey: true});
        expect(event.defaultPrevented).toBe(false);
        expect(control<HTMLSelectElement>("source").value).toBe("releaseNotes");
    });

    it("别的仓库的链接不接管", async () => {
        withBody(`<a href="https://github.com/other/repo/releases/tag/v2.0.0">v2.0.0</a>`);
        open();
        await expectBody("v2.0.0");

        const event = click(linkOf());
        expect(event.defaultPrevented).toBe(false);
    });

    it("关掉链接化引用后正文里的 #12 保持纯文本", async () => {
        withBody("修了 #12");
        open({settings: settings({githubReferences: false})});
        await expectBody("修了 #12");
        expect(bodyEl().querySelector("a")).toBeNull();
    });
});
