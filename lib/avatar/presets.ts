/**
 * Avatar preset configuration for the Sakhi avatar.
 *
 * The Sakhi avatar uses the original Ready Player Me model with ARKit + Oculus
 * viseme blend shapes for proper lip-sync animation. The preset system ensures
 * the correct model is loaded and provides metadata about the avatar's capabilities.
 */

export interface AvatarPreset {
  id: string;
  label: string;
  /** Same-origin model path served by this app (never an external URL). */
  modelUrl: string;
  description: string;
  license: string;
  selfHosted: true;
}

export const SAKHI_CLASSIC_PRESET: AvatarPreset = {
  id: "sakhi-classic",
  label: "Sakhi (classic)",
  modelUrl: "/assets/design/sakhi.glb",
  description:
    "Original Ready Player Me avatar (brunette, CC BY-NC 4.0), ARKit + Oculus visemes, self-hosted.",
  license: "CC BY-NC 4.0 (see code header in LiveSakhiAvatar.tsx)",
  selfHosted: true,
};

export const SAKHI_OFFICER_PRESET: AvatarPreset = {
  id: "sakhi-officer",
  label: "Officer Sakhi (Cyber Crime Unit)",
  modelUrl: "/assets/design/sakhi-officer.glb",
  description:
    "Professional Cybersecurity Police Officer uniform with peaked service cap, insignia, shoulder epaulettes, stars, badges, ARKit + Oculus visemes.",
  license: "CC BY-NC 4.0 + Cyber-Sakhi Police Assets",
  selfHosted: true,
};

export const SAKHI_AVATAR_PRESETS: AvatarPreset[] = [
  SAKHI_OFFICER_PRESET,
  SAKHI_CLASSIC_PRESET,
];

export const DEFAULT_AVATAR_ID = SAKHI_OFFICER_PRESET.id;

export function getAvatarPreset(id: string | null | undefined): {
  preset: AvatarPreset;
  fallback: boolean;
} {
  const found = SAKHI_AVATAR_PRESETS.find((p) => p.id === id);
  if (found) return { preset: found, fallback: false };
  const def = SAKHI_AVATAR_PRESETS.find((p) => p.id === DEFAULT_AVATAR_ID) || SAKHI_OFFICER_PRESET;
  return { preset: def, fallback: true };
}

export interface RigReport {
  morphTargetCount: number;
  visemeCount: number;
  hasJawOpen: boolean;
  hasEyeBlink: boolean;
  /** True when the TalkingHead pipeline can drive this rig directly. */
  pipelineCompatible: boolean;
}

/**
 * Pure rig inspection: summarize a head-mesh morphTargetDictionary
 * (name -> index) exactly as the avatar reports it after load. Used to
 * VERIFY the avatar's capabilities for lip-sync animation.
 */
export function summarizeRig(
  dictionary: Record<string, number> | null | undefined
): RigReport {
  const names = dictionary ? Object.keys(dictionary) : [];
  const visemeCount = names.filter((n) => n.startsWith("viseme_")).length;
  const hasJawOpen = names.includes("jawOpen");
  const hasEyeBlink =
    names.includes("eyeBlinkLeft") ||
    names.includes("eyeBlinkRight") ||
    names.includes("eyesClosed") ||
    names.includes("blink");
  return {
    morphTargetCount: names.length,
    visemeCount,
    hasJawOpen,
    hasEyeBlink,
    pipelineCompatible: visemeCount > 0 && hasJawOpen,
  };
}
