const ticketIds = JSON.parse(process.env.ENGINEERING_ADVISOR_TICKETS ?? "null");
const evidence = JSON.parse(process.env.ENGINEERING_ADVISOR_EVIDENCE ?? "null");
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  status: "APPROVED",
  ticketIds,
  evidence,
  concerns: [],
})}\n`);
