import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintSecret, isPlaceholderSecret, redactSecret } from "../src/shared/base44";

test("redactSecret keeps only the ends of long secrets", () => {
  assert.equal(redactSecret("1234567890abcdef"), "1234...cdef");
});

test("fingerprintSecret returns a stable short digest", () => {
  assert.equal(fingerprintSecret("base44-secret"), fingerprintSecret("base44-secret"));
  assert.equal(fingerprintSecret("base44-secret").length, 12);
});

test("isPlaceholderSecret catches setup placeholders", () => {
  assert.equal(isPlaceholderSecret("replace-after-rotating-in-base44"), true);
  assert.equal(isPlaceholderSecret("real-secret-value"), false);
});
