import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const launcher = path.resolve("scripts/start-approved-local.ts");
const tsx = path.resolve("node_modules/tsx/dist/loader.mjs");
test("secure launcher refuses unapproved reuse and imports only allowed existing names, with local overrides and no secret logging", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hc-launcher-test-"));
  try {
    const bc = path.join(root, "bc"),
      app = path.join(root, "app");
    await mkdir(bc);
    await mkdir(path.join(app, "node_modules/next/dist/bin"), {
      recursive: true,
    });
    await writeFile(
      path.join(bc, ".env"),
      'OPENAI_API_KEY=synthetic-original\nGOOGLE_SERVICE_ACCOUNT_EMAIL=synthetic@test.invalid\nGOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="synthetic-key"\nGOOGLE_SHEETS_SPREADSHEET_ID=must-not-import\nCHECKOUT_SECRET_KEY=must-not-import\nBC_OPERATIONS_TOKEN=must-not-import\n',
    );
    await writeFile(
      path.join(bc, ".env.local"),
      "OPENAI_API_KEY=synthetic-override\n",
    );
    await writeFile(
      path.join(app, "node_modules/next/dist/bin/next"),
      'if(process.env.OPENAI_API_KEY!=="synthetic-override" || process.env.CHECKOUT_SECRET_KEY || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.BC_OPERATIONS_TOKEN || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!=="synthetic@test.invalid" || !process.argv.includes("127.0.0.1"))process.exit(2);console.log("SAFE_LAUNCH_VERIFIED");',
    );
    const env = {
      NODE_ENV: "test" as const,
      PATH: process.env.PATH,
      HC_ASSETS_BC_CONFIGURATION_DIRECTORY: bc,
    };
    const blocked = spawnSync(process.execPath, ["--import", tsx, launcher], {
      cwd: app,
      env,
      encoding: "utf8",
    });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Approve secure reuse/);
    const allowed = spawnSync(process.execPath, ["--import", tsx, launcher], {
      cwd: app,
      env: {
        ...env,
        HC_ASSETS_REUSE_BC_CREDENTIALS: "approved",
        HC_ASSETS_REUSE_BC_GOOGLE: "approved",
      },
      encoding: "utf8",
    });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /SAFE_LAUNCH_VERIFIED/);
    assert.doesNotMatch(
      allowed.stdout + allowed.stderr,
      /synthetic-override|synthetic-key|must-not-import/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
