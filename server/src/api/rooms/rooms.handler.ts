import { Request, Response, NextFunction } from "express";
import { RoomsPathParameter, PlayerWithSubmissions } from "./rooms.model";
import { Question, RoomQuestion } from "@prisma/client";
import prisma from "../../index";
import { nanoid } from "nanoid";
import {
    io,
    setUserRoomSession,
    getUserRoomSession,
    deleteUserRoomSession,
    redisClient,
} from "../app";
import { MessageInterface, ChatEvent } from "../../types/Message";
import { RoomSession, SessionResponse } from "../../types/Session";
import { logger } from "../../logger";
import {
    QuestionFilterKind,
    RoomDifficulty,
    RoomDifficultyNumberOfQuestions,
    RoomSettings,
} from "../../types/RoomSettings";

const ROOM_HISTORY_RETENTION_THRESHOLD_MS = 60 * 60 * 1000;
const ROOM_NICKNAME_MAX_LENGTH = 32;
const ROOM_NICKNAME_PATTERN = /^[A-Za-z0-9 ]+$/;
const ROOM_NICKNAME_RATE_LIMIT_MAX_CHANGES = 5;
const ROOM_NICKNAME_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export async function getRoomPlayers(
    req: Request,
    res: Response<PlayerWithSubmissions[]>,
    next: NextFunction
) {
    try {
        let room = await getUserRoomSession(req.session.passport.user.id);
        if (!room?.roomId) {
            throw new Error("Could not find a room for the current user");
        }
        let roomId = room.roomId;
        let response: PlayerWithSubmissions[] = await prisma.$queryRaw`SELECT 
        u."id",
        COALESCE(ru."nickname", u."username") AS "username",
        u."roomId",
        ru."joinedAt" as "updatedAt",
        json_agg(
            json_build_object(
                'questionId', q."id", 
                'title', q."title",
                'titleSlug', q."titleSlug",
                'difficulty', q."difficulty",
                'status', s."status",
                'updatedAt', s."updatedAt",
                'url', s."url"
            )
        ) AS submissions
    FROM "User" u
    JOIN "RoomUser" ru ON u."id" = ru."userId"
    JOIN "Room" r ON r."id" = ${roomId} AND ru."roomId" = r."id"
    JOIN "RoomQuestion" rq ON r."id" = rq."roomId"
    JOIN "Question" q ON rq."questionId" = q."id"
    LEFT JOIN "Submission" s ON u."id" = s."userId" AND s."questionId" = q."id" AND s."roomId" = r."id"
    GROUP BY u."id", ru."nickname", ru."joinedAt", u."roomId";`;
        return res.json(response);
    } catch (error) {
        return next(error);
    }
}

export async function createRoom(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const ROOM_ID_LENGTH = 10;

        await prisma.$transaction(async (prisma) => {
            if (!req.user) {
                throw new Error(
                    "Request authenticated, but user session not found"
                );
            }

            const roomSettings: RoomSettings = req.body;
            const {
                kind: filterKind,
                selections,
                questionSelections,
            } = roomSettings.questionFilter;
            const nickname = parseRoomNickname(req.body?.nickname);

            let questions: Question[];
            switch (filterKind) {
                case QuestionFilterKind.Topics:
                    const filteredQuestions: Question[] =
                        await prisma.question.findMany({
                            where: {
                                tags: {
                                    hasSome: selections,
                                },
                            },
                        });

                    const easyQuestions = filteredQuestions.filter(
                        (question) => question.difficulty === "Easy"
                    );
                    const mediumQuestions = filteredQuestions.filter(
                        (question) => question.difficulty === "Medium"
                    );
                    const hardQuestions = filteredQuestions.filter(
                        (question) => question.difficulty === "Hard"
                    );

                    const {
                        Easy: numberOfEasy,
                        Medium: numberOfMedium,
                        Hard: numberOfHard,
                    } = getNumberOfQuestionsPerDifficulty(
                        roomSettings.difficulty,
                        easyQuestions,
                        mediumQuestions,
                        hardQuestions
                    );

                    // Select 4 random questions
                    const randomlySelectedEasyQuestions: Question[] =
                        easyQuestions
                            .sort(() => Math.random() - 0.5)
                            .slice(0, numberOfEasy);
                    const randomlySelectedMediumQuestions: Question[] =
                        mediumQuestions
                            .sort(() => Math.random() - 0.5)
                            .slice(0, numberOfMedium);
                    const randomlySelectedHardQuestions: Question[] =
                        hardQuestions
                            .sort(() => Math.random() - 0.5)
                            .slice(0, numberOfHard);

                    questions = randomlySelectedEasyQuestions.concat(
                        randomlySelectedMediumQuestions,
                        randomlySelectedHardQuestions
                    );
                    break;
                case QuestionFilterKind.Questions:
                    if (
                        !questionSelections.length ||
                        questionSelections.length > 4
                    ) {
                        throw new Error(
                            "Invalid number of questions selected!"
                        );
                    }
                    questions = await prisma.question.findMany({
                        where: { titleSlug: { in: questionSelections } },
                    });
                    break;
                default:
                    throw new Error(
                        `Invalid question filter kind: ${filterKind}`
                    );
            }

            // Generate a room ID
            const newRoomId = nanoid(ROOM_ID_LENGTH);

            // Create a new room in the db
            const newRoom = await prisma.room.create({
                data: {
                    id: newRoomId,
                    questionFilterKind: filterKind,
                    questionFilterSelections: selections,
                    duration: roomSettings.duration,
                },
            });

            // Get the roomId and questionId so that you can update the RoomQuestion table
            const questionIdsAndRoom: RoomQuestion[] = questions.map(
                (question) => {
                    return { questionId: question.id, roomId: newRoom.id };
                }
            );

            // Add the questions to the room in the join table (RoomQuestion)
            await prisma.roomQuestion.createMany({
                data: questionIdsAndRoom,
            });

            // Update the user table with the roomId
            const user = await prisma.user.update({
                data: {
                    roomId: newRoomId,
                },
                where: {
                    id: req.user.id,
                },
            });

            // Update the room user table with the join time
            const { joinedAt } = await prisma.roomUser.create({
                data: {
                    userId: user.id,
                    roomId: newRoomId,
                    nickname,
                },
            });

            // Update the user session
            req.user.updatedAt = user.updatedAt;

            // Update the room session
            const roomSession: RoomSession = {
                roomId: newRoomId,
                questions,
                userColor: generateRandomUserColor(),
                createdAt: newRoom.createdAt,
                duration: newRoom.duration,
                joinedAt,
                nickname,
            };
            await setUserRoomSession(req.user.id, roomSession);
            sendJoinRoomMessage(
                getRoomDisplayName(req.user.username, nickname),
                roomSession
            );

            return res.redirect("../sessions");
        });
    } catch (error) {
        return next(error);
    }
}

export async function joinRoomById(
    req: Request<RoomsPathParameter>,
    res: Response,
    next: NextFunction
) {
    try {
        await prisma.$transaction(async (prisma) => {
            if (!req.user) {
                throw new Error(
                    "Request authenticated, but user session not found"
                );
            }

            let roomId = req.params.id;

            let room = await prisma.room.findUnique({
                where: {
                    id: roomId,
                },
            });

            if (!room) {
                throw new Error(`Could not find room with id: ${roomId}`);
            }

            let questions: Question[] =
                await prisma.$queryRaw`SELECT "Question".* FROM "RoomQuestion"
                    INNER JOIN "Question"
                    ON "Question".id="RoomQuestion"."questionId"
                    WHERE "RoomQuestion"."roomId"=${roomId}`;

            // Update the user table with the roomId
            let user = await prisma.user.update({
                data: {
                    roomId: roomId,
                },
                where: {
                    id: req.user.id,
                },
            });

            // Update the user session
            req.user.updatedAt = user.updatedAt;

            let roomUser = await prisma.roomUser.findUnique({
                where: {
                    roomId_userId: {
                        roomId: roomId,
                        userId: user.id,
                    },
                },
            });
            const requestedNickname = parseRoomNickname(req.body?.nickname);
            const shouldUpdateNickname = "nickname" in req.body;

            let joinedAt: Date;
            let nickname: string | null;
            if (!roomUser) {
                // Update the room user table with the join time
                let roomUser = await prisma.roomUser.create({
                    data: {
                        userId: user.id,
                        roomId: roomId,
                        nickname: requestedNickname,
                    },
                });
                joinedAt = roomUser.joinedAt;
                nickname = roomUser.nickname;
            } else if (shouldUpdateNickname) {
                let updatedRoomUser = await prisma.roomUser.update({
                    where: {
                        roomId_userId: {
                            roomId: roomId,
                            userId: user.id,
                        },
                    },
                    data: {
                        nickname: requestedNickname,
                    },
                });
                joinedAt = updatedRoomUser.joinedAt;
                nickname = updatedRoomUser.nickname;
            } else {
                joinedAt = roomUser.joinedAt;
                nickname = roomUser.nickname;
            }

            // Update the room session
            let roomSession: RoomSession = {
                roomId: roomId,
                questions: questions,
                userColor: generateRandomUserColor(),
                createdAt: room.createdAt,
                duration: room.duration,
                joinedAt: joinedAt,
                nickname,
            };
            await setUserRoomSession(req.user.id, roomSession);
            sendJoinRoomMessage(
                getRoomDisplayName(req.user.username, nickname),
                roomSession
            );

            return res.redirect("../sessions");
        });
    } catch (error) {
        return next(error);
    }
}

export async function updateRoomNickname(
    req: Request,
    res: Response<{ nickname: string | null; username: string }>,
    next: NextFunction
) {
    try {
        await prisma.$transaction(async (prisma) => {
            if (!req.user) {
                throw new Error(
                    "Request authenticated, but user session not found"
                );
            }

            let room = await getUserRoomSession(req.user.id);
            let roomId = room?.roomId || req.user.roomId;
            if (!roomId) {
                throw new Error("Could not find a room for the current user");
            }

            let nickname = parseRoomNickname(req.body?.nickname);
            await enforceRoomNicknameRateLimit(req.user.id, roomId);
            await prisma.roomUser.update({
                where: {
                    roomId_userId: {
                        roomId,
                        userId: req.user.id,
                    },
                },
                data: {
                    nickname,
                },
            });

            if (room) {
                await setUserRoomSession(req.user.id, {
                    ...room,
                    nickname,
                });
            }

            let username = getRoomDisplayName(req.user.username, nickname);
            io.to(roomId).emit("players-updated");
            return res.json({ nickname, username });
        });
    } catch (error) {
        return next(error);
    }
}

export async function exitRoom(
    req: Request,
    res: Response<SessionResponse>,
    next: NextFunction
) {
    try {
        await exitRoomFunction(req);
        if (!req.user) {
            throw new Error("Request authenticated, but user session not found");
        }
        return res.json({
            username: req.user.username,
            provider: req.user.provider,
            picture: req.user.picture,
            updatedAt: req.user.updatedAt,
        });
    } catch (error) {
        next(error);
    }
}

function generateRandomUserColor(): string {
    let colorChoices = [
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

    return colorChoices[Math.floor(Math.random() * colorChoices.length)];
}

export async function exitRoomFunction(req: Request) {
    await prisma.$transaction(async (prisma) => {
        if (!req.session.passport.user) {
            throw new Error(
                "Request authenticated, but user session not found"
            );
        }

        let user = await prisma.user.findUnique({
            where: {
                id: req.session.passport.user.id,
            },
        });
        let room = await getUserRoomSession(req.session.passport.user.id);
        let roomId = room?.roomId || user?.roomId;

        if (!roomId) {
            await deleteUserRoomSession(req.session.passport.user.id);
            io.to(req.sessionID).disconnectSockets();
            req.session.save();
            return;
        }

        // Update the user table with the roomId
        if (user?.roomId) {
            await prisma.user.update({
                data: {
                    roomId: null,
                },
                where: {
                    id: req.session.passport.user.id,
                },
            });
        }

        let currentUsers = await prisma.user.findMany({
            where: {
                roomId: roomId,
            },
        });
        const persistedRoom = await prisma.room.findUnique({
            where: {
                id: roomId,
            },
            select: {
                createdAt: true,
            },
        });
        const roomCreatedAt = room?.createdAt || persistedRoom?.createdAt;
        const roomAgeInMilliseconds = roomCreatedAt
            ? Date.now() - new Date(roomCreatedAt).getTime()
            : undefined;
            
        const shouldDeleteEmptyRoom =
            currentUsers.length == 0 &&
            roomAgeInMilliseconds !== undefined &&
            roomAgeInMilliseconds < ROOM_HISTORY_RETENTION_THRESHOLD_MS;

        // Only clean up empty rooms that are less than one hour old.
        // Cleanup should not prevent the current user from leaving the room.
        if (shouldDeleteEmptyRoom) {
            try {
                await prisma.submission.deleteMany({
                    where: {
                        roomId: roomId,
                    },
                });
                await prisma.roomUser.deleteMany({
                    where: {
                        roomId: roomId,
                    },
                });
                await prisma.roomQuestion.deleteMany({
                    where: {
                        roomId: roomId,
                    },
                });
                await prisma.room.delete({
                    where: {
                        id: roomId,
                    },
                });
            } catch (error) {
                logger.warn({ error, roomId }, "Failed to delete empty room");
            }
        }

        let userColor = room?.userColor || generateRandomUserColor();
        let exitMessage: MessageInterface = {
            timestamp: Date.now(),
            username: getRoomDisplayName(
                req.session.passport.user.username,
                room?.nickname
            ),
            body: "left the room.",
            chatEvent: ChatEvent.Leave,
            color: userColor,
        };
        io.to(roomId).emit("chat-message", exitMessage);

        // Update the session
        await deleteUserRoomSession(req.session.passport.user.id);

        io.to(req.sessionID).disconnectSockets();
        req.session.save();
    });
}

function sendJoinRoomMessage(username: string, room: RoomSession) {
    let newJoinMessage: MessageInterface = {
        timestamp: Date.now(),
        username: username,
        body: "joined the room!",
        chatEvent: ChatEvent.Join,
        color: room.userColor,
    };
    // Delay by 500ms so that the user can see the join room message when re-entering
    setTimeout(() => {
        io.to(room.roomId).emit("chat-message", newJoinMessage);
    }, 500);
}

function parseRoomNickname(nickname: unknown) {
    if (nickname === undefined || nickname === null) {
        return null;
    }

    if (typeof nickname !== "string") {
        throw new Error("Invalid nickname");
    }

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
        return null;
    }

    if (trimmedNickname.length > ROOM_NICKNAME_MAX_LENGTH) {
        throw new Error(
            `Nickname must be ${ROOM_NICKNAME_MAX_LENGTH} characters or fewer`
        );
    }

    if (!ROOM_NICKNAME_PATTERN.test(trimmedNickname)) {
        throw new Error(
            "Nickname can only contain letters, numbers, and spaces"
        );
    }

    return trimmedNickname;
}

function getRoomDisplayName(username: string, nickname?: string | null) {
    return nickname || username;
}

async function enforceRoomNicknameRateLimit(
    userId: string | number,
    roomId: string
) {
    const rateLimitKey = `roomNicknameChange:${roomId}:${userId}`;
    const changeCount = await redisClient.incr(rateLimitKey);
    if (changeCount === 1) {
        await redisClient.expire(
            rateLimitKey,
            ROOM_NICKNAME_RATE_LIMIT_WINDOW_SECONDS
        );
    }

    if (changeCount > ROOM_NICKNAME_RATE_LIMIT_MAX_CHANGES) {
        throw new Error(
            `Nickname can only be changed ${ROOM_NICKNAME_RATE_LIMIT_MAX_CHANGES} times every hour`
        );
    }
}

function getNumberOfQuestionsPerDifficulty(
    roomDifficulty: RoomDifficulty,
    easyQuestions: Question[],
    mediumQuestions: Question[],
    hardQuestions: Question[]
): RoomDifficultyNumberOfQuestions {
    let { Easy: easy, Medium: medium, Hard: hard } = roomDifficulty;
    if (easy && medium && hard) {
        let numberOfQuestions = {
            Easy: 1,
            Medium: 2,
            Hard: 1,
        };

        // If there are not enough easy questions, get more medium or hard questions.
        if (easyQuestions.length < numberOfQuestions.Easy) {
            let diff = numberOfQuestions.Easy - easyQuestions.length;
            numberOfQuestions.Easy = easyQuestions.length;
            if (mediumQuestions.length >= numberOfQuestions.Medium + diff) {
                numberOfQuestions.Medium += diff;
            } else if (hardQuestions.length >= numberOfQuestions.Hard + diff) {
                numberOfQuestions.Hard += diff;
            }
        }

        // If there are not enough medium questions, get more easy or hard questions.
        if (mediumQuestions.length < numberOfQuestions.Medium) {
            let diff = numberOfQuestions.Medium - mediumQuestions.length;
            numberOfQuestions.Medium = mediumQuestions.length;
            if (easyQuestions.length >= numberOfQuestions.Easy + diff) {
                numberOfQuestions.Easy += diff;
            } else if (hardQuestions.length >= numberOfQuestions.Hard + diff) {
                numberOfQuestions.Hard += diff;
            }
        }

        // If there are not enough hard questions, get more easy or medium questions.
        if (hardQuestions.length < numberOfQuestions.Hard) {
            let diff = numberOfQuestions.Hard - hardQuestions.length;
            numberOfQuestions.Hard = hardQuestions.length;
            if (easyQuestions.length >= numberOfQuestions.Easy + diff) {
                numberOfQuestions.Easy += diff;
            } else if (
                mediumQuestions.length >=
                numberOfQuestions.Medium + diff
            ) {
                numberOfQuestions.Medium += diff;
            }
        }

        return numberOfQuestions;
    } else if (easy && medium) {
        let numberOfQuestions = {
            Easy: 2,
            Medium: 2,
            Hard: 0,
        };

        if (easyQuestions.length < numberOfQuestions.Easy) {
            let diff = numberOfQuestions.Easy - easyQuestions.length;
            numberOfQuestions.Easy = easyQuestions.length;
            if (mediumQuestions.length >= numberOfQuestions.Medium + diff) {
                numberOfQuestions.Medium += diff;
            }
        }

        if (mediumQuestions.length < numberOfQuestions.Medium) {
            let diff = numberOfQuestions.Medium - mediumQuestions.length;
            numberOfQuestions.Medium = mediumQuestions.length;
            if (easyQuestions.length >= numberOfQuestions.Easy + diff) {
                numberOfQuestions.Easy += diff;
            }
        }

        return numberOfQuestions;
    } else if (easy && hard) {
        let numberOfQuestions = {
            Easy: 2,
            Medium: 0,
            Hard: 2,
        };

        if (easyQuestions.length < numberOfQuestions.Easy) {
            let diff = numberOfQuestions.Easy - easyQuestions.length;
            numberOfQuestions.Easy = easyQuestions.length;
            if (hardQuestions.length >= numberOfQuestions.Hard + diff) {
                numberOfQuestions.Hard += diff;
            }
        }

        if (hardQuestions.length < numberOfQuestions.Hard) {
            let diff = numberOfQuestions.Hard - hardQuestions.length;
            numberOfQuestions.Hard = hardQuestions.length;
            if (easyQuestions.length >= numberOfQuestions.Easy + diff) {
                numberOfQuestions.Easy += diff;
            }
        }

        return numberOfQuestions;
    } else if (medium && hard) {
        let numberOfQuestions = {
            Easy: 0,
            Medium: 2,
            Hard: 2,
        };

        if (mediumQuestions.length < numberOfQuestions.Medium) {
            let diff = numberOfQuestions.Medium - mediumQuestions.length;
            numberOfQuestions.Medium = mediumQuestions.length;
            if (hardQuestions.length >= numberOfQuestions.Hard + diff) {
                numberOfQuestions.Hard += diff;
            }
        }

        if (hardQuestions.length < numberOfQuestions.Hard) {
            let diff = numberOfQuestions.Hard - hardQuestions.length;
            numberOfQuestions.Hard = hardQuestions.length;
            if (mediumQuestions.length >= numberOfQuestions.Medium + diff) {
                numberOfQuestions.Medium += diff;
            }
        }

        return numberOfQuestions;
    } else if (easy) {
        return {
            Easy: 4,
            Medium: 0,
            Hard: 0,
        };
    } else if (medium) {
        return {
            Easy: 0,
            Medium: 4,
            Hard: 0,
        };
    } else if (hard) {
        return {
            Easy: 0,
            Medium: 0,
            Hard: 4,
        };
    }
    return {
        Easy: 0,
        Medium: 0,
        Hard: 0,
    };
}
