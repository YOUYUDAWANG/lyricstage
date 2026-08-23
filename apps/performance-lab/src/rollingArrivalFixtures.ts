export interface RollingArrivalFixtureV1 {
  id: "pack-at-5s" | "pack-at-25s" | "late-pack";
  label: string;
  arrivalMs: number;
  intendedBoundaryMs: number;
}

// Provider-free wall-clock fixtures for inspecting legal Stage handoff behavior.
export const rollingArrivalFixturesV1: readonly RollingArrivalFixtureV1[] = [
  { id: "pack-at-5s", label: "Scene Pack arrives at 5s", arrivalMs: 5_000, intendedBoundaryMs: 5_000 },
  { id: "pack-at-25s", label: "Scene Pack arrives at 25s", arrivalMs: 25_000, intendedBoundaryMs: 25_000 },
  { id: "late-pack", label: "Late Scene Pack", arrivalMs: 32_000, intendedBoundaryMs: 25_000 },
] as const;
