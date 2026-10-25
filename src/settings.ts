/** 弹窗的三种来源。 */
export type TChangelogSource = "releaseNotes" | "changelog" | "commits";

/** 可以单独决定是否走加速地址的四类请求。 */
export type TGithubRequest = TChangelogSource | "avatars";

/** GitHub 加速：一个总开关、一个前缀地址，加上每一类请求自己的开关。 */
export interface IGithubAcceleration {
    /** 总开关。关闭时四类请求一律直连，分项开关留着不动。 */
    enabled: boolean;
    /** 前缀式加速地址，拼在 api.github.com 与 raw.githubusercontent.com 的原始地址之前。 */
    url: string;
    releaseNotes: boolean;
    changelog: boolean;
    commits: boolean;
    avatars: boolean;
}

export interface ISettings {
    /** 打开更新日志弹窗时默认显示哪一种来源。 */
    preferredSource: TChangelogSource;
    githubAcceleration: IGithubAcceleration;
    /** 把只有 Full Changelog 链接的发行说明当成「该版本没有发行说明」。 */
    botReleaseNotesAsEmpty: boolean;
    /** 把 #123、owner/repo#123 与 @user 渲染成指向 GitHub 的链接。 */
    githubReferences: boolean;
    /** 是否在控制台输出本插件的完整过程日志。 */
    debug: boolean;
}

export const DEFAULT_ACCELERATION: IGithubAcceleration = {
    enabled: false,
    url: "",
    // 分项默认全开：打开了总开关却什么都没加速，是最容易让人以为开关坏了的状态
    releaseNotes: true,
    changelog: true,
    commits: true,
    avatars: true,
};

export const DEFAULT_SETTINGS: ISettings = {
    preferredSource: "releaseNotes",
    githubAcceleration: {...DEFAULT_ACCELERATION},
    botReleaseNotesAsEmpty: true,
    githubReferences: true,
    debug: false,
};

/**
 * 加速配置。旧版本把总开关与地址放在顶层的 `githubAcceleration` / `githubAccelerationURL`，
 * 读到布尔值就按那一套解释：当初打开总开关的人要的是「全部走加速」，分项因此给默认的全开。
 */
const mergeAcceleration = (saved: unknown, legacyURL: unknown): IGithubAcceleration => {
    if (typeof saved === "boolean" || saved === undefined) {
        return {
            ...DEFAULT_ACCELERATION,
            enabled: saved === true,
            url: typeof legacyURL === "string" ? legacyURL.trim() : "",
        };
    }
    const value = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
    const url = value.url;
    return {
        enabled: value.enabled === true,
        url: typeof url === "string" ? url.trim() : DEFAULT_ACCELERATION.url,
        // 分项开关默认是开的，只有明确存了 false 才关
        releaseNotes: value.releaseNotes !== false,
        changelog: value.changelog !== false,
        commits: value.commits !== false,
        avatars: value.avatars !== false,
    };
};

/** 校验落盘数据：缺失或非法值一律回落默认，并丢掉不认识的字段。 */
export const mergeSettings = (saved: unknown): ISettings => {
    const value = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
    const source = value.preferredSource;
    return {
        preferredSource: source === "changelog" || source === "commits" ? source : "releaseNotes",
        githubAcceleration: mergeAcceleration(value.githubAcceleration, value.githubAccelerationURL),
        // 这一项默认是开的，只有明确存了 false 才关
        botReleaseNotesAsEmpty: value.botReleaseNotesAsEmpty !== false,
        githubReferences: value.githubReferences !== false,
        debug: value.debug === true,
    };
};
