// AudioWorklet processor streaming raw PCM samples from the mic
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      // Send raw Float32Array PCM samples to the renderer thread
      this.port.postMessage(input[0]);
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);

