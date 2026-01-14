import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Bell, Check, Edit2, X, Camera, Upload, FileText } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Job, Part, Reminder, Attachment } from "@/types";
import { dollarsToCents } from "@/lib/db";
import { maybeCompressImage, saveAttachmentFile, getAttachmentUrl } from "@/lib/fileProcessing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const partSchema = z.object({
  name: z.string().min(1, "Part name required"),
  quantity: z.coerce.number().min(1),
  unitCost: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  source: z.enum(["inventory", "customer-provided"]),
});

const reminderPresetSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["follow-up", "maintenance", "annual-checkup", "custom"]),
  title: z.string(),
  daysFromNow: z.coerce.number().optional(),
  customDate: z.string().optional(),
});

const jobSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  dateOfService: z.string().min(1, "Date is required"),
  problemDescription: z.string().min(1, "Problem description required").max(500),
  workPerformed: z.string().max(1000).optional(),
  laborHours: z.coerce.number().min(0),
  laborRate: z.coerce.number().min(0),
  parts: z.array(partSchema).optional(),
  miscFees: z.coerce.number().min(0).optional(),
  miscFeesDescription: z.string().max(200).optional(),
  taxRate: z.coerce.number().min(0).max(100),
  technicianNotes: z.string().max(1000).optional(),
  status: z.enum(["quoted", "in-progress", "completed"]),
  reminders: z.array(reminderPresetSchema).optional(),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job;
  customerId?: string;
}

const defaultReminders = [
  { enabled: false, type: "follow-up" as const, title: "Follow-up service check", daysFromNow: 30 },
  { enabled: false, type: "maintenance" as const, title: "Scheduled maintenance", daysFromNow: 90 },
  { enabled: false, type: "annual-checkup" as const, title: "Annual checkup due", daysFromNow: 365 },
];

export function JobDialog({ open, onOpenChange, job, customerId }: JobDialogProps) {
  const { addJob, updateJob, completeJob, customers, settings, addReminder, getRemindersByJob, updateReminder: updateReminderStore, deleteReminder, completeReminder, addAttachment, getAttachmentsByJob, deleteAttachment } = useStore();
  const [existingReminders, setExistingReminders] = useState<Reminder[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; type: Attachment["type"] }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editingReminderData, setEditingReminderData] = useState<{ title: string; dueDate: string; type: Reminder["type"] } | null>(null);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderData, setNewReminderData] = useState({ title: "", dueDate: "", type: "follow-up" as Reminder["type"] });
  const [selectedAttachmentType, setSelectedAttachmentType] = useState<Attachment["type"]>("photo-before");
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing reminders and attachments when dialog opens
  useEffect(() => {
    if (job && open) {
      setExistingReminders(getRemindersByJob(job.id));
      const jobAttachments = getAttachmentsByJob(job.id);
      setExistingAttachments(jobAttachments);
      // Load attachment URLs
      (async () => {
        const urls: Record<string, string> = {};
        for (const attachment of jobAttachments) {
          urls[attachment.id] = await getAttachmentUrl(attachment.filePath);
        }
        setAttachmentUrls(urls);
      })();
    }
    if (!open) {
      setPendingAttachments([]);
      setAttachmentUrls({});
    }
  }, [job, open, getRemindersByJob, getAttachmentsByJob]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customerId: customerId || "",
      dateOfService: new Date().toISOString().split("T")[0],
      problemDescription: "",
      workPerformed: "",
      laborHours: 0,
      laborRate: settings ? settings.defaultLaborRateCents / 100 : 85,
      parts: [],
      miscFees: 0,
      miscFeesDescription: "",
      taxRate: settings?.defaultTaxRate || 8.25,
      technicianNotes: "",
      status: "quoted",
      reminders: defaultReminders,
    },
  });

  const { fields: partFields, append: appendPart, remove: removePart } = useFieldArray({
    control,
    name: "parts",
  });

  const { fields: reminderFields, update: updateReminder } = useFieldArray({
    control,
    name: "reminders",
  });

  useEffect(() => {
    if (job) {
      reset({
        customerId: job.customerId,
        dateOfService: job.dateOfService.split("T")[0],
        problemDescription: job.problemDescription,
        workPerformed: job.workPerformed,
        laborHours: job.laborHours,
        laborRate: job.laborRateCents / 100,
        parts: job.parts.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          unitCost: p.unitCostCents / 100,
          unitPrice: p.unitPriceCents / 100,
          source: p.source || "inventory",
        })),
        miscFees: job.miscFeesCents / 100,
        miscFeesDescription: job.miscFeesDescription,
        taxRate: job.taxRate,
        technicianNotes: job.technicianNotes,
        status: job.status === "invoiced" || job.status === "paid" ? "completed" : job.status,
        reminders: defaultReminders, // Already created reminders managed separately
      });
    } else {
      reset({
        customerId: customerId || "",
        dateOfService: new Date().toISOString().split("T")[0],
        problemDescription: "",
        workPerformed: "",
        laborHours: 0,
        laborRate: settings ? settings.defaultLaborRateCents / 100 : 85,
        parts: [],
        miscFees: 0,
        miscFeesDescription: "",
        taxRate: settings?.defaultTaxRate || 8.25,
        technicianNotes: "",
        status: "quoted",
        reminders: defaultReminders,
      });
    }
  }, [job, customerId, reset, open, settings]);

  const watchedValues = watch();
  const laborTotal = (watchedValues.laborHours || 0) * (watchedValues.laborRate || 0);
  const partsTotal = (watchedValues.parts || []).reduce(
    (sum, part) => sum + (part.quantity || 0) * (part.unitPrice || 0),
    0
  );
  const subtotal = laborTotal + partsTotal + (watchedValues.miscFees || 0);
  const tax = subtotal * ((watchedValues.taxRate || 0) / 100);
  const total = subtotal + tax;

  const onSubmit = async (data: JobFormData) => {
    setIsSubmitting(true);
    try {
      const parts: Part[] = (data.parts || []).map((p, i) => ({
        id: `part-${i}`,
        name: p.name,
        quantity: p.quantity,
        unitCostCents: dollarsToCents(p.unitCost),
        unitPriceCents: dollarsToCents(p.unitPrice),
        source: p.source || "inventory",
      }));

      const jobData = {
        customerId: data.customerId,
        dateOfService: data.dateOfService,
        problemDescription: data.problemDescription,
        workPerformed: data.workPerformed || "",
        laborHours: data.laborHours,
        laborRateCents: dollarsToCents(data.laborRate),
        parts,
        miscFeesCents: dollarsToCents(data.miscFees || 0),
        miscFeesDescription: data.miscFeesDescription || "",
        taxRate: data.taxRate,
        technicianNotes: data.technicianNotes || "",
        status: data.status as Job["status"],
      };

      let targetJobId: string;

      if (job) {
        await updateJob(job.id, jobData);
        targetJobId = job.id;
        
        // If status changed to completed, auto-generate invoice
        if (data.status === "completed" && job.status !== "completed" && job.status !== "invoiced" && job.status !== "paid") {
          await completeJob(job.id);
        }
      } else {
        const newJob = await addJob(jobData);
        targetJobId = newJob.id;
        
        // Create reminders for new jobs
        const enabledReminders = (data.reminders || []).filter((r) => r.enabled);
        for (const reminder of enabledReminders) {
          let dueDate: string;
          if (reminder.customDate) {
            dueDate = reminder.customDate;
          } else {
            const date = new Date();
            date.setDate(date.getDate() + (reminder.daysFromNow || 30));
            dueDate = date.toISOString().split("T")[0];
          }

          await addReminder({
            jobId: targetJobId,
            customerId: data.customerId,
            type: reminder.type,
            title: reminder.title,
            description: "",
            dueDate,
          });
        }

        // Save pending attachments for new jobs
        for (const pending of pendingAttachments) {
          const processedFile = await maybeCompressImage(pending.file);
          const { filePath, size } = await saveAttachmentFile(processedFile, targetJobId);

          await addAttachment({
            jobId: targetJobId,
            type: pending.type,
            name: processedFile.name,
            mimeType: processedFile.type,
            filePath,
            size,
          });
        }
        
        // If created as completed, auto-generate invoice
        if (data.status === "completed") {
          await completeJob(newJob.id);
        }
      }

      onOpenChange(false);
      reset();
      setPendingAttachments([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCustomers = customers
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort A-Z
  
  // Allow editing even for invoiced/paid jobs (for corrections)
  const isViewOnly = false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {job ? (isLocked ? "View Job" : "Edit Job") : "Create New Job"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Customer & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Customer *</label>
              <select
                {...register("customerId")}
                className="input-field w-full"
                disabled={isLocked || !!customerId}
              >
                <option value="">Select customer...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="text-destructive text-xs mt-1">{errors.customerId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Date of Service *</label>
              <input
                {...register("dateOfService")}
                type="date"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Problem & Work */}
          <div>
            <label className="block text-sm font-medium mb-1">Problem Description *</label>
            <textarea
              {...register("problemDescription")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="What was wrong?"
              disabled={isLocked}
            />
            {errors.problemDescription && (
              <p className="text-destructive text-xs mt-1">{errors.problemDescription.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Work Performed</label>
            <textarea
              {...register("workPerformed")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="What was done?"
              disabled={isLocked}
            />
          </div>

          {/* Labor */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Labor Hours</label>
              <input
                {...register("laborHours")}
                type="number"
                step="0.25"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate ($/hr)</label>
              <input
                {...register("laborRate")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Labor Total</label>
              <div className="input-field w-full bg-secondary/50">
                ${laborTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Parts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Parts</label>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => appendPart({ name: "", quantity: 1, unitCost: 0, unitPrice: 0, source: "inventory" })}
                  className="text-primary text-sm flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  Add Part
                </button>
              )}
            </div>
            {partFields.length > 0 && (
              <div className="grid grid-cols-6 gap-2 mb-1 px-3 text-xs text-muted-foreground">
                <span className="col-span-2">Name</span>
                <span>Qty</span>
                <span>Your Cost</span>
                <span>Customer Price</span>
                <span></span>
              </div>
            )}
            {partFields.map((field, index) => (
              <div key={field.id} className="space-y-2 mb-3 p-3 bg-secondary/30 rounded-lg">
                <div className="grid grid-cols-6 gap-2">
                  <input
                    {...register(`parts.${index}.name`)}
                    placeholder="Part name"
                    className="input-field col-span-2"
                    disabled={isLocked}
                  />
                  <input
                    {...register(`parts.${index}.quantity`)}
                    type="number"
                    placeholder="Qty"
                    className="input-field"
                    disabled={isLocked}
                  />
                  <input
                    {...register(`parts.${index}.unitCost`)}
                    type="number"
                    step="0.01"
                    placeholder="Cost"
                    className="input-field"
                    disabled={isLocked}
                    title="Your cost (what you paid)"
                  />
                  <input
                    {...register(`parts.${index}.unitPrice`)}
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    className="input-field"
                    disabled={isLocked}
                    title="Customer price (what you charge)"
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removePart(index)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="text-xs text-muted-foreground">Source:</label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        {...register(`parts.${index}.source`)}
                        value="inventory"
                        className="accent-primary"
                        disabled={isLocked}
                      />
                      <span>From Inventory</span>
                      <span className="text-muted-foreground">(markup = income)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        {...register(`parts.${index}.source`)}
                        value="customer-provided"
                        className="accent-primary"
                        disabled={isLocked}
                      />
                      <span>Customer Paid</span>
                      <span className="text-muted-foreground">(pass-through)</span>
                    </label>
                  </div>
                  {watchedValues.parts?.[index]?.source === "inventory" && (
                    <span className="text-xs text-success">
                      Profit: ${(((watchedValues.parts[index].unitPrice || 0) - (watchedValues.parts[index].unitCost || 0)) * (watchedValues.parts[index].quantity || 0)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Misc Fees */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Misc Fees ($)</label>
              <input
                {...register("miscFees")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                {...register("miscFeesDescription")}
                className="input-field w-full"
                placeholder="Travel, disposal, etc."
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Tax & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
              <input
                {...register("taxRate")}
                type="number"
                step="0.01"
                className="input-field w-full"
                disabled={isLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                {...register("status")}
                className="input-field w-full"
                disabled={isLocked}
              >
                <option value="quoted">Quoted</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed (Generate Invoice)</option>
              </select>
            </div>
          </div>

          {/* Service Reminders */}
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <label className="text-sm font-medium">
                  {job ? "Service Reminders" : "Schedule Service Reminders"}
                </label>
              </div>
              {job && !isLocked && (
                <button
                  type="button"
                  onClick={() => setShowAddReminder(!showAddReminder)}
                  className="text-primary text-sm flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  Add Reminder
                </button>
              )}
            </div>

            {/* Add new reminder form for existing jobs */}
            {job && showAddReminder && (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg mb-3">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newReminderData.type}
                      onChange={(e) => setNewReminderData({ ...newReminderData, type: e.target.value as Reminder["type"] })}
                      className="input-field text-sm"
                    >
                      <option value="follow-up">Follow-up</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="annual-checkup">Annual Checkup</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      type="date"
                      value={newReminderData.dueDate}
                      onChange={(e) => setNewReminderData({ ...newReminderData, dueDate: e.target.value })}
                      min={new Date().toISOString().split("T")[0]}
                      className="input-field text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    value={newReminderData.title}
                    onChange={(e) => setNewReminderData({ ...newReminderData, title: e.target.value })}
                    placeholder="Reminder title..."
                    className="input-field w-full text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddReminder(false)}
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (newReminderData.title && newReminderData.dueDate && job) {
                          const newReminder = await addReminder({
                            jobId: job.id,
                            customerId: job.customerId,
                            type: newReminderData.type,
                            title: newReminderData.title,
                            description: "",
                            dueDate: newReminderData.dueDate,
                          });
                          setExistingReminders([...existingReminders, newReminder]);
                          setNewReminderData({ title: "", dueDate: "", type: "follow-up" });
                          setShowAddReminder(false);
                        }
                      }}
                      disabled={!newReminderData.title || !newReminderData.dueDate}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Show existing reminders for editing */}
            {job && existingReminders.length > 0 && (
              <div className="space-y-2 mb-3">
                {existingReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`p-3 rounded-lg border ${
                      reminder.completed
                        ? "bg-success/10 border-success/20"
                        : "bg-secondary/50 border-border"
                    }`}
                  >
                    {editingReminderId === reminder.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editingReminderData?.type || reminder.type}
                            onChange={(e) => setEditingReminderData({ ...editingReminderData!, type: e.target.value as Reminder["type"] })}
                            className="input-field text-sm"
                          >
                            <option value="follow-up">Follow-up</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="annual-checkup">Annual Checkup</option>
                            <option value="custom">Custom</option>
                          </select>
                          <input
                            type="date"
                            value={editingReminderData?.dueDate || reminder.dueDate.split("T")[0]}
                            onChange={(e) => setEditingReminderData({ ...editingReminderData!, dueDate: e.target.value })}
                            className="input-field text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          value={editingReminderData?.title || reminder.title}
                          onChange={(e) => setEditingReminderData({ ...editingReminderData!, title: e.target.value })}
                          className="input-field w-full text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReminderId(null);
                              setEditingReminderData(null);
                            }}
                            className="btn-secondary text-xs py-1 px-3"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (editingReminderData) {
                                await updateReminderStore(reminder.id, editingReminderData);
                                setExistingReminders(existingReminders.map(r => 
                                  r.id === reminder.id ? { ...r, ...editingReminderData } : r
                                ));
                                setEditingReminderId(null);
                                setEditingReminderData(null);
                              }
                            }}
                            className="btn-primary text-xs py-1 px-3"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              reminder.type === "follow-up"
                                ? "bg-primary/20 text-primary"
                                : reminder.type === "maintenance"
                                ? "bg-warning/20 text-warning"
                                : "bg-success/20 text-success"
                            }`}>
                              {reminder.type.replace("-", " ")}
                            </span>
                            {reminder.completed && (
                              <span className="text-xs text-success">✓ Completed</span>
                            )}
                          </div>
                          <p className="font-medium text-sm mt-1">{reminder.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Due: {new Date(reminder.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                        {!isLocked && (
                          <div className="flex items-center gap-1">
                            {!reminder.completed && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingReminderId(reminder.id);
                                    setEditingReminderData({
                                      title: reminder.title,
                                      dueDate: reminder.dueDate.split("T")[0],
                                      type: reminder.type,
                                    });
                                  }}
                                  className="p-1.5 hover:bg-secondary rounded text-muted-foreground"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await completeReminder(reminder.id);
                                    setExistingReminders(existingReminders.map(r => 
                                      r.id === reminder.id ? { ...r, completed: true } : r
                                    ));
                                  }}
                                  className="p-1.5 hover:bg-success/10 rounded text-success"
                                  title="Mark complete"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteReminder(reminder.id);
                                setExistingReminders(existingReminders.filter(r => r.id !== reminder.id));
                              }}
                              className="p-1.5 hover:bg-destructive/10 rounded text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {job && existingReminders.length === 0 && !showAddReminder && (
              <p className="text-sm text-muted-foreground">
                No reminders set. Click "Add Reminder" to create one.
              </p>
            )}

            {/* Show reminder presets for new jobs */}
            {!job && (
              <>
                <div className="space-y-3">
                  {reminderFields.map((field, index) => {
                    const watchedReminder = watch(`reminders.${index}`);
                    return (
                      <div
                        key={field.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          watchedReminder?.enabled
                            ? "bg-primary/10 border-primary/30"
                            : "bg-secondary/30 border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            {...register(`reminders.${index}.enabled`)}
                            className="w-4 h-4 rounded border-border"
                          />
                          <div className="flex-1">
                            <input
                              {...register(`reminders.${index}.title`)}
                              className="input-field w-full text-sm"
                              placeholder="Reminder title"
                            />
                          </div>
                        </div>
                        {watchedReminder?.enabled && (
                          <div className="mt-3 ml-7 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Due in:</span>
                            <select
                              value={watchedReminder.daysFromNow || "custom"}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "custom") {
                                  updateReminder(index, { ...watchedReminder, daysFromNow: undefined });
                                } else {
                                  updateReminder(index, {
                                    ...watchedReminder,
                                    daysFromNow: parseInt(value),
                                    customDate: undefined,
                                  });
                                }
                              }}
                              className="input-field text-sm py-1"
                            >
                              <option value={30}>30 days</option>
                              <option value={60}>60 days</option>
                              <option value={90}>90 days</option>
                              <option value={180}>6 months</option>
                              <option value={365}>1 year</option>
                              <option value="custom">Custom date</option>
                            </select>
                            {!watchedReminder.daysFromNow && (
                              <input
                                type="date"
                                {...register(`reminders.${index}.customDate`)}
                                min={new Date().toISOString().split("T")[0]}
                                className="input-field text-sm py-1"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Reminders will appear on your dashboard when due
                </p>
              </>
            )}
          </div>

          {/* Attachments */}
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                <label className="text-sm font-medium">Attachments</label>
              </div>
            </div>

            {/* Upload controls */}
            {!isLocked && (
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={selectedAttachmentType}
                  onChange={(e) => setSelectedAttachmentType(e.target.value as Attachment["type"])}
                  className="input-field text-sm py-1"
                >
                  <option value="photo-before">Before Photo</option>
                  <option value="photo-after">After Photo</option>
                  <option value="receipt">Receipt</option>
                  <option value="document">Document</option>
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;

                    const selectedFiles = Array.from(files);

                    if (job) {
                      // For existing jobs, save immediately
                      (async () => {
                        for (const file of selectedFiles) {
                          const processedFile = await maybeCompressImage(file);
                          const { filePath, size } = await saveAttachmentFile(processedFile, job.id);

                          const newAttachment = await addAttachment({
                            jobId: job.id,
                            type: selectedAttachmentType,
                            name: processedFile.name,
                            mimeType: processedFile.type,
                            filePath,
                            size,
                          });

                          setExistingAttachments((prev) => [...prev, newAttachment]);
                        }
                      })();
                    } else {
                      // For new jobs, queue for saving after job creation
                      setPendingAttachments((prev) => [
                        ...prev,
                        ...selectedFiles.map((file) => ({ file, type: selectedAttachmentType })),
                      ]);
                    }

                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-sm py-1 px-3 flex items-center gap-1"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              </div>
            )}

            {/* Pending attachments for new jobs */}
            {!job && pendingAttachments.length > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-xs text-muted-foreground">Pending uploads (will save with job):</p>
                {pendingAttachments.map((pending, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-secondary/50 rounded text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]">{pending.file.name}</span>
                      <span className="text-xs text-muted-foreground">({pending.type.replace("-", " ")})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments(pendingAttachments.filter((_, i) => i !== index))}
                      className="p-1 hover:bg-destructive/10 rounded text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Existing attachments for editing */}
            {job && existingAttachments.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {existingAttachments.map((attachment) => (
                  <div key={attachment.id} className="relative group">
                    {attachment.mimeType.startsWith("image/") ? (
                      <img
                        src={attachmentUrls[attachment.id] || ""}
                        alt={attachment.name}
                        className="w-full h-16 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-full h-16 flex items-center justify-center bg-secondary/50 rounded border border-border">
                        <FileText className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteAttachment(attachment.id);
                          setExistingAttachments(existingAttachments.filter(a => a.id !== attachment.id));
                        }}
                        className="absolute -top-1 -right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground truncate mt-1">{attachment.type.replace("-", " ")}</p>
                  </div>
                ))}
              </div>
            )}

            {job && existingAttachments.length === 0 && pendingAttachments.length === 0 && (
              <p className="text-sm text-muted-foreground">No attachments yet.</p>
            )}

            {!job && pendingAttachments.length === 0 && (
              <p className="text-sm text-muted-foreground">Upload photos, receipts, or documents for this job.</p>
            )}
          </div>

          {/* Technician Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Technician Notes</label>
            <textarea
              {...register("technicianNotes")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Internal notes..."
            />
          </div>

          {/* Totals */}
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({watchedValues.taxRate}%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-lg border-t border-border pt-2">
              <span>Total</span>
              <span className="text-primary">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          {!isLocked && (
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1"
              >
                {isSubmitting ? "Saving..." : job ? "Update Job" : "Create Job"}
              </button>
            </div>
          )}

          {isLocked && (
            <p className="text-sm text-muted-foreground text-center">
              This job is locked because an invoice has been generated.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
