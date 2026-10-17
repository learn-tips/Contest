import { SubmissionStatus } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
import prisma from "../../index";
import { getUserRoomSession, io } from "../app";
import { SubmissionRequestBody } from "./submissions.model";
import { MessageInterface, ChatEvent } from "../../types/Message";
import { RoomSession } from "../../types/Session";
import { PlayerSubmission, PlayerWithSubmissions } from "../rooms/rooms.model";

export async function createSubmission(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const completion = await prisma.$transaction(async (prisma) => {
            let room = await getUserRoomSession(req.session.passport.user.id);
            if (!room?.roomId) {
                throw new Error("Could not find a room for the current user");
            }
            let userId = req.session.passport.user.id;
            let roomId = room.roomId;

            let submissionRequestBody: SubmissionRequestBody = req.body;
            let {
                submissionStatus,
                questionTitleSlug,
                url: submissionUrl,
            } = submissionRequestBody;

            const prefix = `https://leetcode.com/problems/${questionTitleSlug}/submissions/`;
            if (typeof submissionUrl !== "string" || !submissionUrl.startsWith(prefix) ||
                !/^\d+\/?$/.test(submissionUrl.slice(prefix.length))) {
                res.status(400);
                throw new Error("A concrete numeric LeetCode submission URL matching the problem is required");
            }

            if (
                submissionStatus !== SubmissionStatus.Accepted &&
                submissionStatus !== SubmissionStatus.Attempted
            ) {
                throw new Error("Invalid submission status");
            }

            if (!submissionUrl.includes(questionTitleSlug)) {
                throw new Error("Invalid questionTitleSlug");
            }

            if (
                !submissionUrl.startsWith(
                    `https://leetcode.com/problems/${questionTitleSlug}/submissions/`
                )
            ) {
                throw new Error("Invalid submission URL");
            }

            let question = await prisma.question.findUnique({
                where: {
                    titleSlug: questionTitleSlug,
                },
            });
            if (!question) {
                throw new Error(
                    "Could not find a question with the given titleSlug"
                );
            }
            let questionId = question.id;
            const roomQuestion = await prisma.roomQuestion.findUnique({
                where: { roomId_questionId: { roomId, questionId } },
            });
            if (!roomQuestion) {
                res.status(400);
                throw new Error("The submitted problem does not belong to this room");
            }
            let existingSubmission = await prisma.submission.findUnique({
                where: {
                    userId_questionId_roomId: {
                        userId: userId,
                        questionId: questionId,
                        roomId: roomId,
                    },
                },
            });
            let wasAlreadyAccepted =
                existingSubmission?.status === SubmissionStatus.Accepted;

            await prisma.submission.upsert({
                where: {
                    userId_questionId_roomId: {
                        userId: userId,
                        questionId: questionId,
                        roomId: roomId,
                    },
                },
                update: {
                    status: submissionStatus,
                    url: submissionUrl,
                },
                create: {
                    userId: userId,
                    roomId: roomId,
                    questionId: questionId,
                    status: submissionStatus,
                    url: submissionUrl,
                },
            });

            if (submissionStatus !== SubmissionStatus.Accepted) {
                return;
            }

            let response: PlayerWithSubmissions[] =
                await prisma.$queryRaw`SELECT u.id, COALESCE(ru."nickname", u.username) AS username, ru."joinedAt" AS "updatedAt", json_agg(json_build_object(
                'questionId', q.id,
                'title', q.title,
                'titleSlug', q."titleSlug",
                'difficulty', q.difficulty,
                'status', s.status,
                'updatedAt', s."updatedAt",
                'url', s.url
            ))  as submissions
            FROM "User" u
            LEFT JOIN "RoomUser" ru ON ru."roomId" = ${roomId} AND ru."userId" = u.id
            LEFT JOIN "RoomQuestion" rq ON rq."roomId" = ${roomId}
            LEFT JOIN "Question" q ON rq."questionId" = q.id
            LEFT JOIN "Submission" s ON s."questionId" = rq."questionId" AND s."roomId" = rq."roomId" AND s."userId" = u.id
                AND s.url !~* '/submissions/standalone([/?#]|$)'
            WHERE rq."roomId" = ${roomId} AND u.id = ${userId}
            GROUP BY u.id, ru."nickname", ru."joinedAt";`;

            let allAccepted = response.every((player) => {
                return player.submissions.every((submission) => {
                    return submission.status === SubmissionStatus.Accepted;
                });
            });

            let lastAcceptedSubmission = response[0].submissions.filter(
                (submission) => {
                    return submission.titleSlug === questionTitleSlug;
                }
            )[0];

            let playerEnteredAt = response[0].updatedAt;

            let completedTimeString = getSubmissionTime(
                playerEnteredAt,
                lastAcceptedSubmission
            );

            if (
                !wasAlreadyAccepted &&
                allAccepted &&
                completedTimeString
            ) {
                return { username: response[0].username, room, completedTimeString };
            }
            return;
        });
        if (completion) {
            sendCompletedRoomMessage(completion.username, completion.room, completion.completedTimeString);
        }
        return res.json({ confirmed: true, questionTitleSlug: req.body.questionTitleSlug,
            url: req.body.url, submissionStatus: req.body.submissionStatus });
    } catch (error) {
        return next(error);
    }
}

function sendCompletedRoomMessage(
    username: string,
    room: RoomSession,
    completedTimeString: string
) {
    let completedRoomMessage: MessageInterface = {
        timestamp: Date.now(),
        username: username,
        body: `completed the room in ${completedTimeString}!`,
        chatEvent: ChatEvent.Complete,
        color: room.userColor,
    };
    io.to(room.roomId).emit("chat-message", completedRoomMessage);
}

function calculateTimeDifference(playerEnteredAt: Date, submittedAt: Date) {
    const dateConvertedSubmissionTime = new Date(submittedAt);

    let dateConvertedPlayerEnteredAt = new Date(playerEnteredAt);
    const userTimezoneOffset =
        dateConvertedPlayerEnteredAt.getTimezoneOffset() * 60000;
    dateConvertedPlayerEnteredAt = new Date(
        dateConvertedPlayerEnteredAt.getTime() +
            userTimezoneOffset * Math.sign(userTimezoneOffset)
    );

    const timeDifference =
        dateConvertedSubmissionTime.getTime() -
        dateConvertedPlayerEnteredAt.getTime();

    return timeDifference;
}

function getSubmissionTime(
    playerEnteredAt: Date,
    submission: PlayerSubmission
) {
    const submissionTime = submission.updatedAt;
    if (submission.status !== SubmissionStatus.Accepted || !submissionTime) {
        return undefined;
    }

    const solvedTime = calculateTimeDifference(playerEnteredAt, submissionTime);

    const seconds = Math.floor((solvedTime / 1000) % 60);
    const minutes = Math.floor((solvedTime / (1000 * 60)) % 60);
    const hours = Math.floor((solvedTime / (1000 * 60 * 60)) % 24);

    let result = "";
    if (seconds) {
        result += `${seconds}s`;
    }
    if (minutes) {
        result = `${minutes}m ${result}`;
    }
    if (hours) {
        result = `${hours}h ${result}`;
    }
    return result;
}
