import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const GRAFT_PORTS = {
  GATEWAY_A_WS: 8085,
  GATEWAY_A_HTTP: 8086,
  GATEWAY_B_WS: 8090,
  GATEWAY_B_HTTP: 8091,
};

let isConfigured = false;

/**
 * Configure Graftcode client runtime bridge to connect to local gateways.
 */
export async function configureGraftcode() {
  if (isConfigured) return;

  try {
    const { GraftConfig } = await import('@graft/npm-speech-gateway');
    GraftConfig.host = `ws://localhost:${GRAFT_PORTS.GATEWAY_A_WS}/ws`;
    GraftConfig.stateless = true;
    isConfigured = true;
    logger.info(`Graftcode client configured for Gateway A on port ${GRAFT_PORTS.GATEWAY_A_WS}`);
  } catch (err) {
    logger.error(`Failed to configure Graftcode client adapter: ${err.message}`);
    throw err;
  }
}
