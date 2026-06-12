import { ChatEvent, MessageInterface } from "../types/Message";

// This just needs to be here so that these colors get bundled in the final distribution.
// The userColor is actually assigned on the server.
const colorChoices = [
    "text-red-400",
    "text-orange-400",
    "text-amber-400",
    "text-yellow-400",
    "text-green-400",
    "text-emerald-400",
    "text-teal-400",
    "text-cyan-400",
    "text-sky-400",
    "text-blue-400",
    "text-indigo-400",
    "text-violet-400",
    "text-purple-400",
    "text-fuchsia-400",
    "text-pink-400",
    "text-rose-400",
];

function TIPSCharacter({
    mood,
    tone,
}: {
    mood: "smile" | "sad" | "neutral" | "wow";
    tone: "default" | "success" | "warning";
}) {
    const fill =
        tone === "success"
            ? "#22C55E"
            : tone === "warning"
            ? "#EF4444"
            : "#3A5BEF";
    const mouth =
        mood === "smile"
            ? "M9.15 13.1c.58 1.06 1.55 1.65 2.85 1.65s2.27-.59 2.85-1.65"
            : mood === "sad"
            ? "M9.15 14.2c.58-1.06 1.55-1.65 2.85-1.65s2.27.59 2.85 1.65"
            : "M9.15 13.65h5.7";

    return (
        <svg
            className="mt-0.5 h-7 w-7 shrink-0 drop-shadow-sm"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M12 2.75C6.9 2.75 3 6.36 3 11.18v8.57l4.35-2.34c1.34.71 2.93 1.09 4.65 1.09 5.1 0 9-3.6 9-8.32S17.1 2.75 12 2.75Z"
                fill={fill}
                fillRule="evenodd"
                clipRule="evenodd"
            />
            <circle cx="8.35" cy="10.65" r="1.2" fill="white" />
            <circle cx="15.65" cy="10.65" r="1.2" fill="white" />
            {mood === "wow" ? (
                <ellipse cx="12" cy="13.45" rx="2.35" ry="2.05" fill="white" />
            ) : (
                <path
                    d={mouth}
                    stroke="white"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                />
            )}
        </svg>
    );
}

function EventMessage({
    message,
    mood,
    tone,
    emoji,
}: {
    message: MessageInterface;
    mood: "smile" | "sad" | "neutral" | "wow";
    tone: "default" | "success" | "warning";
    emoji?: string;
}) {
    const toneClass =
        tone === "success"
            ? "bg-[#2DB55D]/15 text-[#2DB55D] ring-1 ring-[#2DB55D]/25 dark:bg-[#2DB55D]/20 dark:text-[#2DB55D] dark:ring-[#2DB55D]/30"
            : tone === "warning"
            ? "bg-[#EF4743]/15 text-[#EF4743] ring-1 ring-[#EF4743]/25 dark:bg-[#EF4743]/20 dark:text-[#EF4743] dark:ring-[#EF4743]/30"
            : "bg-lc-fg-message-light text-lc-text-light ring-1 ring-[#3A5BEF]/10 dark:bg-[hsl(0,0%,20%)] dark:text-white";
    const usernameClass =
        tone === "default" ? message.color : "text-current";

    return (
        <li
            className={`flex flex-row items-start gap-x-2 rounded-md px-2 py-1.5 ${toneClass}`}
        >
            {emoji ? (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-2xl leading-none">
                    {emoji}
                </span>
            ) : (
                <TIPSCharacter mood={mood} tone={tone} />
            )}
            <span>
                <span className={`${usernameClass} font-bold`}>
                    {`${message.username}`}&nbsp;&nbsp;
                </span>
                <span className="chat-message">{`${message.body}`}</span>
            </span>
        </li>
    );
}

export default function Message({ message }: { message: MessageInterface }) {
    switch (message.chatEvent) {
        case ChatEvent.Message:
            return (
                <li className="flex flex-row items-start gap-x-1">
                    <span>
                        <span className={`${message.color} font-bold`}>
                            {message.username}
                        </span>
                        <span>:&nbsp;</span>
                        <span className="chat-message">{`${message.body}`}</span>
                    </span>
                </li>
            );
        case ChatEvent.Join:
            return <EventMessage message={message} mood="wow" tone="default" />;
        case ChatEvent.Leave:
            return <EventMessage message={message} mood="neutral" tone="default" />;
        case ChatEvent.Submit:
            return <EventMessage message={message} mood="wow" tone="default" />;
        case ChatEvent.Verdict:
            return <EventMessage message={message} mood="sad" tone="warning" />;
        case ChatEvent.Accepted:
            return <EventMessage message={message} mood="smile" tone="success" />;
        case ChatEvent.Complete:
            return (
                <EventMessage
                    message={message}
                    mood="smile"
                    tone="success"
                    emoji="🎉"
                />
            );
    }
}
