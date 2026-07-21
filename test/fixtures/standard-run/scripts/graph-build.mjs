import { message } from "../src/message.mjs";
import { audience } from "../src/audience.mjs";
import { punctuation } from "../src/punctuation.mjs";

if (
  !message.includes("STANDARD") ||
  String(audience) !== "engineers" ||
  String(punctuation) !== "!"
) {
  process.exitCode = 1;
}
