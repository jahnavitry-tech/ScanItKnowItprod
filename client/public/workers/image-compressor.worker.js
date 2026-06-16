/* image-compressor.worker.js
 * Runs in a Worker thread — no DOM access, but OffscreenCanvas is available.
 * Receives: { imageBitmap: ImageBitmap, maxDim: number, quality: number }
 * Sends back: { arrayBuffer: ArrayBuffer } (transferable, zero-copy)
 */
self.onmessage = async function (e) {
  const { imageBitmap, maxDim, quality } = e.data;

  let { width, height } = imageBitmap;

  // Resize only if either dimension exceeds maxDim
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close(); // Release the bitmap immediately

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const arrayBuffer = await blob.arrayBuffer();

  // Transfer the buffer (zero-copy) back to the main thread
  self.postMessage({ arrayBuffer }, [arrayBuffer]);
};
