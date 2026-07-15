export const SCHEDULE_BRANCHES = ["高雄館", "台中館", "桃園館", "林口館"] as const;

export type ScheduleBranch = (typeof SCHEDULE_BRANCHES)[number];

export function hasAllScheduleBranches(branches: Iterable<string>) {
  const available = new Set(branches);
  return SCHEDULE_BRANCHES.every((branch) => available.has(branch));
}
