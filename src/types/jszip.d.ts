declare module "jszip" {
  interface JSZipObject {
    name: string;
    dir: boolean;
    date: Date;
    comment: string;
    unixPermissions: number | null;
    dosPermissions: number | null;
    async<T extends "string" | "text" | "base64" | "uint8array" | "arraybuffer" | "blob" | "nodebuffer">(
      type: T
    ): Promise<T extends "string" | "text" | "base64" ? string : T extends "uint8array" ? Uint8Array : T extends "arraybuffer" ? ArrayBuffer : T extends "blob" ? Blob : Buffer>;
  }

  interface JSZipGeneratorOptions {
    type?: "string" | "base64" | "uint8array" | "arraybuffer" | "blob" | "nodebuffer";
    compression?: "STORE" | "DEFLATE";
    compressionOptions?: { level: number };
    comment?: string;
    mimeType?: string;
    encodeFileName?: (filename: string) => string;
    streamFiles?: boolean;
    platform?: "DOS" | "UNIX";
  }

  class JSZip {
    files: { [key: string]: JSZipObject };
    file(name: string): JSZipObject | null;
    file(name: string, data: string | ArrayBuffer | Uint8Array | Blob | Promise<string | ArrayBuffer | Uint8Array | Blob>, options?: { binary?: boolean; base64?: boolean; date?: Date; compression?: string; compressionOptions?: { level: number }; comment?: string; optimizedBinaryString?: boolean; createFolders?: boolean; unixPermissions?: number; dosPermissions?: number; dir?: boolean }): this;
    folder(name: string): JSZip | null;
    forEach(callback: (relativePath: string, file: JSZipObject) => void): void;
    filter(predicate: (relativePath: string, file: JSZipObject) => boolean): JSZipObject[];
    remove(name: string): this;
    generateAsync<T extends "string" | "base64" | "uint8array" | "arraybuffer" | "blob" | "nodebuffer">(
      options: JSZipGeneratorOptions & { type: T }
    ): Promise<T extends "string" | "base64" ? string : T extends "uint8array" ? Uint8Array : T extends "arraybuffer" ? ArrayBuffer : T extends "blob" ? Blob : Buffer>;
    generateAsync(options?: JSZipGeneratorOptions): Promise<Blob>;
    loadAsync(data: string | ArrayBuffer | Uint8Array | Blob, options?: { optimizedBinaryString?: boolean; base64?: boolean; checkCRC32?: boolean; decodeFileName?: (filename: Uint8Array) => string }): Promise<JSZip>;
  }

  export default JSZip;
}
