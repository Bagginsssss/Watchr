/**
 * Haptic feedback utility — works in Capacitor iOS/Android,
 * silently no-ops on web browsers.
 */

let Haptics = null;

try {
  // Dynamic import so this doesn't break web builds
  const mod = await import('@capacitor/haptics');
  Haptics = mod.Haptics;
} catch {}

export const ImpactStyle = {
  Light: 'LIGHT',
  Medium: 'MEDIUM',
  Heavy: 'HEAVY',
};

export async function haptic(style = ImpactStyle.Light) {
  try {
    if (Haptics) await Haptics.impact({ style });
  } catch {}
}

export async function hapticLight() {
  return haptic(ImpactStyle.Light);
}

export async function hapticMedium() {
  return haptic(ImpactStyle.Medium);
}

export async function hapticHeavy() {
  return haptic(ImpactStyle.Heavy);
}
