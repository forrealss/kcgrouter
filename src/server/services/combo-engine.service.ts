import { randomBytes } from "node:crypto";
import { get, getDb, query, run } from "../../db/client";
import type { ComboMemberRow, ComboRow, ComboStrategy } from "../../db/schema";
import * as QuotaTracker from "./quota-tracker.service";

export interface Combo {
  id: string;
  name: string;
  strategy: ComboStrategy;
  roundRobinCursor: number;
  createdAt: string;
}

export interface ComboMember {
  id: string;
  comboId: string;
  providerAccountId: string;
  modelName: string;
  priority: number;
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function rowToCombo(row: ComboRow): Combo {
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    roundRobinCursor: row.round_robin_cursor,
    createdAt: row.created_at,
  };
}

function rowToMember(row: ComboMemberRow): ComboMember {
  return {
    id: row.id,
    comboId: row.combo_id,
    providerAccountId: row.provider_account_id,
    modelName: row.model_name,
    priority: row.priority,
    inputCostPer1M: row.input_cost_per_1m,
    outputCostPer1M: row.output_cost_per_1m,
  };
}

// --- Combo CRUD ---

export function createCombo(name: string, strategy: ComboStrategy): Combo {
  if (!name || name.trim().length === 0)
    throw new Error("Combo name is required");
  if (!["fallback", "round_robin"].includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}`);
  }

  const existing = get<ComboRow>(
    "SELECT id FROM combos WHERE name = ?",
    name.trim(),
  );
  if (existing) throw new Error(`Combo name "${name}" already exists`);

  const id = generateId("combo");
  const now = new Date().toISOString();

  run(
    "INSERT INTO combos (id, name, strategy, round_robin_cursor, created_at) VALUES (?, ?, ?, 0, ?)",
    id,
    name.trim(),
    strategy,
    now,
  );

  return {
    id,
    name: name.trim(),
    strategy,
    roundRobinCursor: 0,
    createdAt: now,
  };
}

/**
 * Look up a combo by id (CRUD paths) or by unique name (router selectors:
 * an unprefixed model string like `prod-primary` resolves to the combo).
 * Id wins if the string happens to match both.
 */
export function getCombo(idOrName: string): Combo | null {
  const row = get<ComboRow>("SELECT * FROM combos WHERE id = ?", idOrName);
  if (row) return rowToCombo(row);
  const byName = get<ComboRow>("SELECT * FROM combos WHERE name = ?", idOrName);
  if (!byName) return null;
  return rowToCombo(byName);
}

export function listCombos(): (Combo & { memberCount: number })[] {
  const rows = query<ComboRow & { member_count: number }>(
    `SELECT c.*, COUNT(cm.id) as member_count
     FROM combos c
     LEFT JOIN combo_members cm ON cm.combo_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    strategy: r.strategy,
    roundRobinCursor: r.round_robin_cursor,
    createdAt: r.created_at,
    memberCount: r.member_count,
  }));
}

export function deleteCombo(id: string): void {
  const existing = get<ComboRow>("SELECT id FROM combos WHERE id = ?", id);
  if (!existing) throw new Error("Combo not found");
  run("DELETE FROM combos WHERE id = ?", id);
}

// --- Combo Member CRUD ---

export function addMember(
  comboId: string,
  member: {
    providerAccountId: string;
    modelName: string;
    priority: number;
    inputCostPer1M?: number;
    outputCostPer1M?: number;
  },
): ComboMember {
  const combo = getCombo(comboId);
  if (!combo) throw new Error("Combo not found");

  if (!member.modelName || member.modelName.trim().length === 0)
    throw new Error("Model name is required");

  // Check priority uniqueness
  const existingPriority = get<ComboMemberRow>(
    "SELECT id FROM combo_members WHERE combo_id = ? AND priority = ?",
    comboId,
    member.priority,
  );
  if (existingPriority)
    throw new Error(
      `Priority ${member.priority} is already used in this combo`,
    );

  const id = generateId("cmbm");

  run(
    `INSERT INTO combo_members (id, combo_id, provider_account_id, model_name, priority, input_cost_per_1m, output_cost_per_1m)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    comboId,
    member.providerAccountId,
    member.modelName.trim(),
    member.priority,
    member.inputCostPer1M ?? null,
    member.outputCostPer1M ?? null,
  );

  return {
    id,
    comboId,
    providerAccountId: member.providerAccountId,
    modelName: member.modelName.trim(),
    priority: member.priority,
    inputCostPer1M: member.inputCostPer1M ?? null,
    outputCostPer1M: member.outputCostPer1M ?? null,
  };
}

export function getMembersSortedByPriority(comboId: string): ComboMember[] {
  const rows = query<ComboMemberRow>(
    "SELECT * FROM combo_members WHERE combo_id = ? ORDER BY priority ASC",
    comboId,
  );
  return rows.map(rowToMember);
}

export function reorderMembers(
  comboId: string,
  orderedMemberIds: string[],
): void {
  const combo = getCombo(comboId);
  if (!combo) throw new Error("Combo not found");

  orderedMemberIds.forEach((id, i) => {
    run(
      "UPDATE combo_members SET priority = ? WHERE id = ? AND combo_id = ?",
      i,
      id,
      comboId,
    );
  });
}

export function removeMember(memberId: string): void {
  const remove = getDb().transaction(() => {
    const existing = get<ComboMemberRow>(
      "SELECT * FROM combo_members WHERE id = ?",
      memberId,
    );
    if (!existing) throw new Error("Combo member not found");

    run("DELETE FROM combo_members WHERE id = ?", memberId);
    run(
      "UPDATE combo_members SET priority = priority - 1 WHERE combo_id = ? AND priority > ?",
      existing.combo_id,
      existing.priority,
    );
  });

  remove.immediate();
}

// --- Resolution ---

export function resolveTarget(comboId: string): ComboMember | null {
  const combo = getCombo(comboId);
  if (!combo) throw new Error("Combo not found");

  const members = getMembersSortedByPriority(comboId);
  if (members.length === 0) throw new Error("Combo has no members");

  if (combo.strategy === "fallback") {
    for (const member of members) {
      if (QuotaTracker.isAvailable(member.providerAccountId)) {
        return member;
      }
    }
    return null;
  }

  // round_robin
  const n = members.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (combo.roundRobinCursor + offset) % n;
    const candidate = members[idx];
    if (!candidate) continue;
    if (QuotaTracker.isAvailable(candidate.providerAccountId)) {
      run(
        "UPDATE combos SET round_robin_cursor = ? WHERE id = ?",
        idx,
        comboId,
      );
      return candidate;
    }
  }
  return null;
}

export function nextFallback(
  comboId: string,
  excludedMemberIds: string[],
): ComboMember | null {
  const combo = getCombo(comboId);
  if (!combo) throw new Error("Combo not found");

  const members = getMembersSortedByPriority(comboId);
  if (members.length === 0) return null;

  if (combo.strategy === "fallback") {
    for (const member of members) {
      if (excludedMemberIds.includes(member.id)) continue;
      if (QuotaTracker.isAvailable(member.providerAccountId)) {
        return member;
      }
    }
    return null;
  }

  // round_robin: continue from cursor, skipping excluded
  const n = members.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (combo.roundRobinCursor + offset) % n;
    const candidate = members[idx];
    if (!candidate) continue;
    if (excludedMemberIds.includes(candidate.id)) continue;
    if (QuotaTracker.isAvailable(candidate.providerAccountId)) {
      run(
        "UPDATE combos SET round_robin_cursor = ? WHERE id = ?",
        idx,
        comboId,
      );
      return candidate;
    }
  }
  return null;
}
