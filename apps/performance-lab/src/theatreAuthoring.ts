import type { EnvironmentTuningV1 } from "@lyricstage/performance";
import { getProject, types, val } from "@theatre/core";
import studioImport from "@theatre/studio";

const PROJECT_ID = "LyricStage Performance Lab V1";
const SHEET_ID = "Environment";
const OBJECT_ID = "Global Atmosphere";

export interface TheatreAuthoringHandle {
  setPosition(timeMs: number): void;
  exportState(): void;
  toggleStudio(): boolean;
  dispose(): void;
}

// Theatre 0.7 ships Studio as CJS with an ESM-shaped `default`; Vite may preserve
// either layer in dev. Normalize both without weakening the production boundary.
const studioCandidate = studioImport as typeof studioImport & { default?: typeof studioImport };
const studio = typeof studioCandidate.initialize === "function"
  ? studioCandidate
  : studioCandidate.default!;

// This module itself is dynamically imported only behind import.meta.env.DEV.
// Keeping core + studio as static peers inside the module avoids duplicate Vite instances.
const studioReady = Promise.resolve(
  studio.initialize({ persistenceKey: "lyricstage:performance-lab:v1" }) as unknown as Promise<void> | void,
);

export const connectTheatreAuthoring = async (
  onValues: (values: EnvironmentTuningV1) => void,
): Promise<TheatreAuthoringHandle> => {
  await studioReady;
  const project = getProject(PROJECT_ID);
  const sheet = project.sheet(SHEET_ID);
  const atmosphere = sheet.object(OBJECT_ID, {
    intensity: types.number(0.72, { range: [0, 1], nudgeMultiplier: 0.01 }),
    bloom: types.number(0.66, { range: [0, 1], nudgeMultiplier: 0.01 }),
    drift: types.number(0.44, { range: [0, 1], nudgeMultiplier: 0.01 }),
    railOpacity: types.number(0.48, { range: [0, 1], nudgeMultiplier: 0.01 }),
  }, { reconfigure: true });
  await project.ready;
  const unsubscribe = atmosphere.onValuesChange((values) => onValues(values));
  studio.setSelection([atmosphere]);

  return {
    setPosition(timeMs: number) {
      const length = val(sheet.sequence.pointer.length);
      sheet.sequence.position = Math.min(Math.max(0, timeMs / 1000), Math.max(0, length));
    },
    exportState() {
      const json = studio.createContentOfSaveFile(PROJECT_ID);
      const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lyricstage-performance-lab.theatre-project-state.json";
      anchor.click();
      URL.revokeObjectURL(url);
    },
    toggleStudio() {
      if (studio.ui.isHidden) {
        studio.ui.restore();
        return true;
      }
      studio.ui.hide();
      return false;
    },
    dispose() {
      unsubscribe();
    },
  };
};
