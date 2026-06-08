import {
  fingerprintSecret,
  isPlaceholderSecret,
  loadBase44Config,
  redactSecret,
  writeBase44SecuritySnapshot
} from "../shared/base44";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadBase44Config(cwd);
  const snapshotPath = writeBase44SecuritySnapshot(cwd, config);

  console.log("Base44 status");
  console.log(`- appId: ${config.appId}`);
  console.log(`- apiBase: ${config.apiBase}`);
  console.log(`- env sources: ${config.source.join(", ")}`);
  console.log(`- apiKey: ${redactSecret(config.apiKey)}`);
  console.log(`- apiKey fingerprint: ${fingerprintSecret(config.apiKey)}`);
  console.log(`- placeholder key: ${isPlaceholderSecret(config.apiKey) ? "yes" : "no"}`);
  console.log(`- security snapshot: ${snapshotPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
