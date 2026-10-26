import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

/**
 * Scans the OS temporary directory for any orphaned LocalPill audio recordings and cleans them up.
 */
export function cleanOrphanedTempAudio(maxAgeMs = 5 * 60 * 1000) {
  try {
    const tmpDir = os.tmpdir();
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (file.startsWith('lp_audio_') || file.startsWith('localpill_') || file.startsWith('lp_rec_')) {
        const fullPath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs || maxAgeMs === 0) {
            fs.unlinkSync(fullPath);
            cleanedCount += 1;
          }
        } catch (_) {}
      }
    }

    if (cleanedCount > 0) {
      logger.info(`[TempCleaner] Cleaned ${cleanedCount} orphaned temporary audio file(s) from ${tmpDir}.`);
    }
    return cleanedCount;
  } catch (err) {
    logger.warn(`[TempCleaner] Temp cleanup warning: ${err.message}`);
    return 0;
  }
}
