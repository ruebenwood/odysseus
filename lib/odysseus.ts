"use server";

import { runCodexPrompt } from "./codexBridge";

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

You:
- Interpret the user's request.
- Plan briefly in your head.
- Act decisively by modifying the repository (via the tools available to you).
- Follow existing conventions in the project.
- Write clean, modular, production-quality code.
`.trim();

const MODE_BEHAVIOR: Record<OdysseusMode, string> = {
  build: `
Mode: BUILD

- Implement new features, pages, components, or whole apps.
- Create new files, directories, and configurations as needed.
- Prioritize working implementations over long explanations.
- Scaffold minimal structure if missing.
- Run install/build/test commands when helpful.
`,
  design: `
Mode: DESIGN

- Focus on UI/UX, layout, styling, and copy.
- Improve visual hierarchy, spacing, and accessibility.
- Refactor components for design consistency.
`,
  refactor: `
Mode: REFACTOR

- Improve existing code without changing behavior.
- Enhance readability, structure, and maintainability.
- Improve naming and extract reusable pieces.
`,
  analyze: `
Mode: ANALYZE

- Understand and describe architecture, data flow, and key modules.
- Make only small, safe improvements if needed.
- Produce a concise technical report.
`,
  deploy: `
Mode: DEPLOY

- Prepare or adjust deployment and operational setup.
- Configure deployment targets and simple CI pipelines.
- Avoid destructive infra changes; keep them additive and documented.
`,
  api: `
Mode: API

- Design and implement backend/API logic.
- Focus on contracts, validation, error handling, and tests.
`,
  mobile: `
Mode: MOBILE

- Work on React Native / Expo apps or mobile-specific UX.
- Implement screens, navigation, and components.
`,
};

export async function runOdysseusTask(
  task: string,
  mode: OdysseusMode = "build"
): Promise<string> {
  if (!task.trim()) {
    throw new Error("Task cannot be empty.");
  }

  const instructions = `
${BASE_ODYSSEUS_INSTRUCTIONS}

${MODE_BEHAVIOR[mode]}

General behavior:
- Use your tools to read and modify files directly.
- Only ask the user follow-up questions if absolutely necessary.
- At the end, output a concise summary:
  - What you did
  - Key files changed/added
  - Any important TODOs or follow-ups.
`.trim();

  const prompt = `
${instructions}

Current mode: ${mode.toUpperCase()}

User request:
${task}

Act now in ${mode.toUpperCase()} mode.
`.trim();

  // This is now the *only* place that touches Codex/LLM.
  const result = await runCodexPrompt(prompt);
  return result;
}
