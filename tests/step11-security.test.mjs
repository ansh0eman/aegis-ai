import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicRegistrationOpen,
  isSameOriginMutation,
} from "../lib/request-security.ts";

test("public registration is closed by default only in production", () => {
  assert.equal(isPublicRegistrationOpen("development", undefined), true);
  assert.equal(isPublicRegistrationOpen("production", undefined), false);
  assert.equal(isPublicRegistrationOpen("production", "true"), true);
  assert.equal(isPublicRegistrationOpen("production", "false"), false);
});

test("cookie-authenticated mutations reject cross-origin browser requests", () => {
  const sameOrigin = new Request("https://aegis.example/api/admin/users", {
    method: "POST",
    headers: { origin: "https://aegis.example", "sec-fetch-site": "same-origin" },
  });
  const crossOrigin = new Request("https://aegis.example/api/admin/users", {
    method: "POST",
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  });
  const crossSiteWithoutOrigin = new Request("https://aegis.example/api/admin/users", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  const siblingOriginWithoutOrigin = new Request("https://aegis.example/api/admin/users", {
    method: "POST",
    headers: { "sec-fetch-site": "same-site" },
  });
  const nonBrowser = new Request("https://aegis.example/api/admin/users", {
    method: "POST",
  });

  assert.equal(isSameOriginMutation(sameOrigin), true);
  assert.equal(isSameOriginMutation(crossOrigin), false);
  assert.equal(isSameOriginMutation(crossSiteWithoutOrigin), false);
  assert.equal(isSameOriginMutation(siblingOriginWithoutOrigin), false);
  assert.equal(isSameOriginMutation(nonBrowser), true);
});
