import {describe, expect, it} from "vitest";
import {DEFAULT_SETTINGS, mergeSettings} from "../../src/settings";

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
            githubAcceleration: true,
            githubAccelerationURL: "https://gh-proxy.com",
            botReleaseNotesAsEmpty: false,
            githubReferences: false,
            debug: true,
        })).toEqual({
            preferredSource: "changelog",
            githubAcceleration: true,
            githubAccelerationURL: "https://gh-proxy.com",
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
            githubAcceleration: "true",
            debug: 1,
        });
        expect(merged.githubAcceleration).toBe(false);
        expect(merged.debug).toBe(false);
    });

    it("加速地址去掉首尾空白，非字符串回落默认", () => {
        expect(mergeSettings({githubAccelerationURL: "  https://gh-proxy.com/  "}).githubAccelerationURL)
            .toBe("https://gh-proxy.com/");
        expect(mergeSettings({githubAccelerationURL: 3}).githubAccelerationURL).toBe("");
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
    });
});
