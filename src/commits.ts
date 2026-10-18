import {resolveGithubURL} from "./github";
import {debug} from "./logger";
import type {ISettings} from "./settings";
import {githubAPIHeaders, willAuthorize} from "./token";

/** 列表里的一条提交。`message` 保留全文，弹窗只折叠展示首行。 */
export interface ICommit {
    sha: string;
    message: string;
    author: string;
    /** 提交时间，GitHub 给的 ISO 8601。 */
    date: string;
}

export type TCommitsResult =
    | {status: "ok", commits: ICommit[], total: number}
    /** 两个端点之间没有提交（compare 的 `identical`，或列表接口返回空）。 */
    | {status: "empty"}
    /** 超过本次超时。 */
    | {status: "timeout"}
    /** 其他失败（网络错误、HTTP 错误码、限流）；`forbidden` 表示对方回了 403。 */
    | {status: "error", forbidden?: boolean};

const COMMITS_API = "https://api.github.com";
/** 和发行说明同一个缓存窗口：仓库的历史不会在半小时里变样。 */
const CACHE_TTL = 30 * 60 * 1000;
/** 列表接口一页最多 100 条；compare 接口自己最多给 250 条。 */
const PAGE_SIZE = 100;

const cache = new Map<string, {time: number, commits: ICommit[], total: number}>();

export const commitURL = (repo: string, sha: string): string => `https://github.com/${repo}/commit/${sha}`;

/** 短哈希只用于显示，跳转仍用完整 sha。 */
export const shortSha = (sha: string): string => sha.slice(0, 7);

/** 两个端点之间的提交对比页。 */
export const compareURL = (repo: string, base: string, head: string): string =>
    `https://github.com/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;

interface IGithubCommit {
    sha?: unknown;
    html_url?: unknown;
    commit?: {
        message?: unknown;
        author?: {name?: unknown, date?: unknown} | null;
    } | null;
}

const toCommit = (item: IGithubCommit): ICommit | undefined => {
    if (!item || typeof item !== "object" || typeof item.sha !== "string" || !item.sha) {
        return undefined;
    }
    const commit = item.commit && typeof item.commit === "object" ? item.commit : undefined;
    const author = commit?.author && typeof commit.author === "object" ? commit.author : undefined;
    return {
        sha: item.sha,
        message: typeof commit?.message === "string" ? commit.message : "",
        author: typeof author?.name === "string" ? author.name : "",
        date: typeof author?.date === "string" ? author.date : "",
    };
};

/** 地址：有起点用 compare，没有起点就列该端点最近的提交。 */
const buildURL = (repo: string, base: string, head: string): string => {
    if (base && base !== head) {
        return `${COMMITS_API}/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    }
    const suffix = head && head !== "HEAD" ? `&sha=${encodeURIComponent(head)}` : "";
    return `${COMMITS_API}/repos/${repo}/commits?per_page=${PAGE_SIZE}${suffix}`;
};

/**
 * 取一段版本范围内的提交记录，只打 api.github.com，开了加速就和发行说明一样改写地址。
 * `base` 为空表示不限定起点，取 `head` 上最近的提交。
 */
export const fetchCommits = async (
    repo: string,
    range: {base: string, head: string},
    settings: ISettings,
    timeoutMs: number,
): Promise<TCommitsResult> => {
    const url = resolveGithubURL(buildURL(repo, range.base, range.head), settings);
    const cached = cache.get(url);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        debug(`commits: cache hit for ${repo}`, {
            count: cached.commits.length,
            ageSeconds: Math.round((Date.now() - cached.time) / 1000),
        });
        return {status: "ok", commits: cached.commits, total: cached.total};
    }
    debug(`commits: GET ${url}`, {
        base: range.base || "(none)",
        head: range.head || "(none)",
        acceleration: settings.githubAcceleration,
        authorized: willAuthorize(url),
        timeoutMs,
    });
    const started = Date.now();
    let timedOut = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: githubAPIHeaders(url),
        });
        if (!response.ok) {
            debug(`commits: ${repo} responded ${response.status}`, {
                elapsed: Date.now() - started,
                forbidden: response.status === 403,
                rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
                rateLimitReset: response.headers.get("x-ratelimit-reset"),
            });
            // 403 多半是被限流或反代拦下，弹窗要能据此给出更具体的提示
            return {status: "error", forbidden: response.status === 403};
        }
        const payload: unknown = await response.json();
        // compare 回 {commits, total_commits}，列表接口直接回数组
        const list = Array.isArray(payload) ? payload :
            (payload && typeof payload === "object" ? (payload as {commits?: unknown}).commits : undefined);
        if (!Array.isArray(list)) {
            debug(`commits: ${repo} did not return a commit list`, {payload});
            return {status: "error"};
        }
        const commits = list
            .filter((item): item is IGithubCommit => Boolean(item) && typeof item === "object")
            .map(toCommit)
            .filter((item): item is ICommit => Boolean(item))
            // compare 与列表接口都是旧的在前，弹窗里按新的在前看
            .reverse();
        const reported = payload && typeof payload === "object" ?
            (payload as {total_commits?: unknown}).total_commits : undefined;
        const total = typeof reported === "number" && reported > 0 ? reported : commits.length;
        debug(`commits: ${repo} kept ${commits.length} of ${list.length}`, {
            elapsed: Date.now() - started,
            total,
            rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
            range: {base: range.base, head: range.head},
        });
        if (commits.length === 0) {
            return {status: "empty"};
        }
        cache.set(url, {time: Date.now(), commits, total});
        return {status: "ok", commits, total};
    } catch (error) {
        debug(`commits: ${repo} ${timedOut ? "timed out" : "failed"}`, {
            elapsed: Date.now() - started,
            timeoutMs,
            error: String(error),
        });
        return {status: timedOut ? "timeout" : "error"};
    } finally {
        window.clearTimeout(timer);
    }
};
