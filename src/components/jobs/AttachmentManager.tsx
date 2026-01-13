import { useState, useRef } from "react";
import {
  Camera,
  FileText,
  Receipt,
  Trash2,
  Upload,
  Image as ImageIcon,
  File,
  X,
  ZoomIn,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { Attachment } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AttachmentManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  existingAttachments?: Attachment[];
}

const attachmentTypes = [
  { value: "photo-before", label: "Before Photo", icon: Camera },
  { value: "photo-after", label: "After Photo", icon: Camera },
  { value: "receipt", label: "Receipt", icon: Receipt },
  { value: "document", label: "Document", icon: FileText },
] as const;

export function AttachmentManager({
  open,
  onOpenChange,
  jobId,
  existingAttachments = [],
}: AttachmentManagerProps) {
  const { addAttachment, deleteAttachment } = useStore();
  const [attachments, setAttachments] = useState<Attachment[]>(existingAttachments);
  const [selectedType, setSelectedType] = useState<Attachment["type"]>("photo-before");
  const [isUploading, setIsUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB for local storage)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Unsupported file type. Please use images or PDF/Word documents.");
      return;
    }

    setIsUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;

        const newAttachment = await addAttachment({
          jobId,
          type: selectedType,
          name: file.name,
          mimeType: file.type,
          data: base64Data,
        });

        setAttachments([...attachments, newAttachment]);
        setIsUploading(false);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAttachment(id);
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const getAttachmentsByType = (type: Attachment["type"]) => {
    return attachments.filter((a) => a.type === type);
  };

  const isImage = (mimeType: string) => {
    return mimeType.startsWith("image/");
  };

  const getTypeIcon = (type: Attachment["type"]) => {
    switch (type) {
      case "photo-before":
      case "photo-after":
        return ImageIcon;
      case "receipt":
        return Receipt;
      case "document":
        return FileText;
      default:
        return File;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Attachments & Media
            </DialogTitle>
          </DialogHeader>

          {/* Upload Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">
                  Attachment Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as Attachment["type"])}
                  className="input-field w-full"
                >
                  {attachmentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="btn-primary flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? "Uploading..." : "Upload File"}
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Supported: Images (JPEG, PNG, GIF, WebP), PDF, Word documents. Max 5MB per file.
            </p>
          </div>

          {/* Attachments Grid */}
          <div className="space-y-6 mt-4">
            {attachmentTypes.map((type) => {
              const typeAttachments = getAttachmentsByType(type.value);
              if (typeAttachments.length === 0) return null;

              const TypeIcon = type.icon;

              return (
                <div key={type.value}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <TypeIcon className="w-4 h-4" />
                    {type.label}s ({typeAttachments.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {typeAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="relative group border border-border rounded-lg overflow-hidden bg-secondary/50"
                      >
                        {isImage(attachment.mimeType) ? (
                          <img
                            src={attachment.data}
                            alt={attachment.name}
                            className="w-full h-24 object-cover cursor-pointer"
                            onClick={() => setPreviewAttachment(attachment)}
                          />
                        ) : (
                          <div
                            className="w-full h-24 flex flex-col items-center justify-center cursor-pointer"
                            onClick={() => {
                              // Open PDF/doc in new tab
                              const link = document.createElement("a");
                              link.href = attachment.data;
                              link.download = attachment.name;
                              link.click();
                            }}
                          >
                            <FileText className="w-8 h-8 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground mt-1 truncate max-w-full px-2">
                              {attachment.name}
                            </span>
                          </div>
                        )}

                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {isImage(attachment.mimeType) && (
                            <button
                              onClick={() => setPreviewAttachment(attachment)}
                              className="p-2 bg-white/20 rounded-full hover:bg-white/30"
                              title="View"
                            >
                              <ZoomIn className="w-4 h-4 text-white" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(attachment.id)}
                            className="p-2 bg-destructive/80 rounded-full hover:bg-destructive"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>

                        {/* File name tooltip */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 text-xs text-white truncate">
                          {attachment.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {attachments.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No attachments yet</p>
                <p className="text-sm">Upload photos, receipts, or documents</p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={() => onOpenChange(false)} className="btn-secondary">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      {previewAttachment && (
        <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
          <DialogContent className="bg-card border-border max-w-4xl p-0">
            <div className="relative">
              <button
                onClick={() => setPreviewAttachment(null)}
                className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 z-10"
              >
                <X className="w-5 h-5 text-white" />
              </button>
              <img
                src={previewAttachment.data}
                alt={previewAttachment.name}
                className="w-full max-h-[80vh] object-contain"
              />
              <div className="p-4 bg-secondary/50">
                <p className="text-sm font-medium">{previewAttachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded: {new Date(previewAttachment.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
