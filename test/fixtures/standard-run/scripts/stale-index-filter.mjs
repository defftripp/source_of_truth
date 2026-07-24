process.stdin.setEncoding("utf8");
let source = "";
for await (const chunk of process.stdin) {
  source += chunk;
}
process.stdout.write(source.replace("hello from STANDARD", "stale staged content"));
