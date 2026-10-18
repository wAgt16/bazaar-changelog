import path from "node:path";
import {defineConfig} from "vitest/config";

/**
 * 测试跑在 jsdom 里：插件大半逻辑都在 DOM 上（集市详情页、更新按钮、弹窗），
 * 只有少数纯函数模块用不到它。
 *
 * `siyuan` 是宿主注入的模块，npm 包只提供类型，所以测试里一律指向 tests/stubs 下的桩。
 */
export default defineConfig({
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/**/*.test.ts"],
        alias: {
            siyuan: path.resolve(__dirname, "tests/stubs/siyuan.ts"),
        },
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "src/index.scss"],
            // 留一点余量：新增分支没测试时 CI 会失败，但不至于为一行 debug 分支卡住
            thresholds: {
                statements: 90,
                branches: 85,
                functions: 95,
                lines: 90,
            },
        },
    },
});
