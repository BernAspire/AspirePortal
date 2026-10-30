// Client-safe public API of the question-bank module: the renderer and content types,
// without the server-only queries in index.ts, so client components can render questions.
export { QuestionBlocks, QuestionTable, RichText, WorkedSteps } from "./render/question-blocks";
export { blockSchema, DIFFICULTY_LABEL, richSchema, type Block, type Difficulty, type QuestionContent, type Rich } from "./schema";
