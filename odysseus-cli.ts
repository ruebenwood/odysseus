import { runOdysseusTaskNode } from "./odysseus";
import { OdysseusMode } from "./odysseus/config";

const [, , ...rawArgs] = process.argv;

let mode: OdysseusMode = "build";
const taskParts: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "--mode" && rawArgs[i + 1]) {
    mode = rawArgs[i + 1] as OdysseusMode;
    i++;
  } else {
    taskParts.push(arg);
  }
}

const task = taskParts.join(" ").trim();

if (!task) {
  console.error(
    'Usage: node odysseus-cli.js [--mode build|design|refactor|analyze|deploy|api|mobile] "task description"'
  );
  process.exit(1);
}

runOdysseusTaskNode(task, mode)
  .then((result) => {
    console.log(result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
