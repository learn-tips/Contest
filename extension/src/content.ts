function resolveEnvUrl(value: string | undefined, fallback: string) {
    return value && !value.includes("${") ? value : fallback;
}

const APP_URL = resolveEnvUrl(
    import.meta.env.VITE_APP_URL,
    "https://contest.techinterviewprep.support"
);

const XIconSVG = `
<svg xmlns="http://www.w3.org/2000/svg" class="xicon-svg" viewBox="0 0 24 24" width="18" height="18">
<path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M13.414 12L19 17.586A1 1 0 0117.586 19L12 13.414 6.414 19A1 1 0 015 17.586L10.586 12 5 6.414A1 1 0 116.414 5L12 10.586 17.586 5A1 1 0 1119 6.414L13.414 12z"
></path>
</svg>`;

const dragHandlebarSVG = `<svg class="handlebar-svg" id="drag-handlebar-svg" width="2" height="20" viewBox="0 0 2 20" xmlns="http://www.w3.org/2000/svg">
<rect width="2" height="20"/>
</svg>`;

const openHandlebarSVG = `<svg class="handlebar-svg" id="open-handlebar-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
    <path fill-rule="evenodd" d="M7.913 19.071l7.057-7.078-7.057-7.064a1 1 0 011.414-1.414l7.764 7.77a1 1 0 010 1.415l-7.764 7.785a1 1 0 01-1.414-1.414z" clip-rule="evenodd"></path>
    </svg>`;

async function main() {
    let previousSubmissionId = "";
    let lastSubmitEventAt = 0;
    let activeSubmitVerdictTimer: ReturnType<typeof setInterval> | undefined;
    let pendingSubmissionEvents = new Map<string, ReturnType<typeof setInterval>>();
    let activeSubmissionAttempt:
        | {
              titleSlug: string;
              submittedAt: number;
              attemptId: string;
              submissionId?: string;
              finalMessageSent: boolean;
          }
        | undefined;
    const reactRoot = document.createElement("iframe");

    reactRoot.src = APP_URL;
    reactRoot.id = "tipsboard-iframe";
    reactRoot.allow = "clipboard-read; clipboard-write";

    const handlebar = document.createElement("div");
    handlebar.id = "tipsboard-handlebar";
    handlebar.style.minWidth = "8px";
    handlebar.style.userSelect = "none";
    handlebar.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.display = "none";

    let isResizing = false;
    let initialMousePosition = 0;
    let isOpen = true;

    function startResizing(event: MouseEvent) {
        isResizing = true;
        initialMousePosition = event.clientX;
        overlay.style.display = "block";
    }

    handlebar.addEventListener("mousedown", (event) => {
        if (!isOpen) {
            setToggleState(true);
            return;
        }
        startResizing(event);
    });
    handlebar.addEventListener("dragstart", (event) => event.preventDefault()); // Prevent the default drag behavior

    function setToggleState(toggleState: boolean) {
        if (toggleState) {
            reactRoot.style.display = "block";
            handlebar.innerHTML = `
            <div id="handlebar-highlight">${dragHandlebarSVG}</div>
            `;
            handlebar.style.cursor = "ew-resize";
            chrome.storage.local.set({ tipsboardToggleState: true });
            isOpen = true;
            handlebar.style.zIndex = "10";
        } else {
            reactRoot.style.display = "none";
            handlebar.innerHTML = openHandlebarSVG;
            handlebar.style.cursor = "pointer";
            chrome.storage.local.set({ tipsboardToggleState: false });
            isOpen = false;
            handlebar.style.zIndex = "0";
        }
    }

    function showPanel() {
        chrome.storage.local.get("tipsboardToggleState", (result) => {
            setToggleState(result.tipsboardToggleState ?? true);
        });
        chrome.storage.local.set({ shouldShowPanel: true });
        handlebar.style.display = "flex";
    }

    function hidePanel() {
        chrome.storage.local.set({ shouldShowPanel: false });
        reactRoot.style.display = "none";
        handlebar.style.display = "none";
    }

    handlebar.addEventListener("dblclick", () => {
        if (isOpen) {
            setToggleState(false);
        }
    });

    function stopResizing() {
        isResizing = false;
        overlay.style.display = "none"; // Hide the overlay
    }

    function throttle(func: any, limit: number) {
        let inThrottle: boolean;
        return (...args: any) => {
            if (!inThrottle) {
                func.apply(null, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    const MIN_WIDTH = 350;
    const MAX_WIDTH = 800;

    function updateWidth(event: MouseEvent) {
        if (!isResizing) return;
        const deltaX = initialMousePosition - event.clientX;
        initialMousePosition = event.clientX;
        const currentWidth = parseInt(reactRoot.style.width);
        let newWidth = currentWidth + deltaX;
        if (
            isOpen &&
            initialMousePosition - window.innerWidth - MIN_WIDTH > -450
        ) {
            setToggleState(false);
            return;
        } else if (
            !isOpen &&
            initialMousePosition - window.innerWidth - MIN_WIDTH < -450
        ) {
            setToggleState(true);
            return;
        }
        if (newWidth < MIN_WIDTH) {
            newWidth = MIN_WIDTH;
            if (
                deltaX < 0 &&
                event.clientX > handlebar.getBoundingClientRect().right
            ) {
                initialMousePosition = event.clientX;
            }
        } else if (newWidth > MAX_WIDTH) {
            newWidth = MAX_WIDTH;
            if (
                deltaX > 0 &&
                event.clientX < handlebar.getBoundingClientRect().left
            ) {
                initialMousePosition = event.clientX;
            }
        } else {
            if (
                deltaX < 0 &&
                event.clientX > handlebar.getBoundingClientRect().right
            ) {
                newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
            } else if (
                deltaX > 0 &&
                event.clientX < handlebar.getBoundingClientRect().left
            ) {
                newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
            } else {
                return;
            }
        }

        reactRoot.style.width = `${newWidth}px`;
        chrome.storage.local.set({ tipsboardWidth: newWidth });
    }
    window.addEventListener("mousemove", throttle(updateWidth, 16));
    window.addEventListener("mouseup", stopResizing);

    chrome.storage.local.get("tipsboardToggleState", (result) => {
        setToggleState(result.tipsboardToggleState ?? true);
    });
    chrome.storage.local.get("tipsboardWidth", (result) => {
        const tipsboardWidth = result.tipsboardWidth ?? "525";
        reactRoot.style.width = `${tipsboardWidth}px`;
    });
    chrome.storage.local.get("shouldShowPanel", (result) => {
        const shouldShowPanel = result.shouldShowPanel ?? true;
        if (shouldShowPanel) {
            showPanel();
        } else {
            hidePanel();
        }
    });

    const oldUIElement = document.querySelector("#app");
    if (oldUIElement) {
        chrome.storage.local.get("dismissedOldUIWarningAt", (result) => {
            const dismissedOldUIWarningAt = result.dismissedOldUIWarningAt;
            if (!dismissedOldUIWarningAt) {
                return;
            }
            const currentTimeInMilliseconds = new Date().getTime();
            const timeSinceDismissalInMilliseconds =
                currentTimeInMilliseconds - dismissedOldUIWarningAt;
            // Only show the warning if it has been dismissed for more than 1 month (2419200000 milliseconds)
            if (timeSinceDismissalInMilliseconds < 2419200000) {
                return;
            }

            const newUIWarningBanner = document.createElement("div");
            newUIWarningBanner.style.display = "flex";
            newUIWarningBanner.style.justifyContent = "center";
            newUIWarningBanner.style.alignItems = "center";
            newUIWarningBanner.style.backgroundColor = "#f0ad4e";
            newUIWarningBanner.style.color = "#fff";
            newUIWarningBanner.style.padding = "8px";
            newUIWarningBanner.style.textAlign = "center";

            const warningText = document.createElement("div");
            warningText.textContent =
                "TIPS is not compatible with the old LeetCode UI. Please switch to the new UI to use TIPS.";
            warningText.style.flexGrow = "1";
            warningText.style.paddingLeft = "96px";
            newUIWarningBanner.appendChild(warningText);

            const closeButton = document.createElement("div");
            closeButton.innerHTML = XIconSVG;
            closeButton.style.cursor = "pointer";
            closeButton.style.paddingTop = "5px";
            closeButton.style.paddingRight = "8px";
            closeButton.style.fill = "#fff";
            newUIWarningBanner.appendChild(closeButton);

            closeButton.addEventListener("click", () => {
                newUIWarningBanner.style.display = "none";
                const dismissedOldUIWarningAt = new Date().getTime();
                chrome.storage.local.set({
                    dismissedOldUIWarningAt: dismissedOldUIWarningAt,
                });
            });

            oldUIElement.prepend(newUIWarningBanner);
            return;
        });
    }

    const mainContentContainer = await waitForElement(["#qd-content"]);
    mainContentContainer.insertAdjacentElement("afterend", overlay);
    mainContentContainer.insertAdjacentElement("afterend", reactRoot);
    mainContentContainer.insertAdjacentElement("afterend", handlebar);

    type TIPSBoardSubmissionEvent = {
        extension: "tipsboard";
        button: "submit";
        event: "submit" | "accepted" | "verdict";
        currentProblem: string;
        submissionUrl: string;
        submissionEventId: string;
        verdict?: string;
    };

    function postSubmissionEvent(
        event: Omit<
            TIPSBoardSubmissionEvent,
            "extension" | "button" | "submissionEventId"
        > & { submissionEventId?: string }
    ) {
        if (!reactRoot.contentWindow) {
            return;
        }

        const { submissionEventId: customSubmissionEventId, ...eventBody } =
            event;
        const submissionEventId =
            customSubmissionEventId ??
            [
                eventBody.event,
                eventBody.currentProblem,
                eventBody.submissionUrl,
            ].join(":");

        if (pendingSubmissionEvents.has(submissionEventId)) {
            return;
        }

        const message: TIPSBoardSubmissionEvent = {
            extension: "tipsboard",
            button: "submit",
            submissionEventId,
            ...eventBody,
        };

        let attempts = 0;
        const send = () => {
            if (!reactRoot.contentWindow || attempts >= 20) {
                clearPendingSubmissionEvent(submissionEventId);
                return;
            }

            attempts += 1;
            reactRoot.contentWindow.postMessage(message, APP_URL);
        };

        send();
        pendingSubmissionEvents.set(submissionEventId, setInterval(send, 500));
    }

    function clearPendingSubmissionEvent(submissionEventId: string) {
        const timer = pendingSubmissionEvents.get(submissionEventId);
        if (!timer) {
            return;
        }

        clearInterval(timer);
        pendingSubmissionEvents.delete(submissionEventId);
    }

    window.addEventListener("message", (event) => {
        if (
            event.origin !== APP_URL ||
            event.data?.extension !== "tipsboard" ||
            event.data?.event !== "submission-received" ||
            !event.data?.submissionEventId
        ) {
            return;
        }

        clearPendingSubmissionEvent(event.data.submissionEventId);
    });

    let submissionButtonTimer: ReturnType<typeof setInterval>;
    async function handleClickSubmitCodeButton(submissionId: string) {
        clearInterval(submissionButtonTimer);
        const currentQuestionTitleSlug = getCurrentQuestionTitleSlug();
        if (
            !reactRoot.contentWindow ||
            !currentQuestionTitleSlug ||
            !isActiveSubmissionFor(currentQuestionTitleSlug)
        ) {
            return;
        }
        const submissionUrl = constructSubmissionUrl(
            currentQuestionTitleSlug,
            submissionId
        );

        if (
            activeSubmissionAttempt?.submissionId &&
            activeSubmissionAttempt.submissionId !== submissionId
        ) {
            return;
        }

        activeSubmissionAttempt = {
            ...activeSubmissionAttempt!,
            submissionId,
        };

        const startTime = Date.now();
        const timeout = 20_000;
        submissionButtonTimer = setInterval(async () => {
            const verdict =
                (await getSubmissionVerdict(submissionId)) ??
                findVerdictOnCurrentSubmissionPage(
                    currentQuestionTitleSlug,
                    submissionId
                );
            if (verdict) {
                clearInterval(submissionButtonTimer);
                postFinalSubmissionVerdict(
                    currentQuestionTitleSlug,
                    submissionUrl,
                    verdict
                );
            } else if (Date.now() - startTime > timeout) {
                clearInterval(submissionButtonTimer);
            }
        }, 500);
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
            if (key == "shouldShowPanel") {
                if (newValue == true) {
                    showPanel();
                } else {
                    hidePanel();
                }
            }
            if (key == "tipsboardToggleState") {
                if (newValue == true) {
                    setToggleState(true);
                } else {
                    setToggleState(false);
                }
            }
            if (key == "tipsboardWidth") {
                reactRoot.style.width = `${newValue}px`;
            }
            if (key == "tipsboardDarkMode" && reactRoot.contentWindow) {
                reactRoot.contentWindow.postMessage(
                    {
                        extension: "tipsboard",
                        event: "darkMode",
                        isDarkMode: newValue,
                    },
                    APP_URL
                );
            }
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.submissionId && message.verdict) {
            handleSubmissionVerdict(message.submissionId, message.verdict);
            return;
        }

        if (previousSubmissionId == message.submissionId) {
            return;
        }
        previousSubmissionId = message.submissionId;
        handleClickSubmitCodeButton(message.submissionId);
    });

    function handleSubmissionVerdict(submissionId: string, verdict: string) {
        const currentQuestionTitleSlug = getCurrentQuestionTitleSlug();
        if (
            !currentQuestionTitleSlug ||
            !isActiveSubmissionFor(currentQuestionTitleSlug) ||
            activeSubmissionAttempt?.submissionId !== submissionId
        ) {
            return;
        }

        clearInterval(submissionButtonTimer);
        postFinalSubmissionVerdict(
            currentQuestionTitleSlug,
            constructSubmissionUrl(currentQuestionTitleSlug, submissionId),
            verdict
        );
    }

    function clearActiveSubmitVerdictTimer() {
        if (!activeSubmitVerdictTimer) {
            return;
        }

        clearInterval(activeSubmitVerdictTimer);
        activeSubmitVerdictTimer = undefined;
    }

    function isActiveSubmissionFor(titleSlug: string) {
        if (!activeSubmissionAttempt) {
            return false;
        }

        const attemptAge = Date.now() - activeSubmissionAttempt.submittedAt;
        return (
            activeSubmissionAttempt.titleSlug === titleSlug &&
            attemptAge < 120_000 &&
            !activeSubmissionAttempt.finalMessageSent
        );
    }

    function postFinalSubmissionVerdict(
        titleSlug: string,
        submissionUrl: string,
        verdict: string
    ) {
        if (!isActiveSubmissionFor(titleSlug)) {
            return;
        }

        activeSubmissionAttempt = {
            ...activeSubmissionAttempt!,
            finalMessageSent: true,
        };
        clearActiveSubmitVerdictTimer();
        postSubmissionEvent({
            event: verdict === "Accepted" ? "accepted" : "verdict",
            currentProblem: titleSlug,
            submissionUrl,
            submissionEventId: `result:${activeSubmissionAttempt!.attemptId}:${submissionUrl}`,
            verdict,
        });
        activeSubmissionAttempt = undefined;
    }

    function postSubmitEvent() {
        if (!reactRoot.contentWindow) {
            return;
        }

        const currentQuestionTitleSlug = getCurrentQuestionTitleSlug();
        if (!currentQuestionTitleSlug) {
            return;
        }

        const now = Date.now();
        if (now - lastSubmitEventAt < 1000) {
            return;
        }
        const attemptId = `${now}-${Math.random().toString(36).slice(2)}`;
        lastSubmitEventAt = now;
        activeSubmissionAttempt = {
            titleSlug: currentQuestionTitleSlug,
            submittedAt: now,
            attemptId,
            finalMessageSent: false,
        };

        postSubmissionEvent({
            event: "submit",
            currentProblem: currentQuestionTitleSlug,
            submissionUrl: constructPendingSubmissionUrl(
                currentQuestionTitleSlug
            ),
            submissionEventId: `submit:${currentQuestionTitleSlug}:${attemptId}`,
        });
        startSubmitVerdictPolling(currentQuestionTitleSlug);
    }

    function startSubmitVerdictPolling(titleSlug: string) {
        clearActiveSubmitVerdictTimer();

        const startedAt = Date.now();
        const timeout = 45_000;
        let checkingRecentSubmissions = false;
        activeSubmitVerdictTimer = setInterval(async () => {
            if (
                Date.now() - startedAt > timeout ||
                !isActiveSubmissionFor(titleSlug)
            ) {
                clearActiveSubmitVerdictTimer();
                return;
            }

            if (Date.now() - startedAt < 1_500) {
                return;
            }

            const activeAttempt = activeSubmissionAttempt;
            if (!activeAttempt || activeAttempt.titleSlug !== titleSlug) {
                clearActiveSubmitVerdictTimer();
                return;
            }

            if (!activeAttempt.submissionId && !checkingRecentSubmissions) {
                checkingRecentSubmissions = true;
                try {
                    const recentSubmissionVerdict =
                        await getLatestRecentSubmissionVerdictForAttempt(
                            titleSlug,
                            activeAttempt.submittedAt
                        );
                    if (recentSubmissionVerdict) {
                        postFinalSubmissionVerdict(
                            titleSlug,
                            recentSubmissionVerdict.submissionUrl,
                            recentSubmissionVerdict.verdict
                        );
                        return;
                    }
                } finally {
                    checkingRecentSubmissions = false;
                }
            }

            const submission = getCurrentSubmission();
            if (!submission || submission.titleSlug !== titleSlug) {
                return;
            }

            if (!activeSubmissionAttempt?.submissionId) {
                activeSubmissionAttempt = {
                    ...activeSubmissionAttempt!,
                    submissionId: submission.submissionId,
                };
            }

            if (
                activeSubmissionAttempt?.submissionId !==
                submission.submissionId
            ) {
                return;
            }

            const verdict = findVerdictOnCurrentSubmissionPage(
                submission.titleSlug,
                submission.submissionId
            );
            if (!verdict) {
                return;
            }

            postFinalSubmissionVerdict(
                submission.titleSlug,
                constructSubmissionUrl(
                    submission.titleSlug,
                    submission.submissionId
                ),
                verdict
            );
        }, 500);
    }

    function isSubmitControl(element: Element) {
        const control = element.closest("button, [role='button']");
        const text = control?.textContent?.replace(/\s+/g, " ").trim();
        return text === "Submit" || text?.startsWith("Submit ");
    }

    function handleSubmitPointerEvent(event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        if (isSubmitControl(target)) {
            postSubmitEvent();
        }
    }

    document.addEventListener("pointerdown", handleSubmitPointerEvent, true);
    document.addEventListener("mousedown", handleSubmitPointerEvent, true);
    document.addEventListener("click", handleSubmitPointerEvent, true);

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                postSubmitEvent();
            }
        },
        true
    );

}

function normalizeVerdictText(text: string | null | undefined) {
    const verdict = text?.replace(/\s+/g, " ").trim();
    return KNOWN_VERDICTS.find((knownVerdict) => knownVerdict === verdict);
}

const KNOWN_VERDICTS = [
    "Accepted",
    "Wrong Answer",
    "Compile Error",
    "Runtime Error",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "Output Limit Exceeded",
    "Internal Error",
];

function findCurrentResultHeaderVerdict() {
    const bodyText = document.body.innerText?.replace(/\s+/g, " ").trim();
    if (!bodyText) {
        return;
    }

    return findResultHeaderVerdictInText(bodyText);
}

function findResultHeaderVerdictInText(text: string) {
    for (const knownVerdict of KNOWN_VERDICTS) {
        const escapedVerdict = knownVerdict.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
        const resultHeaderPattern = new RegExp(
            `(?:^|\\s)${escapedVerdict}\\s+\\d+\\s*/\\s*\\d+\\s+testcases\\s+passed(?:\\s|$)`,
            "i"
        );

        if (resultHeaderPattern.test(text)) {
            return knownVerdict;
        }
    }
}

function findVerdictOnActiveResultPane() {
    const resultElement = document.querySelector(
        "[data-e2e-locator='submission-result']"
    );
    return (
        normalizeVerdictText(resultElement?.textContent) ??
        findCurrentResultHeaderVerdict()
    );
}

type RecentLeetCodeSubmission = {
    id?: number | string;
    titleSlug?: string;
    title_slug?: string;
    statusDisplay?: string;
    status_display?: string;
    timestamp?: number | string;
    url?: string;
};

type RecentLeetCodeSubmissionsResponse = {
    submissions_dump?: RecentLeetCodeSubmission[];
};

async function getLatestRecentSubmissionVerdictForAttempt(
    titleSlug: string,
    submittedAt: number
) {
    try {
        const response = await fetch(
            "https://leetcode.com/api/submissions/?offset=0&limit=20",
            { credentials: "include" }
        );
        if (!response.ok) {
            return;
        }

        const data =
            (await response.json()) as RecentLeetCodeSubmissionsResponse;
        const newestMatchingSubmission = data.submissions_dump
            ?.filter((submission) => {
                const submissionTitleSlug =
                    submission.title_slug ?? submission.titleSlug;
                const submittedAtSeconds = Number(submission.timestamp);
                const verdict = normalizeVerdictText(
                    submission.status_display ?? submission.statusDisplay
                );

                return (
                    submissionTitleSlug === titleSlug &&
                    !!verdict &&
                    Number.isFinite(submittedAtSeconds) &&
                    submittedAtSeconds * 1000 >= submittedAt - 60_000 &&
                    submittedAtSeconds * 1000 <= Date.now() + 30_000
                );
            })
            .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];

        if (!newestMatchingSubmission) {
            return;
        }

        const verdict = normalizeVerdictText(
            newestMatchingSubmission.status_display ??
                newestMatchingSubmission.statusDisplay
        );
        const submissionUrl = constructRecentSubmissionUrl(
            titleSlug,
            newestMatchingSubmission
        );
        if (!verdict || !submissionUrl) {
            return;
        }

        return { submissionUrl, verdict };
    } catch {
        return;
    }
}

function constructRecentSubmissionUrl(
    titleSlug: string,
    submission: RecentLeetCodeSubmission
) {
    if (
        submission.url?.startsWith(
            `https://leetcode.com/problems/${titleSlug}/submissions/`
        )
    ) {
        return submission.url;
    }

    const submissionId = String(submission.id ?? "");
    if (!/^\d+$/.test(submissionId)) {
        return;
    }

    return constructSubmissionUrl(titleSlug, submissionId);
}

function findVerdictOnCurrentSubmissionPage(
    titleSlug: string,
    submissionId: string
) {
    const currentSubmission = getCurrentSubmission();
    if (
        !currentSubmission ||
        currentSubmission.titleSlug !== titleSlug ||
        currentSubmission.submissionId !== submissionId
    ) {
        return;
    }

    return findVerdictOnActiveResultPane();
}

async function getSubmissionVerdict(submissionId: string) {
    try {
        const response = await fetch(
            `https://leetcode.com/submissions/detail/${submissionId}/check/`,
            {
                credentials: "include",
            }
        );
        if (!response.ok) {
            return;
        }

        const submission = await response.json();
        if (
            submission?.state === "PENDING" ||
            submission?.state === "STARTED"
        ) {
            return;
        }

        return normalizeVerdictText(submission?.status_msg);
    } catch {
        return;
    }
}

function waitForElement(selectors: string[]): Promise<Element> {
    return new Promise((resolve) => {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
        }

        const observer = new MutationObserver((mutations) => {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    observer.disconnect();
                    return;
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(document.body);
        }, 5000);
    });
}

function getCurrentQuestionTitleSlug(): string | undefined {
    const currentUrl = window.location.href;
    if (currentUrl.startsWith("https://leetcode.com/problems/")) {
        return currentUrl.split("/")[4];
    }
}

function getCurrentSubmission():
    | { titleSlug: string; submissionId: string }
    | undefined {
    const match = window.location.pathname.match(
        /^\/problems\/([^/]+)\/submissions\/(\d+)\/?/
    );
    if (!match) {
        return;
    }

    return {
        titleSlug: match[1],
        submissionId: match[2],
    };
}

function constructSubmissionUrl(titleSlug: string, submissionId: string) {
    return `https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/`;
}

function constructPendingSubmissionUrl(titleSlug: string) {
    return `https://leetcode.com/problems/${titleSlug}/submissions/pending/`;
}

main();

export {};
