import Room from "./Room";
import SignOutButton from "./buttons/SignOutButton";
import CreateRoomButton from "./buttons/CreateRoomButton";
import { SessionResponse } from "../types/Session";
import JoinRoomByIdButton from "./buttons/JoinRoomByIdButton";
import RoomSettingsButton from "./buttons/RoomSettingsButton";
import { useState } from "react";

const PREFERRED_NICKNAME_STORAGE_KEY = "tipsboardPreferredNickname";

export default function Home({ session }: { session: SessionResponse }) {
    let { username, picture, room } = session;
    let [preferredNickname, setPreferredNickname] = useState(() => {
        return localStorage.getItem(PREFERRED_NICKNAME_STORAGE_KEY) || "";
    });

    function handlePreferredNicknameChange(nickname: string) {
        const sanitizedNickname = nickname.replace(/[^A-Za-z0-9]/g, "");
        setPreferredNickname(sanitizedNickname);

        if (sanitizedNickname) {
            localStorage.setItem(
                PREFERRED_NICKNAME_STORAGE_KEY,
                sanitizedNickname
            );
        } else {
            localStorage.removeItem(PREFERRED_NICKNAME_STORAGE_KEY);
        }
    }

    if (room) {
        let { roomId, questions, userColor, createdAt, duration, nickname } =
            room;
        return (
            <Room
                accountUsername={username}
                initialNickname={nickname}
                preferredNickname={preferredNickname}
                roomId={roomId}
                questions={questions}
                userColor={userColor}
                createdAt={createdAt}
                duration={duration}
                key={roomId}
            />
        );
    } else {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-lc-bg-light p-2 text-sm dark:bg-lc-bg">
                <div className="mr-4 flex w-full flex-col items-end">
                    <SignOutButton />
                </div>

                <div className="mx-2 mt-32 h-screen">
                    <div className="mb-6 flex flex-row items-center justify-center gap-x-3">
                        {picture ? (
                            <img
                                className="w-12 rounded-full"
                                src={picture}
                                alt="User profile picture"
                            />
                        ) : null}
                        <div className="text-lg font-semibold text-lc-text-light dark:text-white">
                            {username}
                        </div>
                    </div>
                    <div className="mb-4 flex flex-col gap-1">
                        <label
                            htmlFor="preferred-nickname"
                            className="text-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                            Room nickname
                        </label>
                        <input
                            id="preferred-nickname"
                            value={preferredNickname}
                            onChange={(event) =>
                                handlePreferredNicknameChange(
                                    event.target.value
                                )
                            }
                            maxLength={32}
                            className="rounded-md bg-lc-fg-light px-3 py-2 text-sm text-lc-text-light outline-none focus:ring-1 focus:ring-[#3A5BEF] dark:bg-lc-fg dark:text-white"
                            placeholder={username}
                            spellCheck="false"
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                        />
                    </div>

                    <div className="flex flex-col items-center justify-center gap-y-4 rounded-xl border-[12px] border-[#EAF0FF] px-6 py-10 shadow-sm dark:border-[#26345F]">
                        <div className="flex flex-row items-center gap-2">
                            <CreateRoomButton />
                            <RoomSettingsButton />
                        </div>
                        <div className="text-gray-500">- OR -</div>
                        <JoinRoomByIdButton />
                    </div>
                </div>
            </div>
        );
    }
}
