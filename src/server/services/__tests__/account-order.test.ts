import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  addAccount,
  createProvider,
  deleteProvider,
  isAccountAvailable,
  listAccounts,
  recordAccountError,
  recordAccountSuccess,
  removeAccount,
  reorderAccounts,
  updateAccount,
} from "../provider-registry.service";
import * as QuotaTracker from "../quota-tracker.service";

function makeProvider(tag: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return createProvider({
    name: `AccountOrder-${tag}-${suffix}`,
    transport: "openai",
    baseUrl: "https://example.invalid",
    prefix: `acctord${tag}${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
  });
}

function labelsInOrder(providerId: string): string[] {
  return listAccounts(providerId).map((a) => a.label);
}

describe("Provider account enable/disable and ordering", () => {
  beforeAll(() => {
    runMigrations();
    if (!get("SELECT * FROM app_settings WHERE id = 1")) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  describe("defaults", () => {
    test("a new account is enabled and appended to the end of the order", () => {
      const provider = makeProvider("defaults");
      const first = addAccount(provider.id, { label: "first", apiKey: "sk_1" });
      const second = addAccount(provider.id, {
        label: "second",
        apiKey: "sk_2",
      });

      expect(first.enabled).toBe(true);
      expect(first.sortOrder).toBe(0);
      expect(second.sortOrder).toBe(1);
      // Insertion order, not newest-first — the first created serves first.
      expect(labelsInOrder(provider.id)).toEqual(["first", "second"]);

      deleteProvider(provider.id);
    });

    test("an enabled, healthy account is available", () => {
      const provider = makeProvider("avail");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      expect(isAccountAvailable(account)).toBe(true);
      expect(QuotaTracker.isAvailable(account.id)).toBe(true);

      deleteProvider(provider.id);
    });
  });

  describe("disabling", () => {
    test("a disabled account is skipped by prefix routing", () => {
      const provider = makeProvider("prefix");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      const updated = updateAccount(account.id, { enabled: false });

      expect(updated.enabled).toBe(false);
      // isAccountAvailable is what handlePrefixRoute filters on.
      expect(isAccountAvailable(updated)).toBe(false);

      deleteProvider(provider.id);
    });

    test("a disabled account is skipped by combo resolution", () => {
      const provider = makeProvider("combo");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      updateAccount(account.id, { enabled: false });

      // Combo resolution consults only QuotaTracker.isAvailable, so the flag
      // has to be honoured there too or combos would bypass the switch.
      expect(QuotaTracker.isAvailable(account.id)).toBe(false);

      deleteProvider(provider.id);
    });

    test("re-enabling restores availability", () => {
      const provider = makeProvider("reenable");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      updateAccount(account.id, { enabled: false });
      const back = updateAccount(account.id, { enabled: true });

      expect(back.enabled).toBe(true);
      expect(isAccountAvailable(back)).toBe(true);
      expect(QuotaTracker.isAvailable(account.id)).toBe(true);

      deleteProvider(provider.id);
    });

    test("re-enabling does not clear a real upstream error", () => {
      const provider = makeProvider("keepserror");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      recordAccountError(account.id, "boom", "server_error");
      updateAccount(account.id, { enabled: false });
      const back = updateAccount(account.id, { enabled: true });

      // Switching a connection back on must not double as an error reset —
      // the cooldown and message stay until the account genuinely recovers.
      expect(back.status).toBe("error");
      expect(back.lastError).toBe("boom");
      expect(back.cooldownUntil).not.toBeNull();
      expect(isAccountAvailable(back)).toBe(false);

      deleteProvider(provider.id);
    });

    test("disabling survives a recorded success", () => {
      const provider = makeProvider("survive");
      const account = addAccount(provider.id, { label: "a", apiKey: "sk" });

      updateAccount(account.id, { enabled: false });
      // recordAccountSuccess resets `status` to active; the manual switch lives
      // in its own column precisely so that cannot silently re-enable it.
      recordAccountSuccess(account.id);

      const after = listAccounts(provider.id)[0];
      expect(after?.status).toBe("active");
      expect(after?.enabled).toBe(false);
      expect(after && isAccountAvailable(after)).toBe(false);

      deleteProvider(provider.id);
    });

    test("toggling does not touch the label or quota", () => {
      const provider = makeProvider("isolate");
      const account = addAccount(provider.id, {
        label: "keep-me",
        apiKey: "sk",
        quotaLimitTokens: 5000,
      });

      const updated = updateAccount(account.id, { enabled: false });

      expect(updated.label).toBe("keep-me");
      expect(updated.quotaLimitTokens).toBe(5000);

      deleteProvider(provider.id);
    });
  });

  describe("reordering", () => {
    test("reorderAccounts sets the failover order", () => {
      const provider = makeProvider("reorder");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      const b = addAccount(provider.id, { label: "b", apiKey: "sk_b" });
      const c = addAccount(provider.id, { label: "c", apiKey: "sk_c" });

      reorderAccounts(provider.id, [c.id, a.id, b.id]);

      expect(labelsInOrder(provider.id)).toEqual(["c", "a", "b"]);
      expect(listAccounts(provider.id).map((x) => x.sortOrder)).toEqual([
        0, 1, 2,
      ]);

      deleteProvider(provider.id);
    });

    test("rejects an id from another provider", () => {
      const provider = makeProvider("scopea");
      const other = makeProvider("scopeb");
      const mine = addAccount(provider.id, { label: "mine", apiKey: "sk" });
      const theirs = addAccount(other.id, { label: "theirs", apiKey: "sk" });

      expect(() => reorderAccounts(provider.id, [theirs.id, mine.id])).toThrow(
        /do not belong/,
      );

      deleteProvider(provider.id);
      deleteProvider(other.id);
    });

    test("rejects a partial list", () => {
      const provider = makeProvider("partial");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      addAccount(provider.id, { label: "b", apiKey: "sk_b" });

      // A partial list would leave the omitted row sharing a position with a
      // reordered one, making the failover order ambiguous.
      expect(() => reorderAccounts(provider.id, [a.id])).toThrow(
        /Expected all/,
      );

      deleteProvider(provider.id);
    });

    test("rejects duplicate ids", () => {
      const provider = makeProvider("dupe");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      addAccount(provider.id, { label: "b", apiKey: "sk_b" });

      expect(() => reorderAccounts(provider.id, [a.id, a.id])).toThrow(
        /Duplicate/,
      );

      deleteProvider(provider.id);
    });

    test("throws for an unknown provider", () => {
      expect(() => reorderAccounts("prov_missing", [])).toThrow(
        /Provider not found/,
      );
    });

    test("order is unaffected by disabling", () => {
      const provider = makeProvider("orderkeep");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      const b = addAccount(provider.id, { label: "b", apiKey: "sk_b" });

      reorderAccounts(provider.id, [b.id, a.id]);
      updateAccount(b.id, { enabled: false });

      // A disabled connection keeps its slot; it is skipped at routing time
      // rather than pushed down the list.
      expect(labelsInOrder(provider.id)).toEqual(["b", "a"]);

      deleteProvider(provider.id);
    });
  });

  describe("deletion", () => {
    test("removing an account closes the gap in the order", () => {
      const provider = makeProvider("gap");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      const b = addAccount(provider.id, { label: "b", apiKey: "sk_b" });
      const c = addAccount(provider.id, { label: "c", apiKey: "sk_c" });

      removeAccount(b.id);

      const after = listAccounts(provider.id);
      expect(after.map((x) => x.label)).toEqual(["a", "c"]);
      // Dense 0..n-1, so a later reorder cannot collide with a stale position.
      expect(after.map((x) => x.sortOrder)).toEqual([0, 1]);
      expect(a.id).not.toBe(c.id);

      deleteProvider(provider.id);
    });

    test("a newly added account lands after the compacted rows", () => {
      const provider = makeProvider("append");
      const a = addAccount(provider.id, { label: "a", apiKey: "sk_a" });
      const b = addAccount(provider.id, { label: "b", apiKey: "sk_b" });
      removeAccount(a.id);

      const c = addAccount(provider.id, { label: "c", apiKey: "sk_c" });

      expect(c.sortOrder).toBe(1);
      expect(labelsInOrder(provider.id)).toEqual(["b", "c"]);
      expect(b.sortOrder).toBe(1);

      deleteProvider(provider.id);
    });
  });
});
