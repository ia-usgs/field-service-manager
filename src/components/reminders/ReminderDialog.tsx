import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Bell, Check } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Reminder } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const reminderSchema = z.object({
  type: z.enum(["follow-up", "maintenance", "annual-checkup", "custom"]),
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).optional(),
  dueDate: z.string().min(1, "Due date is required"),
});

type ReminderFormData = z.infer<typeof reminderSchema>;

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  customerId: string;
  existingReminders?: Reminder[];
}

export function ReminderDialog({
  open,
  onOpenChange,
  jobId,
  customerId,
  existingReminders = [],
}: ReminderDialogProps) {
  const { addReminder, completeReminder, deleteReminder } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>(existingReminders);

  useEffect(() => {
    setReminders(existingReminders);
  }, [existingReminders]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReminderFormData>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      type: "follow-up",
      title: "",
      description: "",
      dueDate: "",
    },
  });

  const reminderType = watch("type");

  // Auto-fill title based on type
  useEffect(() => {
    const titles: Record<string, string> = {
      "follow-up": "Follow-up service check",
      "maintenance": "Scheduled maintenance",
      "annual-checkup": "Annual checkup due",
      "custom": "",
    };
    if (reminderType !== "custom") {
      setValue("title", titles[reminderType] || "");
    }
  }, [reminderType, setValue]);

  // Quick date presets
  const setDatePreset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setValue("dueDate", date.toISOString().split("T")[0]);
  };

  const onSubmit = async (data: ReminderFormData) => {
    setIsSubmitting(true);
    try {
      const newReminder = await addReminder({
        jobId,
        customerId,
        type: data.type,
        title: data.title,
        description: data.description || "",
        dueDate: data.dueDate,
      });
      setReminders([...reminders, newReminder]);
      reset({
        type: "follow-up",
        title: "",
        description: "",
        dueDate: "",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async (id: string) => {
    await completeReminder(id);
    setReminders(
      reminders.map((r) =>
        r.id === id ? { ...r, completed: true, completedAt: new Date().toISOString() } : r
      )
    );
  };

  const handleDelete = async (id: string) => {
    await deleteReminder(id);
    setReminders(reminders.filter((r) => r.id !== id));
  };

  const typeLabels: Record<string, string> = {
    "follow-up": "Follow-up",
    "maintenance": "Maintenance",
    "annual-checkup": "Annual Checkup",
    "custom": "Custom",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Service Reminders
          </DialogTitle>
        </DialogHeader>

        {/* Existing Reminders */}
        {reminders.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Scheduled Reminders
            </h4>
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className={`p-3 rounded-lg border ${
                  reminder.completed
                    ? "bg-success/10 border-success/20"
                    : "bg-secondary/50 border-border"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          reminder.type === "follow-up"
                            ? "bg-primary/20 text-primary"
                            : reminder.type === "maintenance"
                            ? "bg-warning/20 text-warning"
                            : reminder.type === "annual-checkup"
                            ? "bg-success/20 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {typeLabels[reminder.type]}
                      </span>
                      {reminder.completed && (
                        <span className="text-xs text-success flex items-center gap-1">
                          <Check className="w-3 h-3" /> Completed
                        </span>
                      )}
                    </div>
                    <p className="font-medium mt-1">{reminder.title}</p>
                    {reminder.description && (
                      <p className="text-sm text-muted-foreground">
                        {reminder.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Due: {new Date(reminder.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!reminder.completed && (
                      <button
                        onClick={() => handleComplete(reminder.id)}
                        className="p-1.5 hover:bg-success/10 rounded text-success"
                        title="Mark complete"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(reminder.id)}
                      className="p-1.5 hover:bg-destructive/10 rounded text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add New Reminder Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add New Reminder
          </h4>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select {...register("type")} className="input-field w-full">
              <option value="follow-up">Follow-up</option>
              <option value="maintenance">Maintenance</option>
              <option value="annual-checkup">Annual Checkup</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              {...register("title")}
              className="input-field w-full"
              placeholder="Reminder title..."
            />
            {errors.title && (
              <p className="text-destructive text-xs mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              {...register("description")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Additional details..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Due Date *</label>
            <input
              {...register("dueDate")}
              type="date"
              className="input-field w-full"
              min={new Date().toISOString().split("T")[0]}
            />
            {errors.dueDate && (
              <p className="text-destructive text-xs mt-1">{errors.dueDate.message}</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setDatePreset(30)}
                className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
              >
                30 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(60)}
                className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
              >
                60 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(90)}
                className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
              >
                90 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(180)}
                className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
              >
                6 months
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(365)}
                className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
              >
                1 year
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn-secondary flex-1"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1"
            >
              {isSubmitting ? "Adding..." : "Add Reminder"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
