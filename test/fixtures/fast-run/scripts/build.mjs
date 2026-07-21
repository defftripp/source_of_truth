const { message } = await import("../src/message.mjs");

if (String(message) !== "hello from FAST") {
  process.exitCode = 1;
}
