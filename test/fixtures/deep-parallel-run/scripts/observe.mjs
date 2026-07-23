import { valueA } from "../src/a.mjs";
import { valueB } from "../src/b.mjs";

if (String(valueA) !== "TICKET-A" || String(valueB) !== "TICKET-B") {
  process.exitCode = 1;
}
