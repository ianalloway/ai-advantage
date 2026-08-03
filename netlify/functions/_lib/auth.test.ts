import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_AUTH_SECRET,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  validationError,
  verifyPassword,
} from "../auth";

const SALT = "0123456789abcdef0123456789abcdef";
const originalSecret = process.env.AUTH_SECRET;

function storedUser(passwordHash: string, passwordSalt = SALT) {
  return {
    id: "u1",
    email: "user@example.com",
    username: "user",
    displayName: "User",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    passwordHash,
    passwordSalt,
  };
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-alpha";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("validationError", () => {
  const valid = { email: "a@b.com", username: "good_user", password: "longenough" };

  it("accepts a well-formed signup", () => {
    expect(validationError(valid)).toBeNull();
  });

  it("rejects a malformed email", () => {
    expect(validationError({ ...valid, email: "nope" })).toMatch(/valid email/i);
  });

  it("rejects usernames outside the allowed shape", () => {
    expect(validationError({ ...valid, username: "ab" })).toMatch(/3-20/);
    expect(validationError({ ...valid, username: "a".repeat(21) })).toMatch(/3-20/);
    expect(validationError({ ...valid, username: "has space" })).toMatch(/3-20/);
    expect(validationError({ ...valid, username: "hi;DROP" })).toMatch(/3-20/);
  });

  it("enforces a minimum password length", () => {
    expect(validationError({ ...valid, password: "short" })).toMatch(/8 characters/);
    expect(validationError({ ...valid, password: "12345678" })).toBeNull();
  });
});

describe("normalizers", () => {
  it("folds email case and surrounding whitespace", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("folds username case and surrounding whitespace", () => {
    expect(normalizeUsername("  MixedCase ")).toBe("mixedcase");
  });
});

describe("password hashing", () => {
  it("is deterministic for the same password, salt, and secret", async () => {
    const a = await hashPassword("correct horse", SALT);
    const b = await hashPassword("correct horse", SALT);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different hash per salt, so equal passwords do not collide", async () => {
    const a = await hashPassword("correct horse", SALT);
    const b = await hashPassword("correct horse", "ffffffffffffffffffffffffffffffff");
    expect(a).not.toBe(b);
  });

  it("never stores anything resembling the plaintext", async () => {
    const hash = await hashPassword("correct horse", SALT);
    expect(hash).not.toContain("correct");
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const user = storedUser(await hashPassword("correct horse", SALT));

    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: true, needsRehash: false });
    expect(await verifyPassword("wrong horse", user)).toMatchObject({ ok: false });
    expect(await verifyPassword("", user)).toMatchObject({ ok: false });
  });

  it("migrates an account hashed with the public local-dev secret, once", async () => {
    // Hash as if AUTH_SECRET had not been configured yet.
    delete process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = LOCAL_AUTH_SECRET;
    const legacyHash = await hashPassword("correct horse", SALT);

    process.env.AUTH_SECRET = "test-secret-alpha";
    const user = storedUser(legacyHash);

    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: true, needsRehash: true });
    expect(await verifyPassword("wrong horse", user)).toMatchObject({ ok: false });
  });

  it("locks every account out if the hashing secret changes", async () => {
    // Documents a real operational hazard rather than asserting desired behaviour:
    // the secret is a pepper mixed into every hash, and only the local-dev secret
    // has a migration path. Rotating it invalidates all stored passwords.
    // getAuthSecret() falls back to UPSTASH_REDIS_REST_TOKEN, so rotating that
    // database credential — an ordinary operation — would trigger exactly this.
    const user = storedUser(await hashPassword("correct horse", SALT));

    process.env.AUTH_SECRET = "test-secret-beta";
    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: false });
  });
});
