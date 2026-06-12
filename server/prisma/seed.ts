import { Difficulty, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import axios from "axios";

const QUESTION_PAGE_SIZE = 100;
const QUESTION_LIST_QUERY = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: $categorySlug
    limit: $limit
    skip: $skip
    filters: $filters
  ) {
    total: totalNum
    questions: data {
      acRate
      difficulty
      freqBar
      frontendQuestionId: questionFrontendId
      isFavor
      paidOnly: isPaidOnly
      status
      title
      titleSlug
      topicTags {
        name
        id
        slug
      }
      hasSolution
      hasVideoSolution
    }
  }
}
`;

interface LeetCodeQuestion {
    difficulty: string;
    frontendQuestionId: string;
    paidOnly: boolean;
    title: string;
    titleSlug: string;
    topicTags: { name: string }[];
}

interface QuestionSeed {
    id: number;
    title: string;
    titleSlug: string;
    difficulty: Difficulty;
    tags: string[];
}

function parseDifficulty(difficulty: string): Difficulty | null {
    if (difficulty === Difficulty.Easy) return Difficulty.Easy;
    if (difficulty === Difficulty.Medium) return Difficulty.Medium;
    if (difficulty === Difficulty.Hard) return Difficulty.Hard;
    return null;
}

async function main() {
    let skip = 0;
    let total = Infinity;
    let transformedResponse: QuestionSeed[] = [];
    const seenQuestionIds = new Set<number>();
    const seenQuestionSlugs = new Set<string>();

    while (skip < total) {
        const response = await axios.post(
            "https://leetcode.com/graphql/",
            {
                query: QUESTION_LIST_QUERY,
                variables: {
                    categorySlug: "",
                    skip,
                    limit: QUESTION_PAGE_SIZE,
                    filters: {},
                },
            },
            {
                headers: {
                    "Accept-Encoding": "application/json",
                },
            }
        );

        const questionList = response.data.data.problemsetQuestionList;
        const questions: LeetCodeQuestion[] = questionList.questions;
        total = questionList.total;

        for (const question of questions) {
            const questionId = +question.frontendQuestionId;
            const difficulty = parseDifficulty(question.difficulty);

            if (
                question.paidOnly ||
                !difficulty ||
                seenQuestionIds.has(questionId) ||
                seenQuestionSlugs.has(question.titleSlug)
            ) {
                continue;
            }

            seenQuestionIds.add(questionId);
            seenQuestionSlugs.add(question.titleSlug);
            transformedResponse.push({
                id: questionId,
                title: question.title,
                titleSlug: question.titleSlug,
                difficulty,
                tags: question.topicTags.map((tag) => tag.name),
            });
        }

        skip += questions.length;

        if (!questions.length) {
            break;
        }
    }

    await prisma.$transaction([
        prisma.question.deleteMany({}),
        prisma.question.createMany({
            data: transformedResponse,
        }),
    ]);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
