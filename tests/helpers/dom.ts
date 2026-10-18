/** 集市详情页侧栏的 DOM 构造，结构与思源渲染出来的保持一致。 */

export interface ISectionRow {
    label: string;
    value: string;
}

export interface ISection {
    /** 分组标题；不给时只建行，用来测「按发行日期/安装日期反查分组」的兜底。 */
    title?: string;
    rows: ISectionRow[];
}

export const createSection = (section: ISection): HTMLElement => {
    const element = document.createElement("div");
    element.className = "item__meta-section";
    if (section.title !== undefined) {
        const title = document.createElement("div");
        title.className = "item__meta-title";
        title.textContent = section.title;
        element.append(title);
    }
    for (const row of section.rows) {
        const rowElement = document.createElement("div");
        rowElement.className = "item__meta-row";
        const label = document.createElement("div");
        label.textContent = row.label;
        const value = document.createElement("div");
        value.textContent = row.value;
        rowElement.append(label, value);
        element.append(rowElement);
    }
    return element;
};

export interface ISideOptions {
    repoURL?: string;
    packageName?: string;
    packageType?: string;
    /** 集市信息分组的标题，默认「集市信息」；传 null 时不带标题。 */
    marketTitle?: string | null;
    /** 安装信息分组的标题，默认「安装信息」；传 null 时不带标题。 */
    installTitle?: string | null;
    /** 版本行的标签，默认「版本」。 */
    versionLabel?: string;
    releaseDateLabel?: string;
    installDateLabel?: string;
    marketVersion?: string;
    installedVersion?: string;
    /** 额外附加到侧栏上的分组。 */
    extraSections?: ISection[];
}

export const createSide = (options: ISideOptions = {}): HTMLElement => {
    const side = document.createElement("div");
    side.className = "item__side";
    if (options.repoURL !== undefined) {
        side.setAttribute("data-repourl", options.repoURL);
    }
    if (options.packageName !== undefined) {
        side.setAttribute("data-name", options.packageName);
    }
    if (options.packageType !== undefined) {
        side.setAttribute("data-package-type", options.packageType);
    }
    const versionLabel = options.versionLabel ?? "版本";
    const market: ISection = {
        title: options.marketTitle === undefined ? "集市信息" : options.marketTitle ?? undefined,
        rows: [
            {label: versionLabel, value: options.marketVersion ?? "v1.2.3"},
            {label: options.releaseDateLabel ?? "发行日期", value: "2024-05-01"},
        ],
    };
    const install: ISection = {
        title: options.installTitle === undefined ? "安装信息" : options.installTitle ?? undefined,
        rows: [
            {label: versionLabel, value: options.installedVersion ?? "v1.2.2"},
            {label: options.installDateLabel ?? "安装日期", value: "2024-04-20"},
        ],
    };
    side.append(createSection(market), createSection(install), ...(options.extraSections ?? []).map(createSection));
    return side;
};

export const createReadme = (side: HTMLElement): HTMLElement => {
    const readme = document.createElement("div");
    readme.id = "configBazaarReadme";
    readme.append(side);
    return readme;
};

/** 从弹窗 DOM 里取正文容器。 */
export const bodyOf = (dialog: HTMLElement): HTMLElement =>
    dialog.querySelector(".bazaar-release-notes__body") as HTMLElement;

/** 取弹窗里某个下拉/按钮。 */
export const controlOf = <T extends Element>(dialog: HTMLElement, type: string): T =>
    dialog.querySelector(`[data-type="${type}"]`) as T;

/** 弹窗当前显示的纯文本，断言提示语时用。 */
export const textOf = (element: Element | null | undefined): string =>
    (element?.textContent || "").replace(/\s+/g, " ").trim();
