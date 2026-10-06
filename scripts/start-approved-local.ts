// Run only after the human approves existing credential reuse for this process.
// Read existing BC configuration at launch; never duplicate env files or log values.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { spawn } from "node:child_process";
async function start() {
  if (process.env.HC_ASSETS_REUSE_BC_CREDENTIALS !== "approved")
    throw new Error(
      "Approve secure reuse of the existing BC credentials before using this launcher.",
    );
  if (typeof parseEnv !== "function")
    throw new Error("This secure launcher requires Node 20.12 or newer.");
  const root =
    process.env.HC_ASSETS_BC_CONFIGURATION_DIRECTORY ||
    "/Users/anthonyponcio/Projects/butcherscounter/butchers-counter-web";
  const names = [
    "OPENAI_API_KEY",
    ...(process.env.HC_ASSETS_REUSE_BC_GOOGLE === "approved"
      ? ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"]
      : []),
  ];
  const inherited = { ...process.env };
  let bcModel = "gpt-5.6-terra";
  for (const file of [".env", ".env.local"]) {
    try {
      const values = parseEnv(await readFile(path.join(root, file), "utf8"));
      if (values.OPENAI_MODEL) bcModel = values.OPENAI_MODEL;
      for (const name of names)
        if (values[name]) inherited[name] = values[name];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Existing BC configuration could not be read securely.",
        );
    }
  }
  if (process.env.HC_ASSETS_USE_BC_MODEL === "approved") {
    inherited.HC_ASSETS_OPENAI_MODEL = bcModel;
    if (process.env.HC_ASSETS_RESALE_ENABLED === "approved")
      inherited.HC_ASSETS_SEARCH_MODEL = bcModel;
  }
  if (names.some((name) => !inherited[name]))
    throw new Error(
      "An approved existing credential is missing. No server was started.",
    );
  const port = process.env.HC_ASSETS_LOCAL_PORT || "3405";
  if (!/^\d{4,5}$/.test(port) || Number(port) > 65535 || Number(port) < 1024)
    throw new Error("Invalid local preview port.");
  console.log(
    "Starting private loopback HCAssets with approved credential reuse. No values are logged or saved. The BC workbook ID, payment, email and operations credentials are not imported.",
  );
  const child = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "-p",
      port,
    ],
    { env: inherited, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("The private local server could not start.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
}
void start().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
