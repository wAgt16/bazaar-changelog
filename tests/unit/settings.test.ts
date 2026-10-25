import {describe, expect, it} from "vitest";
import {DEFAULT_ACCELERATION, DEFAULT_SETTINGS, mergeSettings} from "../../src/settings";

const acceleration = (overrides: Partial<typeof DEFAULT_ACCELERATION> = {}) => ({
    ...DEFAULT_ACCELERATION,
    ...overrides,
});

describe("mergeSettings", () => {
    it("没有落盘数据时给默认值", () => {
        expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    });

    it("非对象数据按没有处理", () => {
        expect(mergeSettings("changelog")).toEqual(DEFAULT_SETTINGS);
        expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
        expect(mergeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    });

    it("保留合法的取值", () => {
        expect(mergeSettings({
            preferredSource: "changelog",
            githubAcceleration: {enabled: true, url: " https://gh-proxy.com ", commits: false},
            botReleaseNotesAsEmpty: false,
            githubReferences: false,
            debug: true,
        })).toEqual({
            preferredSource: "changelog",
            githubAcceleration: acceleration({enabled: true, url: "https://gh-proxy.com", commits: false}),
            botReleaseNotesAsEmpty: false,
            githubReferences: false,
            debug: true,
        });
    });

    it("未知的优先来源回落到发行说明", () => {
        expect(mergeSettings({preferredSource: "commits"}).preferredSource).toBe("commits");
        expect(mergeSettings({preferredSource: "github"}).preferredSource).toBe("releaseNotes");
        expect(mergeSettings({preferredSource: 1}).preferredSource).toBe("releaseNotes");
    });

    it("布尔项只认真正的 true/false", () => {
        const merged = mergeSettings({
            githubAcceleration: {enabled: "true"},
            debug: 1,
        });
        expect(merged.githubAcceleration.enabled).toBe(false);
        expect(merged.debug).toBe(false);
    });

    it("加速地址去掉首尾空白，非字符串回落默认", () => {
        expect(mergeSettings({githubAcceleration: {url: "  https://gh-proxy.com/  "}}).githubAcceleration.url)
            .toBe("https://gh-proxy.com/");
        expect(mergeSettings({githubAcceleration: {url: 3}}).githubAcceleration.url).toBe("");
    });

    it("旧的顶层加速开关与地址迁移成新结构", () => {
        expect(mergeSettings({
            githubAcceleration: true,
            githubAccelerationURL: " https://gh-proxy.com ",
        }).githubAcceleration).toEqual(acceleration({enabled: true, url: "https://gh-proxy.com"}));
        // 关着的时候地址照旧留着，用户下次打开开关不用重填
        expect(mergeSettings({
            githubAcceleration: false,
            githubAccelerationURL: "https://gh-proxy.com/",
        }).githubAcceleration).toEqual(acceleration({url: "https://gh-proxy.com/"}));
    });

    it("加速的分项开关默认开着，只有明确存了 false 才关", () => {
        expect(mergeSettings({githubAcceleration: {}}).githubAcceleration).toEqual(acceleration());
        expect(mergeSettings({
            githubAcceleration: {changelog: false, avatars: false},
        }).githubAcceleration).toEqual(acceleration({changelog: false, avatars: false}));
        expect(mergeSettings({
            githubAcceleration: {changelog: 0, releaseNotes: "no"},
        }).githubAcceleration).toEqual(acceleration());
    });

    it("默认开启的两项只有明确存了 false 才关闭", () => {
        expect(mergeSettings({}).botReleaseNotesAsEmpty).toBe(true);
        expect(mergeSettings({botReleaseNotesAsEmpty: false}).botReleaseNotesAsEmpty).toBe(false);
        expect(mergeSettings({botReleaseNotesAsEmpty: 0}).botReleaseNotesAsEmpty).toBe(true);
        expect(mergeSettings({githubReferences: false}).githubReferences).toBe(false);
        expect(mergeSettings({githubReferences: "no"}).githubReferences).toBe(true);
    });

    it("丢掉不认识的字段", () => {
        expect(mergeSettings({preferredSource: "commits", somethingElse: true}))
            .toEqual({...DEFAULT_SETTINGS, preferredSource: "commits"});
        // 迁移过的旧字段不会留在结果里
        expect(mergeSettings({githubAcceleration: true, githubAccelerationURL: "https://gh-proxy.com/"}))
            .toEqual({...DEFAULT_SETTINGS, githubAcceleration: acceleration({enabled: true, url: "https://gh-proxy.com/"})});
    });
});
