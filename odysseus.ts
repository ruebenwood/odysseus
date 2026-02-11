import { runCodexPrompt } from "./lib/codexBridge";

export type OdysseusMode =
  | "build"
  | "design"
  | "refactor"
  | "analyze"
  | "deploy"
  | "api"
  | "mobile";

const BASE_ODYSSEUS_INSTRUCTIONS = `
You are Odysseus.ai, an autonomous software architect.
`.trim();

const MODE_BEHAVIOR: Record<OdysseusMode, string> = {
  // same as in lib/odysseus.ts
  build: "Mode: BUILD ...",
  design: "Mode: DESIGN ...",
  refactor: "Mode: REFACTOR ...",
  analyze: "Mode: ANALYZE ...",
  deploy: "Mode: DEPLOY ...",
  api: "Mode: API ...",
  mobile: "Mode: MOBILE ...",
};

export async function runOdysseusTaskNode(
  userRequest: string,
  mode: OdysseusMode = "build"
) {
  const instructions = `
${BASE_ODYSSEUS_INSTRUCTIONS}

${MODE_BEHAVIOR[mode]}
`.trim();

  const prompt = `
${instructions}

Mode: ${mode}

User request:
${userRequest}
`.trim();

  const result = await runCodexPrompt(prompt);
  return result;
}
