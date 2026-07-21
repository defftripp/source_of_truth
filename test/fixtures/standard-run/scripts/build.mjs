import { message } from "../src/message.mjs";

if (!message.includes("STANDARD")) {
  process.exitCode = 1;
}
