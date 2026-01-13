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

/**
 * Save a file for attachment storage.
 * Writes to Tauri filesystem and returns { filePath, size }.
 * This is a desktop-only app - attachments are stored on the local filesystem.
 */
export async function saveAttachmentFile(
  file: File,
  jobId: string
): Promise<{ filePath: string; size: number }> {
  if (!isTauri()) {
    throw new Error("Attachments require Tauri desktop environment");
  }

  // Dynamic import of Tauri APIs
  const { writeBinaryFile, createDir } = await import("@tauri-apps/api/fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");

  const baseDir = await appDataDir();
  const jobDir = await join(baseDir, "attachments", jobId);

  // Create directory if it doesn't exist
  await createDir(jobDir, { recursive: true });

  // Generate unique filename to avoid collisions
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uniqueName = `${timestamp}_${safeName}`;
  const filePath = await join(jobDir, uniqueName);

  // IMPORTANT (Tauri): avoid IPC payload limits by writing in chunks.
  // Tauri IPC can error around ~5MB when passing large payloads.
  const chunkSize = 1024 * 1024 * 2; // 2MB chunks (safe under typical IPC limits)
  let offset = 0;
  let first = true;

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = await file.slice(offset, end).arrayBuffer();

    await writeBinaryFile(filePath, new Uint8Array(chunk), {
      append: !first,
    });

    first = false;
    offset = end;
  }

  return { filePath, size: file.size };
}

/**
 * Get the display URL for an attachment.
 * Uses Tauri's convertFileSrc for local file protocol.
 */
export async function getAttachmentUrl(filePath: string): Promise<string> {
  if (!filePath) return "";
  
  if (!isTauri()) {
    console.warn("getAttachmentUrl: Not in Tauri environment");
    return "";
  }

  try {
    const { convertFileSrc } = await import("@tauri-apps/api/tauri");
    return convertFileSrc(filePath);
  } catch (error) {
    console.error("Failed to convert file path:", error);
    return "";
  }
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
