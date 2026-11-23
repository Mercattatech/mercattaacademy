import { checkEnv, hasErrors } from "../src/lib/env";

const issues = checkEnv(process.env);
if (issues.length === 0) console.log("Ambiente em ordem.");
for (const i of issues) console.log(`${i.level === "error" ? "ERRO   " : "AVISO  "} ${i.key}: ${i.message}`);
process.exit(hasErrors(issues) ? 1 : 0);
