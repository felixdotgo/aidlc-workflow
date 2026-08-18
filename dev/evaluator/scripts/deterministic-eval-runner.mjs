#!/usr/bin/env node
if (process.argv.includes("--doctor")) {
  process.stdout.write(JSON.stringify({ available: true, driver: "local-simulated", protocolVersion: 2, evidenceKind: "simulated" }));
  process.exit(0);
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(input);
  const transcript = request.scenario.turns.map((turn) => turn.input).join(" ") + " next effective human fail escalate canonical state";
  process.stdout.write(JSON.stringify({ transport: "completed", transcript, events: [{ type: "no-upgrade-command" }], usage: { contextChars: Math.min(1000, request.scenario.maxContextChars), latencyMs: 1 }, diagnostics: ["simulated runner; not release eligible"] }));
});
