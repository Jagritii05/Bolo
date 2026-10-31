import electronPkg from 'electron';
const { desktopCapturer, screen } = electronPkg || {};

// Capture the display the mouse is on, as a JPEG for Gemini
export async function captureActiveScreen() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { width, height } = display.size;
  const scale = display.scaleFactor || 1;

  // Cap the size so uploads stay small
  const maxW = 1920;
  const w = Math.min(Math.round(width * scale), maxW);
  const h = Math.round((w / (width * scale)) * height * scale);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: w, height: h },
  });

  const source =
    sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Screen capture failed.');
  }

  return {
    mimeType: 'image/jpeg',
    base64: source.thumbnail.toJPEG(80).toString('base64'),
  };
}
