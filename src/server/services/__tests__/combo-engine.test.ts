import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  addMember,
  createCombo,
  deleteCombo,
  getCombo,
  getMembersSortedByPriority,
  listCombos,
  nextFallback,
  reorderMembers,
  resolveTarget,
} from "../combo-engine.service";
import { addAccount, createProvider } from "../provider-registry.service";
import * as QuotaTracker from "../quota-tracker.service";

let providerId: string;
let acc1: string;
let acc2: string;

function setupProvider() {
  const p = createProvider({
    name: `CT-${Date.now()}`,
    transport: "openai",
    baseUrl: "https://t.com",
    prefix: `ct-${Date.now()}`,
  });
  providerId = p.id;
  acc1 = addAccount(providerId, {
    label: "A1",
    apiKey: "sk1",
    quotaResetType: "daily",
    quotaLimitTokens: 1000,
  }).id;
  acc2 = addAccount(providerId, {
    label: "A2",
    apiKey: "sk2",
    quotaResetType: "daily",
    quotaLimitTokens: 1000,
  }).id;
}

describe("ComboEngine — CRUD", () => {
  beforeAll(() => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
    setupProvider();
  });

  afterAll(() => {});

  test("Property 20: new combo starts with cursor 0", () => {
    const c = createCombo(`P20-${Date.now()}`, "fallback");
    expect(c.roundRobinCursor).toBe(0);
    deleteCombo(c.id);
  });

  test("Property 21: duplicate combo name rejected", () => {
    const c1 = createCombo(`P21-${Date.now()}`, "fallback");
    expect(() => createCombo(c1.name, "round_robin")).toThrow(/already exists/);
    deleteCombo(c1.id);
  });

  test("Property 22: added member appears in sorted list", () => {
    const c = createCombo(`P22-${Date.now()}`, "fallback");
    const m = addMember(c.id, {
      providerAccountId: acc1,
      modelName: "gpt-4o",
      priority: 0,
    });
    expect(m.comboId).toBe(c.id);
    const members = getMembersSortedByPriority(c.id);
    expect(members.length).toBe(1);
    expect(members[0].id).toBe(m.id);
    deleteCombo(c.id);
  });

  test("Property 23: duplicate priority rejected", () => {
    const c = createCombo(`P23-${Date.now()}`, "fallback");
    addMember(c.id, { providerAccountId: acc1, modelName: "a", priority: 0 });
    expect(() =>
      addMember(c.id, { providerAccountId: acc2, modelName: "b", priority: 0 }),
    ).toThrow(/already used/);
    deleteCombo(c.id);
  });

  test("Property 24: reorder changes priorities", () => {
    const c = createCombo(`P24-${Date.now()}`, "fallback");
    const m1 = addMember(c.id, {
      providerAccountId: acc1,
      modelName: "a",
      priority: 0,
    });
    const m2 = addMember(c.id, {
      providerAccountId: acc2,
      modelName: "b",
      priority: 1,
    });
    reorderMembers(c.id, [m2.id, m1.id]);
    const members = getMembersSortedByPriority(c.id);
    expect(members[0].id).toBe(m2.id);
    expect(members[0].priority).toBe(0);
    expect(members[1].id).toBe(m1.id);
    expect(members[1].priority).toBe(1);
    deleteCombo(c.id);
  });

  test("addMember to non-existent combo throws", () => {
    expect(() =>
      addMember("combo_x", {
        providerAccountId: acc1,
        modelName: "x",
        priority: 0,
      }),
    ).toThrow(/not found/);
  });

  test("listCombos includes member count", () => {
    const c = createCombo(`LC-${Date.now()}`, "fallback");
    addMember(c.id, { providerAccountId: acc1, modelName: "a", priority: 0 });
    const list = listCombos();
    const found = list.find((x) => x.id === c.id);
    expect(found?.memberCount).toBe(1);
    deleteCombo(c.id);
  });
});

describe("ComboEngine — resolveTarget & nextFallback", () => {
  beforeAll(() => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
    setupProvider();
  });

  afterAll(() => {});

  test("Property 7a: fallback returns first available", () => {
    const c = createCombo(`R7a-${Date.now()}`, "fallback");
    const m1 = addMember(c.id, {
      providerAccountId: acc1,
      modelName: "a",
      priority: 0,
    });
    addMember(c.id, { providerAccountId: acc2, modelName: "b", priority: 1 });
    const target = resolveTarget(c.id);
    expect(target?.id).toBe(m1.id);
    deleteCombo(c.id);
  });

  test("Property 7b: fallback skips exhausted", () => {
    const c = createCombo(`R7b-${Date.now()}`, "fallback");
    addMember(c.id, { providerAccountId: acc1, modelName: "a", priority: 0 });
    const m2 = addMember(c.id, {
      providerAccountId: acc2,
      modelName: "b",
      priority: 1,
    });
    QuotaTracker.recordUsage(acc1, 1000);
    const target = resolveTarget(c.id);
    expect(target?.id).toBe(m2.id);
    deleteCombo(c.id);
  });

  test("Property 7c: fallback null when all exhausted", () => {
    const c = createCombo(`R7c-${Date.now()}`, "fallback");
    addMember(c.id, { providerAccountId: acc1, modelName: "a", priority: 0 });
    QuotaTracker.recordUsage(acc1, 1000);
    expect(resolveTarget(c.id)).toBeNull();
    deleteCombo(c.id);
  });

  test("Property 7d: round_robin advances cursor", () => {
    const c = createCombo(`R7d-${Date.now()}`, "round_robin");
    addMember(c.id, { providerAccountId: acc1, modelName: "a", priority: 0 });
    addMember(c.id, { providerAccountId: acc2, modelName: "b", priority: 1 });
    resolveTarget(c.id);
    const updated = getCombo(c.id);
    expect(updated?.roundRobinCursor).toBeGreaterThan(0);
    deleteCombo(c.id);
  });

  test("nextFallback skips excluded members", () => {
    const c = createCombo(`NF-${Date.now()}`, "fallback");
    const m1 = addMember(c.id, {
      providerAccountId: acc1,
      modelName: "a",
      priority: 0,
    });
    const m2 = addMember(c.id, {
      providerAccountId: acc2,
      modelName: "b",
      priority: 1,
    });
    const target = nextFallback(c.id, [m1.id]);
    expect(target?.id).toBe(m2.id);
    deleteCombo(c.id);
  });

  test("nextFallback null when all excluded", () => {
    const c = createCombo(`NFE-${Date.now()}`, "fallback");
    const m1 = addMember(c.id, {
      providerAccountId: acc1,
      modelName: "a",
      priority: 0,
    });
    expect(nextFallback(c.id, [m1.id])).toBeNull();
    deleteCombo(c.id);
  });

  test("resolveTarget throws for empty combo", () => {
    const c = createCombo(`Empty-${Date.now()}`, "fallback");
    expect(() => resolveTarget(c.id)).toThrow(/no members/);
    deleteCombo(c.id);
  });
});
