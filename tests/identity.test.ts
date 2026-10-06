import { test } from "node:test";
import assert from "node:assert/strict";
import { similarSerial } from "../lib/serial.mjs";
import { failure } from "../lib/server/http";
import { SheetGatewayError } from "../lib/server/sheet-gateway";

test("OCR similarity catches omissions, insertions, substitutions, transposition and spacing without equating unrelated identifiers", () => {
  for (const value of [
    "QYC7K1QR9",
    "QY88C7K1QR9",
    "QY8C7KIQR9",
    "QY8C7KQ1R9",
    "QY8 C7K1QR9",
    "qy8c7k1qr9",
  ])
    assert.equal(similarSerial("QY8C7K1QR9", value), true, value);
  for (const value of ["", "12345", "OTHER9999", "QXXC7K1QR9"])
    assert.equal(similarSerial("QY8C7K1QR9", value), false, value);
});
test("live duplicate errors expose a recoverable existing asset link and conflict status", async () => {
  const response = failure(
    new SheetGatewayError("possible-duplicate", "Review serial", "existing-id"),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Review serial",
    assetId: "existing-id",
    code: "possible-duplicate",
  });
});
