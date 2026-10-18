import {vi} from "vitest";

/** 测试里给 `fetch` 用的响应替身，只实现插件实际读到的几个字段。 */
export interface IResponseInit {
    status?: number;
    /** 覆盖正文；不给时用 `json` 序列化。 */
    text?: string;
    headers?: Record<string, string>;
}

export interface IMockResponse {
    ok: boolean;
    status: number;
    headers: {get(name: string): string | null};
    text(): Promise<string>;
    json(): Promise<unknown>;
}

export const mockResponse = (payload?: unknown, init: IResponseInit = {}): IMockResponse => {
    const status = init.status ?? 200;
    const headers = init.headers ?? {};
    const body = init.text ?? (payload === undefined ? "" : JSON.stringify(payload));
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name: string) => headers[name.toLowerCase()] ?? null,
        },
        text: async () => body,
        json: async () => {
            if (payload === undefined) {
                return JSON.parse(body);
            }
            return payload;
        },
    };
};

export type TFetchHandler = (url: string, init: RequestInit) => Promise<unknown> | unknown;

/** 装一个 fetch 替身，并把每次请求记下来。 */
export const stubFetch = (handler: TFetchHandler) => {
    const calls: Array<{url: string, init: RequestInit}> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
        calls.push({url, init: init ?? {}});
        return handler(url, init ?? {});
    });
    vi.stubGlobal("fetch", fetchMock);
    return {fetchMock, calls};
};

/** 一个可以手动兑现的 Promise，用来精确控制响应到达的时机。 */
export const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
};

/**
 * 挂起直到被 abort：给超时相关的测试用。`onAbort` 可以用来确认插件确实取消了请求。
 */
export const abortable = (init: RequestInit, onAbort?: () => void): Promise<never> =>
    new Promise((_resolve, reject) => {
        const signal = init.signal;
        const abort = () => {
            onAbort?.();
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
        };
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener("abort", abort, {once: true});
    });

/** 让出若干轮事件循环，等插件的异步链走完。 */
export const flush = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
};
