export interface Combo {
  id: string;
  name: string;
  strategy: "fallback" | "round_robin";
  roundRobinCursor: number;
  createdAt: string;
  memberCount: number;
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
