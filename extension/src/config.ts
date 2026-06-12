import { AuthProvider } from "./types/AuthProvider";
import githubIcon from "./assets/github.svg";
import googleIcon from "./assets/google.png";
import discordIcon from "./assets/discord.svg";
import twitchIcon from "./assets/twitch.svg";

function resolveEnvUrl(value: string | undefined, fallback: string) {
    return value && !value.includes("${") ? value : fallback;
}

const SERVER_URL = resolveEnvUrl(
    import.meta.env.VITE_SERVER_URL,
    "https://contest.techinterviewprep.support"
);

const authProviders: AuthProvider[] = [
    {
        name: "GitHub",
        authProviderEndpoint: "auth/github",
        icon: githubIcon,
        color: "bg-github-bg",
        hoverColor: "hover:bg-github-bg-hover",
    },
    {
        name: "Google",
        authProviderEndpoint: "auth/google",
        icon: googleIcon,
        color: "bg-google-bg",
        hoverColor: "hover:bg-google-bg-hover",
    },
    {
        name: "Discord",
        authProviderEndpoint: "auth/discord",
        icon: discordIcon,
        color: "bg-discord-bg",
        hoverColor: "hover:bg-discord-bg-hover",
    },
    {
        name: "Twitch",
        authProviderEndpoint: "auth/twitch",
        icon: twitchIcon,
        color: "bg-twitch-bg",
        hoverColor: "hover:bg-twitch-bg-hover",
    },
];

export { SERVER_URL, authProviders };
