document.addEventListener("DOMContentLoaded", () => {
    fetch("./manifest.json")
        .then((response) => response.json())
        .then((data) => {
            const version = data.version;
            document.querySelector(
                "#version"
            ).textContent = `Version ${version}`;
        })
        .catch((error) => console.error("Error loading the version:", error));
});

const darkModeButton = document.querySelector("#toggle-tipsboard-darkmode");
darkModeButton.addEventListener("click", () => {
    const darkModeState = darkModeButton.checked;
    chrome.storage.local.set({ tipsboardDarkMode: darkModeState });
});

const showHideButton = document.querySelector("#show-hide-tipsboard");
showHideButton.addEventListener("click", () => {
    const shouldShowPanel = showHideButton.checked;
    chrome.storage.local.set({ shouldShowPanel: shouldShowPanel });
    if (shouldShowPanel) {
        darkModeButton.parentElement.parentElement.style.display = "flex";
    } else {
        darkModeButton.parentElement.parentElement.style.display = "none";
    }
});

const instructionsContainer = document.querySelector("#tipsboard-instructions");
const settingsContainer = document.querySelector("#tipsboard-settings");
chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    const currentUrl = tabs[0].url;
    if (currentUrl.includes("https://leetcode.com")) {
        settingsContainer.style.display = "flex";
        instructionsContainer.style.display = "none";
        chrome.storage.local.get("shouldShowPanel", (result) => {
            const shouldShowPanel = result.shouldShowPanel ?? true;
            showHideButton.checked = shouldShowPanel;
            if (shouldShowPanel) {
                darkModeButton.parentElement.parentElement.style.display =
                    "flex";
            } else {
                darkModeButton.parentElement.parentElement.style.display =
                    "none";
            }
        });
        chrome.storage.local.get("tipsboardDarkMode", (result) => {
            const darkModeState = result.tipsboardDarkMode ?? true;
            darkModeButton.checked = darkModeState;
        });
    } else {
        settingsContainer.style.display = "none";
        instructionsContainer.style.display = "flex";
    }
});

const leetcodeLink = "https://leetcode.com/problems/two-sum";
const leetcodeLinkElement = document.querySelector("#leetcode-link");
leetcodeLinkElement.addEventListener("click", () => {
    chrome.tabs.create({ url: leetcodeLink, active: true });
});

const githubLink = "https://github.com/learn-tips/Contest";
const githubLinkElement = document.querySelector("#github-link");
githubLinkElement.addEventListener("click", () => {
    chrome.tabs.create({ url: githubLink, active: true });
});
