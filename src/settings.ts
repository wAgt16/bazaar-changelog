/** 弹窗的三种来源。 */
export type TChangelogSource = "releaseNotes" | "changelog" | "commits";

export interface ISettings {
    /** 打开更新日志弹窗时默认显示哪一种来源。 */
    preferredSource: TChangelogSource;
    /** 是否让发行说明与 CHANGELOG 的请求改走加速地址。 */
    githubAcceleration: boolean;
    /** 前缀式加速地址，拼在 api.github.com 与 raw.githubusercontent.com 的原始地址之前。 */
    githubAccelerationURL: string;
    /** 把只有 Full Changelog 链接的发行说明当成「该版本没有发行说明」。 */
    botReleaseNotesAsEmpty: boolean;
    /** 把 #123、owner/repo#123 与 @user 渲染成指向 GitHub 的链接。 */
    githubReferences: boolean;
    /** 是否在控制台输出本插件的完整过程日志。 */
    debug: boolean;
}

export const DEFAULT_SETTINGS: ISettings = {
    preferredSource: "releaseNotes",
    githubAcceleration: false,
    githubAccelerationURL: "https://gh-proxy.com/",
    botReleaseNotesAsEmpty: true,
    githubReferences: true,
    debug: false,
};

/** 校验落盘数据：缺失或非法值一律回落默认，并丢掉不认识的字段。 */
export const mergeSettings = (saved: unknown): ISettings => {
    const value = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
    const url = value.githubAccelerationURL;
    const source = value.preferredSource;
    return {
        preferredSource: source === "changelog" || source === "commits" ? source : "releaseNotes",
        githubAcceleration: value.githubAcceleration === true,
        githubAccelerationURL: typeof url === "string" ? url.trim() : DEFAULT_SETTINGS.githubAccelerationURL,
        // 这一项默认是开的，只有明确存了 false 才关
        botReleaseNotesAsEmpty: value.botReleaseNotesAsEmpty !== false,
        githubReferences: value.githubReferences !== false,
        debug: value.debug === true,
    };
};
