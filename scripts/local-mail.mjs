import { SMTPServer } from "smtp-server";
import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
const directory = path.resolve(".local", "mailbox");
mkdirSync(directory, { recursive: true });
const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  onData(stream, session, callback) {
    let message = "";
    stream.on("data", (chunk) => {
      message += chunk.toString();
      if (message.length > 100000) stream.destroy();
    });
    stream.on("end", () => {
      appendFileSync(
        path.join(directory, "messages.jsonl"),
        JSON.stringify({
          receivedAt: new Date(),
          to: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: message,
        }) + "\n",
        { mode: 0o600 },
      );
      callback();
    });
    stream.on("error", callback);
  },
});
server.listen(1025, "127.0.0.1", () =>
  console.log(
    "Local SMTP inbox ready on 127.0.0.1:1025. Messages stay in ignored .local/mailbox/messages.jsonl; no internet email is sent.",
  ),
);
server.on("error", () => {
  console.error("Local SMTP could not start. Check port 1025.");
  process.exit(1);
});
