import { desktopCapturer, screen } from '../../main/electron-bridge.js';

// Capture the display where the cursor is currently located
export async function captureActiveScreen() {
  if (!desktopCapturer || !screen) {
    throw new Error('Screen capture requires Electron desktopCapturer environment.');
  }

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { width, height } = display.size;
  const scale = display.scaleFactor || 1;

  const maxW = 1280;
  const w = Math.min(Math.round(width * scale), maxW);
  const h = Math.round((w / (width * scale)) * height * scale);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: w, height: h },
  });

  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Screen capture failed: empty thumbnail.');
  }

  return {
    mimeType: 'image/jpeg',
    base64: source.thumbnail.toJPEG(75).toString('base64'),
    timestamp: Date.now(),
  };
}

