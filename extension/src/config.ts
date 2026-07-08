import { AuthProvider } from "./types/AuthProvider";
import githubIcon from "./assets/github.svg";
import googleIcon from "./assets/google.png";

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
];

export { SERVER_URL, authProviders };
