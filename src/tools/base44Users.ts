import {
  fingerprintSecret,
  isPlaceholderSecret,
  listBase44Users,
  loadBase44Config,
  redactSecret,
  writeBase44SecuritySnapshot
} from "../shared/base44";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadBase44Config(cwd);

  if (isPlaceholderSecret(config.apiKey)) {
    throw new Error("BASE44_API_KEY still looks like a placeholder. Rotate it in Base44 and update .env first.");
  }

  const users = await listBase44Users(config);
  const snapshotPath = writeBase44SecuritySnapshot(cwd, config, users.length);

  console.log("Base44 users");
  console.log(`- appId: ${config.appId}`);
  console.log(`- apiBase: ${config.apiBase}`);
  console.log(`- apiKey: ${redactSecret(config.apiKey)}`);
  console.log(`- apiKey fingerprint: ${fingerprintSecret(config.apiKey)}`);
  console.log(`- userCount: ${users.length}`);
  console.log(`- security snapshot: ${snapshotPath}`);

  for (const user of users) {
    console.log(
      `- ${user.full_name ?? "Unknown name"} | ${user.email ?? "no-email"} | ${user.role ?? "unknown-role"}`
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
