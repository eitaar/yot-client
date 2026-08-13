import { getJSON } from '@/api/client';
import { buildDefaultSpec } from '@/plugins/defaultSpec';
import { TrackingPluginSpecSchema, type TrackingPluginSpec } from '@/plugins/spec';

/**
 * Fetch the tracking spec from yot-server (`GET /api/plugins/tracking`), validate
 * it, and fall back to the bundled default on any failure (offline, bad payload,
 * unauthenticated). `now` anchors the demo data when the default is used.
 */
export async function loadTrackingSpec(now: Date = new Date()): Promise<TrackingPluginSpec> {
  try {
    const raw = await getJSON('/plugins/tracking');
    return TrackingPluginSpecSchema.parse(raw);
  } catch {
    return buildDefaultSpec(now);
  }
}
