import {webcrypto} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import zhCN from "../../src/i18n/zh-CN.json";
import {DEFAULT_ACCELERATION, DEFAULT_SETTINGS} from "../../src/settings";
import {flush} from "../helpers/network";
import {stubState} from "../stubs/siyuan";

const mocks = vi.hoisted(() => ({
    interceptBazaarUpdate: vi.fn(),
    observeBazaarReadme: vi.fn(),
}));

vi.mock("../../src/update", () => ({interceptBazaarUpdate: mocks.interceptBazaarUpdate}));
vi.mock("../../src/bazaarDom", () => ({observeBazaarReadme: mocks.observeBazaarReadme}));

type PluginClass = typeof import("../../src/index").default;
type PluginInstance = InstanceType<PluginClass>;

let ReleaseNotePlugin: PluginClass;
let disposeUpdate: ReturnType<typeof vi.fn>;
let disposeReadme: ReturnType<typeof vi.fn>;

const createPlugin = async (): Promise<PluginInstance> =>
    new ReleaseNotePlugin({
        app: {},
        name: "bazaar-changelog",
        displayName: "更新日志",
        i18n: zhCN,
    });

/**
 * 打开设置面板，把每个条目建成控件。思源只在打开面板时建一次，
 * 这里同样只建一次并缓存，否则后面按标题取控件会把之前改过的值丢掉。
 */
const rendered = new WeakMap<PluginInstance, HTMLElement[]>();
const render = (plugin: PluginInstance): HTMLElement[] => {
    let elements = rendered.get(plugin);
    if (!elements) {
        elements = (plugin.setting as any).render() as HTMLElement[];
        rendered.set(plugin, elements);
    }
    return elements;
};

const control = (plugin: PluginInstance, index: number) => render(plugin)[index] as HTMLInputElement;

/** 按标题找控件，比按下标稳一些。 */
const byTitle = (plugin: PluginInstance, title: string) => {
    const items = (plugin.setting as any).items as Array<{title: string}>;
    const index = items.findIndex((item) => item.title === title);
    if (index < 0) {
        throw new Error(`no setting item titled ${title}`);
    }
    return control(plugin, index);
};

const confirm = async (plugin: PluginInstance) => {
    (plugin.setting as any).triggerConfirm();
    await flush();
};

const stored = async (plugin: PluginInstance, name: string) => plugin.loadData(name);

beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("crypto", webcrypto);
    disposeUpdate = vi.fn();
    disposeReadme = vi.fn();
    mocks.interceptBazaarUpdate.mockReset().mockReturnValue(disposeUpdate);
    mocks.observeBazaarReadme.mockReset().mockReturnValue(disposeReadme);
    ({default: ReleaseNotePlugin} = await import("../../src/index"));
});

describe("onload", () => {
    it("没有落盘数据时用默认设置建出设置面板", async () => {
        const plugin = await createPlugin();
        await plugin.onload();

        const items = (plugin.setting as any).items as Array<{title: string}>;
        expect(items.map((item) => item.title)).toEqual([
            "优先加载",
            "识别空发行说明",
            "链接化引用",
            "GitHub 加速",
            "GitHub 令牌",
            "移动端底部抽屉",
            "调试模式",
        ]);
        expect(byTitle(plugin, "优先加载").value).toBe("releaseNotes");
        expect(byTitle(plugin, "识别空发行说明").checked).toBe(true);
        expect(byTitle(plugin, "链接化引用").value).toBe("mobile");
        // 加速改成独立窗口：设置页里只有入口按钮
        expect(byTitle(plugin, "GitHub 加速").textContent).toBe("配置");
        expect(byTitle(plugin, "移动端底部抽屉").checked).toBe(false);
        expect(byTitle(plugin, "调试模式").checked).toBe(false);
    });

    it("读回落盘设置，非法值回落默认", async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        await plugin.saveData("settings", {
            preferredSource: "commits",
            githubAcceleration: true,
            githubAccelerationURL: " https://gh-proxy.com ",
            botReleaseNotesAsEmpty: false,
            debug: true,
        });
        await plugin.onload();

        expect(byTitle(plugin, "优先加载").value).toBe("commits");
        expect(byTitle(plugin, "识别空发行说明").checked).toBe(false);
        expect(byTitle(plugin, "调试模式").checked).toBe(true);
        // 旧的顶层开关与地址迁移成新结构，分项默认全开
        expect((plugin as any).settings.githubAcceleration).toEqual({
            ...DEFAULT_ACCELERATION,
            enabled: true,
            url: "https://gh-proxy.com",
        });
    });

    it("挂上集市详情页与更新按钮的监听", async () => {
        const plugin = await createPlugin();
        await plugin.onload();

        expect(mocks.interceptBazaarUpdate).toHaveBeenCalledTimes(1);
        expect(mocks.observeBazaarReadme).toHaveBeenCalledTimes(1);
        expect(typeof mocks.interceptBazaarUpdate.mock.calls[0][0]).toBe("function");
        expect(typeof mocks.interceptBazaarUpdate.mock.calls[0][1]).toBe("function");
    });

    it("调试模式打开时输出日志，关闭时一行都不打", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

        const quiet = await createPlugin();
        await quiet.onload();
        expect(log).not.toHaveBeenCalled();

        const loud = await createPlugin();
        await loud.saveData("settings", {...DEFAULT_SETTINGS, debug: true});
        await loud.onload();
        expect(log).toHaveBeenCalled();
        expect(String(log.mock.calls[0][0])).toContain("[bazaar-changelog] onload");
    });

    it("解出落盘的令牌填进输入框", async () => {
        const plugin = await createPlugin();
        const {createSecretKey, encryptSecret, exportSecretKey} = await import("../../src/secret");
        const key = await createSecretKey();
        await plugin.saveData("githubToken", await encryptSecret("ghp_stored", key));
        await plugin.saveData("githubTokenKey", await exportSecretKey(key));
        await plugin.onload();

        expect(byTitle(plugin, "GitHub 令牌").value).toBe("ghp_stored");
    });

    it("令牌解不开时当作没配，不抛错", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        await plugin.saveData("githubToken", "v1:broken:broken");
        await plugin.saveData("githubTokenKey", "broken");
        await expect(plugin.onload()).resolves.toBeUndefined();
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("");
        expect(warn).toHaveBeenCalled();
    });

    it("文本框先标成 readonly，等本轮任务结束再放开", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        const token = byTitle(plugin, "GitHub 令牌");
        expect(token.getAttribute("readonly")).toBe("readonly");

        await flush();
        expect(token.hasAttribute("readonly")).toBe(false);
    });
});

describe("保存设置", () => {
    it("把控件里的值合并后落盘，并同步回控件", async () => {
        const plugin = await createPlugin();
        await plugin.onload();

        byTitle(plugin, "优先加载").value = "changelog";
        byTitle(plugin, "识别空发行说明").checked = false;
        byTitle(plugin, "链接化引用").value = "off";
        byTitle(plugin, "移动端底部抽屉").checked = true;
        byTitle(plugin, "调试模式").checked = true;
        await confirm(plugin);

        expect(await stored(plugin, "settings")).toEqual({
            preferredSource: "changelog",
            githubAcceleration: {...DEFAULT_ACCELERATION},
            botReleaseNotesAsEmpty: false,
            referenceLinkStyle: "off",
            mobileDrawer: true,
            debug: true,
        });
        expect(byTitle(plugin, "优先加载").value).toBe("changelog");
        expect(byTitle(plugin, "链接化引用").value).toBe("off");
    });

    it("写盘失败时提示并且不按新值行事", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        vi.spyOn(plugin, "saveData").mockResolvedValue({code: 500, msg: "disk full"});

        byTitle(plugin, "优先加载").value = "commits";
        await confirm(plugin);

        expect(stubState.messages).toContain("[bazaar-changelog] disk full");
        expect(await stored(plugin, "settings")).toBeUndefined();
        // 没写成就不回写控件，用户看到的是自己刚才选的那一项
        expect(byTitle(plugin, "优先加载").value).toBe("commits");
    });

    it("saveData 抛错时提示", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        vi.spyOn(plugin, "saveData").mockRejectedValue(new Error("boom"));

        await confirm(plugin);
        expect(stubState.messages).toContain("[bazaar-changelog] Error: boom");
    });
});

describe("GitHub 加速配置", () => {
    const accelerationControl = <T extends HTMLInputElement>(type: string) =>
        document.querySelector(`.bazaar-acceleration [data-type="${type}"]`) as T;
    const openWindow = async (plugin: PluginInstance) => {
        byTitle(plugin, "GitHub 加速").click();
        await flush();
    };
    const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

    it("入口按钮打开独立窗口，并带出当前配置", async () => {
        const plugin = await createPlugin();
        await plugin.saveData("settings", {
            githubAcceleration: {enabled: true, url: "https://gh-proxy.com/", changelog: false},
        });
        await plugin.onload();
        await openWindow(plugin);

        expect(accelerationControl("enabled").checked).toBe(true);
        expect(accelerationControl("url").value).toBe("https://gh-proxy.com/");
        expect(accelerationControl("changelog").checked).toBe(false);
        expect(accelerationControl("avatars").checked).toBe(true);
    });

    it("分项开关收在一组里，与总开关、加速地址分开", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        await openWindow(plugin);

        const group = document.querySelector(".bazaar-acceleration__items") as HTMLElement;
        expect(group).not.toBeNull();
        expect(Array.from(group.querySelectorAll("input[data-type]")).map((input) => input.getAttribute("data-type")))
            .toEqual(["releaseNotes", "changelog", "commits", "avatars"]);
        // 总开关与地址留在这组外面，视觉上是上一层
        expect(group.querySelector('[data-type="enabled"]')).toBeNull();
        expect(group.querySelector('[data-type="url"]')).toBeNull();
    });

    it("保存后落盘并关窗，地址去掉首尾空白", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        await openWindow(plugin);
        accelerationControl("enabled").checked = true;
        accelerationControl("url").value = " https://gh-proxy.com ";
        accelerationControl("commits").checked = false;
        click('.b3-dialog [data-type="save"]');
        await flush(6);

        expect((await stored(plugin, "settings"))?.githubAcceleration).toEqual({
            ...DEFAULT_ACCELERATION,
            enabled: true,
            url: "https://gh-proxy.com",
            commits: false,
        });
        expect(document.querySelector(".bazaar-acceleration")).toBeNull();
    });

    it("取消不落盘", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        await openWindow(plugin);
        accelerationControl("enabled").checked = true;
        click('.b3-dialog [data-type="close"]');
        await flush();

        expect(await stored(plugin, "settings")).toBeUndefined();
        expect(document.querySelector(".bazaar-acceleration")).toBeNull();
    });

    it("地址不是 http(s) 前缀时当场提示", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        await openWindow(plugin);
        const url = accelerationControl("url");
        url.value = "gh-proxy.com";
        url.dispatchEvent(new Event("input"));

        const hint = document.querySelector('.bazaar-acceleration [data-type="invalid"]') as HTMLElement;
        expect(hint.classList.contains("fn__none")).toBe(false);

        url.value = "https://gh-proxy.com";
        url.dispatchEvent(new Event("input"));
        expect(hint.classList.contains("fn__none")).toBe(true);
    });

    it("写盘失败时窗口留着，提示写盘原因", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        await openWindow(plugin);
        vi.spyOn(plugin, "saveData").mockResolvedValue({code: 500, msg: "disk full"});
        click('.b3-dialog [data-type="save"]');
        await flush(6);

        expect(stubState.messages).toContain("[bazaar-changelog] disk full");
        expect(document.querySelector(".bazaar-acceleration")).not.toBeNull();
    });
});

describe("令牌的保存", () => {
    it("输入新令牌后加密落盘，并把输入框同步成明文", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        byTitle(plugin, "GitHub 令牌").value = "ghp_new";

        await confirm(plugin);

        const blob = await stored(plugin, "githubToken");
        const rawKey = await stored(plugin, "githubTokenKey");
        expect(typeof blob).toBe("string");
        expect(String(blob).startsWith("v1:")).toBe(true);
        expect(String(blob)).not.toContain("ghp_new");
        expect(typeof rawKey).toBe("string");
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("ghp_new");

        const {decryptSecret, importSecretKey} = await import("../../src/secret");
        expect(await decryptSecret(String(blob), await importSecretKey(String(rawKey)))).toBe("ghp_new");
    });

    it("令牌没改动时不重新落盘", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        const save = vi.spyOn(plugin, "saveData");

        await confirm(plugin);

        expect(save.mock.calls.some(([name]) => name === "githubToken")).toBe(false);
    });

    it("清空令牌会删掉密文与钥匙", async () => {
        const plugin = await createPlugin();
        const {createSecretKey, encryptSecret, exportSecretKey} = await import("../../src/secret");
        const key = await createSecretKey();
        await plugin.saveData("githubToken", await encryptSecret("ghp_stored", key));
        await plugin.saveData("githubTokenKey", await exportSecretKey(key));
        await plugin.onload();

        byTitle(plugin, "GitHub 令牌").value = "";
        await confirm(plugin);

        expect(await stored(plugin, "githubToken")).toBeUndefined();
        expect(await stored(plugin, "githubTokenKey")).toBeUndefined();
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("");
    });

    it("没有 Web Crypto 时明确提示，且不落盘", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        vi.stubGlobal("crypto", {getRandomValues: (array: Uint8Array) => array});

        byTitle(plugin, "GitHub 令牌").value = "ghp_new";
        await confirm(plugin);

        expect(stubState.messages).toContain("[bazaar-changelog] 当前访问方式不支持 Web Crypto，令牌无法加密保存；请用桌面端或 https 访问");
        expect(await stored(plugin, "githubToken")).toBeUndefined();
    });

    it("写盘出错时回滚内存里的令牌并提示", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        await plugin.onload();
        const original = plugin.saveData.bind(plugin);
        // 设置本身能存，只有令牌写盘失败
        vi.spyOn(plugin, "saveData").mockImplementation(async (name: string, value: unknown) => {
            if (name === "githubToken" || name === "githubTokenKey") {
                throw new Error("disk full");
            }
            return original(name, value);
        });

        byTitle(plugin, "GitHub 令牌").value = "ghp_new";
        await confirm(plugin);

        expect(stubState.messages.some((message) => message.includes("disk full"))).toBe(true);
        expect(warn).toHaveBeenCalledWith("[bazaar-changelog] token: saving failed", expect.anything());
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("");
    });

    it("宿主说存好了但读不回来时按保存失败处理", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        await plugin.onload();
        const original = plugin.saveData.bind(plugin);
        // 落盘请求 resolve 了，但存储里什么都没有（宿主的 saveData 可能提前 resolve）
        vi.spyOn(plugin, "saveData").mockImplementation(async (name: string, value: unknown) =>
            name === "githubToken" || name === "githubTokenKey" ? {code: 0} : original(name, value));

        byTitle(plugin, "GitHub 令牌").value = "ghp_new";
        await confirm(plugin);

        expect(stubState.messages.some((message) => message.includes("the token was not stored"))).toBe(true);
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("");
    });

    it("读回来对不上时按保存失败处理", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        await plugin.onload();
        const {createSecretKey, encryptSecret, exportSecretKey} = await import("../../src/secret");
        const original = plugin.saveData.bind(plugin);
        vi.spyOn(plugin, "saveData").mockImplementation(async (name: string, value: unknown) => {
            if (name === "githubToken") {
                // 存进去的是另一段明文（连同它的钥匙），读回来校验必须发现对不上
                const otherKey = await createSecretKey();
                await original("githubTokenKey", await exportSecretKey(otherKey));
                return original(name, await encryptSecret("ghp_other", otherKey));
            }
            return original(name, value);
        });

        byTitle(plugin, "GitHub 令牌").value = "ghp_new";
        await confirm(plugin);

        expect(stubState.messages.some((message) => message.includes("the stored token does not read back")))
            .toBe(true);
        expect(byTitle(plugin, "GitHub 令牌").value).toBe("");
    });
});

describe("卸载与释放", () => {
    it("onunload 释放两个监听", async () => {
        const plugin = await createPlugin();
        await plugin.onload();
        plugin.onunload();
        expect(disposeUpdate).toHaveBeenCalledTimes(1);
        expect(disposeReadme).toHaveBeenCalledTimes(1);
    });

    it("uninstall 清掉插件私有的存储文件", async () => {
        const plugin = await createPlugin();
        const remove = vi.spyOn(plugin, "removeData");
        await plugin.uninstall();
        expect(remove.mock.calls.map(([name]) => name))
            .toEqual(["settings", "githubProbe", "githubToken", "githubTokenKey"]);
    });

    it("404 不算失败，其他错误码留下警告", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        vi.spyOn(plugin, "removeData").mockImplementation(async (name: string) => {
            if (name === "settings") {
                return {code: 404};
            }
            return {code: 500, msg: "denied"};
        });

        await plugin.uninstall();

        expect(warn).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledWith("[bazaar-changelog] uninstall: removing githubToken failed", {
            code: 500,
            msg: "denied",
        });
    });

    it("removeData 抛错时留下警告而不是中断卸载", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const plugin = await createPlugin();
        vi.spyOn(plugin, "removeData").mockRejectedValue(new Error("offline"));

        await expect(plugin.uninstall()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(4);
        expect(warn).toHaveBeenCalledWith("[bazaar-changelog] uninstall: removing settings failed", {
            error: "Error: offline",
        });
    });
});
