import imageCompression, { type Options as ImageCompressionOptions } from "browser-image-compression";

// Runtime check for Tauri environment
export const isTauri = (): boolean => "__TAURI__" in window;

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

/**
 * Save a file for attachment storage.
 * - Tauri: Writes to filesystem, returns { filePath }
 * - Web: Converts to base64, returns { data }
 */
export async function saveAttachmentFile(
  file: File,
  jobId: string
): Promise<{ data?: string; filePath?: string }> {
  if (isTauri()) {
    try {
      // Dynamic import of Tauri APIs
      const { writeBinaryFile, createDir, BaseDirectory } = await import("@tauri-apps/api/fs");
      const { appDataDir, join } = await import("@tauri-apps/api/path");

      const baseDir = await appDataDir();
      const jobDir = await join(baseDir, "attachments", jobId);
      
      // Create directory if it doesn't exist
      await createDir(jobDir, { recursive: true });

      // Read file as array buffer and write to filesystem
      const arrayBuffer = await file.arrayBuffer();
      const filePath = await join(jobDir, file.name);
      
      await writeBinaryFile(filePath, new Uint8Array(arrayBuffer));

      return { filePath };
    } catch (error) {
      console.error("Tauri file write failed, falling back to base64:", error);
      // Fallback to base64 if Tauri APIs fail
      const data = await fileToDataUrl(file);
      return { data };
    }
  } else {
    // Web: use base64
    const data = await fileToDataUrl(file);
    return { data };
  }
}

/**
 * Get the display URL for an attachment.
 * - Tauri: Uses convertFileSrc for local file protocol
 * - Web: Returns the base64 data URL directly
 */
export async function getAttachmentUrl(attachment: { data?: string; filePath?: string }): Promise<string> {
  if (attachment.data) {
    return attachment.data;
  }
  
  if (attachment.filePath && isTauri()) {
    try {
      const { convertFileSrc } = await import("@tauri-apps/api/tauri");
      return convertFileSrc(attachment.filePath);
    } catch (error) {
      console.error("Failed to convert file path:", error);
      return "";
    }
  }
  
  return "";
}

/**
 * Delete an attachment file from the filesystem (Tauri only).
 * For web, the base64 data is removed when the DB record is deleted.
 */
export async function deleteAttachmentFile(filePath?: string): Promise<void> {
  if (!filePath || !isTauri()) return;
  
  try {
    const { removeFile } = await import("@tauri-apps/api/fs");
    await removeFile(filePath);
  } catch (error) {
    console.error("Failed to delete attachment file:", error);
  }
}
