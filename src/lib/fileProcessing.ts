import imageCompression, { type Options as ImageCompressionOptions } from "browser-image-compression";

export async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Target: keep images under ~5MB to avoid IndexedDB/quota issues.
  // We set slightly under 5MB to leave headroom for base64 overhead.
  const options: ImageCompressionOptions = {
    maxSizeMB: 4.8,
    maxWidthOrHeight: 2400,
    useWebWorker: true,
    initialQuality: 0.8,
  };

  try {
    const compressed = await imageCompression(file, options);
    // Ensure we preserve original filename when possible
    if (compressed.name !== file.name) {
      return new File([compressed], file.name, {
        type: compressed.type || file.type,
        lastModified: Date.now(),
      });
    }
    return compressed;
  } catch {
    // If compression fails for any reason, fall back to original file.
    return file;
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
