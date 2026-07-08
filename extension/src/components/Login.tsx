import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import Home from "./Home";
import CookiesWarning from "./CookiesWarning";
import { SERVER_URL, authProviders } from "../config";
import SignInButton from "./buttons/SignInButton";
import { SessionResponse } from "../types/Session";
import TIPSLogo from "../assets/TIPSLogo.svg";
import Spinner from "./Spinner";

async function fetchSession() {
    // Detect if third-party cookies are enabled
    document.cookie = "testCookie=testValue; SameSite=None; Secure";
    const cookieEnabled = document.cookie.indexOf("testCookie") != -1;
    if (!cookieEnabled) {
        return false;
    }
    let response = await fetch(`${SERVER_URL}/sessions`, {
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error("Failed to fetch session");
    }
    return response.json();
}

export default function Login() {
    useEffect(() => {
        let searchParams = new URLSearchParams(window.location.search);
        if (searchParams.get("auth") === "success") {
            window.close();
        }
    }, []);

    let { data: session, isLoading } = useQuery<SessionResponse | boolean>(
        ["session"],
        fetchSession
    );

    if (isLoading) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-lc-bg-light p-2 text-sm dark:bg-lc-bg">
                <Spinner />
            </div>
        );
    }

    if (session === false) {
        return <CookiesWarning />;
    } else if (session && typeof session === "object") {
        return <Home session={session} />;
    } else {
        return (
            <div className="flex h-screen flex-col items-center bg-lc-bg-light p-2 text-sm dark:bg-lc-bg">
                <img
                    className="mb-3 mt-32 h-24 w-48 object-contain"
                    src={TIPSLogo}
                    alt="TIPS logo"
                />
                <div className="text-xl font-semibold text-[#3A5BEF] dark:text-[#8EA2FF]">
                    TIPS Contest Platform
                </div>
                <div className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    multiplayer problem-solving rooms
                </div>
                <div className="mt-10 flex flex-col items-center justify-center gap-y-3">
                    {authProviders.map((authProvider) => {
                        return (
                            <SignInButton
                                key={authProvider.name}
                                authProvider={authProvider}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }
}
