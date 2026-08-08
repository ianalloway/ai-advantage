import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_AUTH_SECRET,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  getPreviousAuthSecrets,
  validationError,
  verifyPassword,
} from "../auth";

const SALT = "0123456789abcdef0123456789abcdef";
const ENV_KEYS = ["AUTH_SECRET", "AUTH_SECRET_PREVIOUS", "UPSTASH_REDIS_REST_TOKEN"] as const;
const originalEnv: Record<string, string | undefined> = {};

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
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.AUTH_SECRET = "test-secret-alpha";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
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

  it("still accepts a password hashed under a superseded secret", async () => {
    // Rotating the pepper used to invalidate every stored hash permanently.
    // Naming the old secret in AUTH_SECRET_PREVIOUS keeps those logins working
    // and flags them for re-hashing.
    const user = storedUser(await hashPassword("correct horse", SALT));

    process.env.AUTH_SECRET = "test-secret-beta";
    process.env.AUTH_SECRET_PREVIOUS = "test-secret-alpha";

    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: true, needsRehash: true });
    expect(await verifyPassword("wrong horse", user)).toMatchObject({ ok: false });
  });

  it("rescues accounts hashed while the Upstash token was standing in as the pepper", async () => {
    process.env.AUTH_SECRET = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-value";
    const user = storedUser(await hashPassword("correct horse", SALT));

    // Operator sets a dedicated secret; the borrowed token is still accepted.
    process.env.AUTH_SECRET = "test-secret-beta";
    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: true, needsRehash: true });
  });

  it("still rejects a rotation with no record of the old secret", async () => {
    const user = storedUser(await hashPassword("correct horse", SALT));

    process.env.AUTH_SECRET = "test-secret-beta";
    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: false });
  });

  it("accepts several superseded secrets and caps how many it will try", async () => {
    const user = storedUser(await hashPassword("correct horse", SALT));

    process.env.AUTH_SECRET = "test-secret-beta";
    process.env.AUTH_SECRET_PREVIOUS = " older-one , test-secret-alpha ,, another ";
    expect(await verifyPassword("correct horse", user)).toMatchObject({ ok: true, needsRehash: true });

    expect(getPreviousAuthSecrets().length).toBeLessThanOrEqual(4);
    expect(getPreviousAuthSecrets()).not.toContain("test-secret-beta");
  });
});
