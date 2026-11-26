self.addEventListener('message', async ({ data: file }) => {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const tooLarge = Math.max(bitmap.width, bitmap.height) > 12000 || bitmap.width * bitmap.height > 36000000;
      bitmap.close();
      if (tooLarge) {
        self.postMessage({ error: 'The screenshot is too large. Crop it to the part you want reviewed.' });
        return;
      }
    }
    const dataUrl = new FileReaderSync().readAsDataURL(file);
    self.postMessage({ dataUrl });
  } catch {
    self.postMessage({ error: 'This image could not be opened. Try another PNG, JPEG, or WebP screenshot.' });
  }
});
