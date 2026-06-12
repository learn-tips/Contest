chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        let submissionId = parseSubmissionId(details.url);
        if (submissionId) {
            sendMessage(details.tabId, submissionId);
            pollSubmissionVerdict(details.tabId, submissionId);
        }
    },
    {
        urls: [
            "https://leetcode.com/submissions/detail/*/check/",
            "https://leetcode.com/submissions/detail/*/check/*",
        ],
    }
);

const pendingPolls = new Map();

function parseSubmissionId(url) {
    if (!url) {
        return;
    }

    const regex =
        /https:\/\/leetcode\.com\/submissions\/detail\/(\d+)\/check\/?/;
    const match = url.match(regex);

    if (!match) {
        return;
    }
    return match[1];
}

function sendMessage(tabId, submissionId) {
    if (!tabId || tabId < 0) {
        return;
    }

    chrome.tabs.sendMessage(tabId, {
        submissionId: submissionId,
    });
}

function sendVerdict(tabId, submissionId, verdict) {
    if (!tabId || tabId < 0 || !verdict) {
        return;
    }

    chrome.tabs.sendMessage(tabId, {
        submissionId: submissionId,
        verdict: verdict,
    });
}

function pollSubmissionVerdict(tabId, submissionId) {
    if (!tabId || tabId < 0 || pendingPolls.has(submissionId)) {
        return;
    }

    const startedAt = Date.now();
    const timeout = 45_000;
    const poller = setInterval(async () => {
        if (Date.now() - startedAt > timeout) {
            clearPendingPoll(submissionId);
            return;
        }

        const verdict = await getSubmissionVerdict(submissionId);
        if (!verdict) {
            return;
        }

        clearPendingPoll(submissionId);
        sendVerdict(tabId, submissionId, verdict);
    }, 1000);

    pendingPolls.set(submissionId, poller);
}

function clearPendingPoll(submissionId) {
    const poller = pendingPolls.get(submissionId);
    if (!poller) {
        return;
    }

    clearInterval(poller);
    pendingPolls.delete(submissionId);
}

async function getSubmissionVerdict(submissionId) {
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

function normalizeVerdictText(text) {
    const verdict = text?.replace(/\s+/g, " ").trim();
    const knownVerdicts = [
        "Accepted",
        "Wrong Answer",
        "Compile Error",
        "Runtime Error",
        "Time Limit Exceeded",
        "Memory Limit Exceeded",
        "Output Limit Exceeded",
        "Internal Error",
    ];
    return knownVerdicts.find((knownVerdict) => knownVerdict === verdict);
}
