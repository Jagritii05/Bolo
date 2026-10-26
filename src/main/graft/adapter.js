import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const GRAFT_PORTS = {
  GATEWAY_A_WS: 8085,
  GATEWAY_A_HTTP: 8086,
  GATEWAY_B_WS: 8095,
  GATEWAY_B_HTTP: 8096,
};

let isSpeechConfigured = false;
let isTextConfigured = false;

/**
 * Configure Graftcode client for Speech Gateway (Gateway A).
 */
export async function configureGraftcode() {
  if (isSpeechConfigured) return;

  try {
    const { GraftConfig } = await import('@graft/npm-speech-gateway');
    GraftConfig.host = `ws://localhost:${GRAFT_PORTS.GATEWAY_A_WS}/ws`;
    GraftConfig.stateless = true;
    isSpeechConfigured = true;
    logger.info(`Graftcode client configured for Gateway A on port ${GRAFT_PORTS.GATEWAY_A_WS}`);
  } catch (err) {
    logger.error(`Failed to configure Graftcode Speech client adapter: ${err.message}`);
    throw err;
  }
}

/**
 * Configure Graftcode client for Text Pipeline Gateway (Gateway B).
 */
export async function configureGraftTextGateway() {
  if (isTextConfigured) return;

  try {
    const { GraftConfig } = await import('@graft/npm-text-gateway');
    GraftConfig.host = `ws://localhost:${GRAFT_PORTS.GATEWAY_B_WS}/ws`;
    GraftConfig.stateless = true;
    isTextConfigured = true;
    logger.info(`Graftcode client configured for Gateway B on port ${GRAFT_PORTS.GATEWAY_B_WS}`);
  } catch (err) {
    logger.error(`Failed to configure Graftcode Text client adapter: ${err.message}`);
    throw err;
  }
}
