import { create } from 'zustand';
import { Job, Invoice, Payment, Reminder, Attachment } from '@/types';

interface DeletedJobData {
  job: Job;
  invoice: Invoice | null;
  payments: Payment[];
  reminders: Reminder[];
  attachments: Attachment[];
  inventoryAdjustments: { itemId: string; quantityRestored: number }[];
  deletedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface TrashState {
  deletedJobs: Map<string, DeletedJobData>;
  
  // Store a deleted job for potential undo
  stashDeletedJob: (data: Omit<DeletedJobData, 'deletedAt' | 'timeoutId'>, onExpire: () => void) => void;
  
  // Get a deleted job's data
  getDeletedJob: (jobId: string) => DeletedJobData | undefined;
  
  // Remove from trash (either restored or expired)
  removeFromTrash: (jobId: string) => void;
  
  // Check if job is in trash
  isInTrash: (jobId: string) => boolean;
}

const UNDO_TIMEOUT_MS = 30000; // 30 seconds

export const useTrashStore = create<TrashState>((set, get) => ({
  deletedJobs: new Map(),

  stashDeletedJob: (data, onExpire) => {
    const deletedAt = Date.now();
    const timeoutId = setTimeout(() => {
      get().removeFromTrash(data.job.id);
      onExpire();
    }, UNDO_TIMEOUT_MS);

    set((state) => {
      const newMap = new Map(state.deletedJobs);
      newMap.set(data.job.id, {
        ...data,
        deletedAt,
        timeoutId,
      });
      return { deletedJobs: newMap };
    });
  },

  getDeletedJob: (jobId) => {
    return get().deletedJobs.get(jobId);
  },

  removeFromTrash: (jobId) => {
    const existing = get().deletedJobs.get(jobId);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }
    
    set((state) => {
      const newMap = new Map(state.deletedJobs);
      newMap.delete(jobId);
      return { deletedJobs: newMap };
    });
  },

  isInTrash: (jobId) => {
    return get().deletedJobs.has(jobId);
  },
}));
