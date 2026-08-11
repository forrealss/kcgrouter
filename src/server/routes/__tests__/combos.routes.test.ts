import { beforeAll, describe, expect, test } from "bun:test";
import { runMigrations } from "../../../db/migrations";
import {
  addMember,
  createCombo,
  deleteCombo,
  getMembersSortedByPriority,
} from "../../services/combo-engine.service";
import {
  addAccount,
  createProvider,
} from "../../services/provider-registry.service";
import { combosRoutes } from "../combos.routes";
import type { RouteHandler } from "../types";

let providerAccountId = "";

beforeAll(() => {
  runMigrations();

  const provider = createProvider({
    name: `ComboRouteTest-${Date.now()}`,
    transport: "openai",
    baseUrl: "https://example.invalid",
    prefix: `combo-route-${Date.now()}`,
  });
  providerAccountId = addAccount(provider.id, {
    label: "Route test account",
    apiKey: "sk_combo_route_test",
  }).id;
});

function deleteMember(comboId: string, memberId: string): Promise<Response> {
  const handler = combosRoutes["DELETE /api/combos/:id/members/:memberId"] as
    | RouteHandler
    | undefined;
  if (!handler) throw new Error("delete member route is not registered");

  return Promise.resolve(
    handler(
      new Request(
        `http://localhost/api/combos/${comboId}/members/${memberId}`,
        { method: "DELETE" },
      ),
      { id: comboId, memberId },
    ),
  );
}

describe("DELETE /api/combos/:id/members/:memberId", () => {
  test("removes a member and compacts the remaining priorities", async () => {
    const combo = createCombo(`RouteDelete-${Date.now()}`, "fallback");
    const first = addMember(combo.id, {
      providerAccountId,
      modelName: "first-model",
      priority: 0,
    });
    const second = addMember(combo.id, {
      providerAccountId,
      modelName: "second-model",
      priority: 1,
    });

    const response = await deleteMember(combo.id, first.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(getMembersSortedByPriority(combo.id)).toEqual([
      expect.objectContaining({ id: second.id, priority: 0 }),
    ]);
    deleteCombo(combo.id);
  });

  test("compacts priorities after removing a middle member", async () => {
    const combo = createCombo(`RouteMiddle-${Date.now()}`, "fallback");
    const first = addMember(combo.id, {
      providerAccountId,
      modelName: "first-model",
      priority: 0,
    });
    const middle = addMember(combo.id, {
      providerAccountId,
      modelName: "middle-model",
      priority: 1,
    });
    const last = addMember(combo.id, {
      providerAccountId,
      modelName: "last-model",
      priority: 2,
    });

    const response = await deleteMember(combo.id, middle.id);

    expect(response.status).toBe(200);
    expect(getMembersSortedByPriority(combo.id)).toEqual([
      expect.objectContaining({ id: first.id, priority: 0 }),
      expect.objectContaining({ id: last.id, priority: 1 }),
    ]);
    deleteCombo(combo.id);
  });

  test("rejects a member that belongs to another combo", async () => {
    const firstCombo = createCombo(`RouteOwnerA-${Date.now()}`, "fallback");
    const secondCombo = createCombo(`RouteOwnerB-${Date.now()}`, "fallback");
    const member = addMember(firstCombo.id, {
      providerAccountId,
      modelName: "owned-model",
      priority: 0,
    });

    const response = await deleteMember(secondCombo.id, member.id);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/member not found/);
    expect(getMembersSortedByPriority(firstCombo.id)).toHaveLength(1);
    deleteCombo(firstCombo.id);
    deleteCombo(secondCombo.id);
  });

  test("allows deleting the final member", async () => {
    const combo = createCombo(`RouteLast-${Date.now()}`, "fallback");
    const member = addMember(combo.id, {
      providerAccountId,
      modelName: "last-model",
      priority: 0,
    });

    const response = await deleteMember(combo.id, member.id);

    expect(response.status).toBe(200);
    expect(getMembersSortedByPriority(combo.id)).toHaveLength(0);
    deleteCombo(combo.id);
  });
});
