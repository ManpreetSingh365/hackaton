/**
 * Audio Worklet Processor
 * Converts microphone audio to 16-bit PCM format for backend
 */

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const audioData = input[0]; // Mono channel
    const frameLength = audioData.length;

    // Convert float32 to 16-bit PCM
    const pcmBuffer = new ArrayBuffer(frameLength * 2);
    const pcmView = new DataView(pcmBuffer);

    for (let i = 0; i < frameLength; i++) {
      // Clamp to [-1, 1] and convert to int16
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      pcmView.setInt16(i * 2, int16, true); // Little-endian
    }

    // Create header: sampleRate(4) + channels(2) + reserved(2) + frameLength(4)
    const header = new ArrayBuffer(12);
    const headerView = new DataView(header);
    headerView.setUint32(0, sampleRate, true);
    headerView.setUint16(4, 1, true); // Mono
    headerView.setUint16(6, 0, true); // Reserved
    headerView.setUint32(8, frameLength, true);

    // Combine header + PCM data
    const output = new ArrayBuffer(12 + pcmBuffer.byteLength);
    new Uint8Array(output).set(new Uint8Array(header), 0);
    new Uint8Array(output).set(new Uint8Array(pcmBuffer), 12);

    // Send to popup
    this.port.postMessage(output, [output]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
