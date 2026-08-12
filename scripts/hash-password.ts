import argon2 from "argon2";

async function main() {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive terminal is required; password input is never read from a pipe.");
  }

  // Prompts go to stderr so stdout contains only the PHC hash and can be
  // safely redirected into AUTH_PASSWORD_HASH without leaking plaintext.
  process.stderr.write("Password: ");
  const chunks: Buffer[] = [];
  const onData = (chunk: Buffer) => {
    for (const byte of chunk) {
      if (byte === 3) process.exit(130);
      if (byte === 13 || byte === 10) {
        process.stdin.emit("password-complete");
      } else if (byte === 127) {
        chunks.pop();
      } else {
        chunks.push(Buffer.from([byte]));
      }
    }
  };
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", onData);

  await new Promise<void>((resolve) => process.stdin.once("password-complete", resolve));

  process.stdin.off("data", onData);
  process.stdin.setRawMode?.(false);
  process.stderr.write("\n");
  const password = Buffer.concat(chunks).toString("utf8");
  if (!password) throw new Error("Password cannot be empty.");
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  process.stdout.write(`${hash}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
