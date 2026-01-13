import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Plus,
  FileText,
  Briefcase,
  DollarSign,
  Bell,
  Check,
  Trash2,
  Camera,
  Image as ImageIcon,
  Receipt,
  ZoomIn,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/ui/stat-card";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { JobDialog } from "@/components/jobs/JobDialog";
import { ReminderDialog } from "@/components/reminders/ReminderDialog";
import { centsToDollars } from "@/lib/db";
import { getAttachmentUrl } from "@/lib/fileProcessing";
import { Attachment } from "@/types";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, jobs, invoices, getRemindersByCustomer, completeReminder, deleteReminder, attachments } = useStore();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [selectedJobForReminder, setSelectedJobForReminder] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const customer = customers.find((c) => c.id === id);
  const customerReminders = id ? getRemindersByCustomer(id) : [];
  const customerJobs = jobs.filter((j) => j.customerId === id);
  
  // Get all attachments for this customer's jobs
  const customerAttachments = attachments.filter((a) => 
    customerJobs.some((j) => j.id === a.jobId)
  );
  
  // Group attachments by job
  const attachmentsByJob = customerJobs.map((job) => ({
    job,
    attachments: customerAttachments.filter((a) => a.jobId === job.id),
  })).filter((group) => group.attachments.length > 0);

  // Load attachment URLs
  useEffect(() => {
    const loadUrls = async () => {
      const urls: Record<string, string> = {};
      for (const attachment of customerAttachments) {
        urls[attachment.id] = await getAttachmentUrl(attachment.filePath);
      }
      setAttachmentUrls(urls);
    };
    loadUrls();
  }, [customerAttachments]);

  if (!customer) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Customer not found</p>
        </div>
      </AppLayout>
    );
  }

  const customerInvoices = invoices.filter((i) => i.customerId === id);

  const totalSpend = customerInvoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
  const outstanding = customerInvoices
    .filter((inv) => inv.paymentStatus !== "paid")
    .reduce((sum, inv) => sum + (inv.totalCents - inv.paidAmountCents), 0);
  const avgJobValue =
    customerInvoices.length > 0
      ? customerInvoices.reduce((sum, inv) => sum + inv.totalCents, 0) / customerInvoices.length
      : 0;

  const getAttachmentIcon = (type: Attachment["type"]) => {
    switch (type) {
      case "photo-before":
      case "photo-after":
        return ImageIcon;
      case "receipt":
        return Receipt;
      default:
        return FileText;
    }
  };

  const handleCompleteReminder = async (reminderId: string) => {
    await completeReminder(reminderId);
  };

  const handleDeleteReminder = async (reminderId: string) => {
    await deleteReminder(reminderId);
  };

  const openReminderDialog = (jobId: string) => {
    setSelectedJobForReminder(jobId);
    setIsReminderDialogOpen(true);
  };

  const statusColors: Record<string, string> = {
    quoted: "status-quoted",
    "in-progress": "status-in-progress",
    completed: "status-completed",
    invoiced: "status-completed",
    paid: "status-paid",
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/customers")}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {customer.email}
              </span>
            )}
            {customer.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {customer.phone}
              </span>
            )}
            {customer.address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {customer.address}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsEditDialogOpen(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Edit className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={() => setIsJobDialogOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Job
        </button>
      </div>

      {/* Tags */}
      {customer.tags.length > 0 && (
        <div className="flex gap-2 mb-6">
          {customer.tags.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 text-sm bg-primary/20 text-primary rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Lifetime Value"
          value={`$${centsToDollars(totalSpend)}`}
          icon={DollarSign}
          variant="success"
        />
        <StatCard
          title="Outstanding"
          value={`$${centsToDollars(outstanding)}`}
          icon={FileText}
          variant={outstanding > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Total Jobs"
          value={customerJobs.length}
          icon={Briefcase}
        />
        <StatCard
          title="Avg Job Value"
          value={`$${centsToDollars(avgJobValue)}`}
          icon={DollarSign}
        />
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="font-medium mb-2">Notes</h3>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {customer.notes}
          </p>
        </div>
      )}

      {/* Job History */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-4">Job History</h3>
        {customerJobs.length > 0 ? (
          <div className="space-y-3">
            {customerJobs
              .sort((a, b) => new Date(b.dateOfService).getTime() - new Date(a.dateOfService).getTime())
              .map((job) => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg cursor-pointer hover:bg-secondary/70 transition-colors"
                >
                  <div>
                    <p className="font-medium">{job.problemDescription.substring(0, 50)}...</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(job.dateOfService).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`status-badge ${statusColors[job.status]}`}>
                    {job.status.replace("-", " ")}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No jobs yet</p>
        )}
      </div>

      {/* Service Reminders */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Service Reminders
          </h3>
          {customerJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="input-field text-sm py-1"
                onChange={(e) => {
                  if (e.target.value) {
                    openReminderDialog(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Add reminder to job...</option>
                {customerJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.problemDescription.substring(0, 30)}... ({new Date(job.dateOfService).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {customerReminders.length > 0 ? (
          <div className="space-y-3">
            {customerReminders
              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
              .map((reminder) => {
                const isOverdue = !reminder.completed && new Date(reminder.dueDate) < new Date();
                const relatedJob = jobs.find((j) => j.id === reminder.jobId);
                return (
                  <div
                    key={reminder.id}
                    className={`p-4 rounded-lg border ${
                      reminder.completed
                        ? "bg-success/10 border-success/20"
                        : isOverdue
                        ? "bg-destructive/10 border-destructive/20"
                        : "bg-secondary/50 border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
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
                            <span className="text-xs text-success flex items-center gap-1">
                              <Check className="w-3 h-3" /> Completed
                            </span>
                          )}
                          {isOverdue && (
                            <span className="text-xs text-destructive">Overdue!</span>
                          )}
                        </div>
                        <p className="font-medium">{reminder.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Due: {new Date(reminder.dueDate).toLocaleDateString()}
                        </p>
                        {relatedJob && (
                          <p
                            className="text-xs text-primary cursor-pointer hover:underline mt-1"
                            onClick={() => navigate(`/jobs/${relatedJob.id}`)}
                          >
                            Related job: {relatedJob.problemDescription.substring(0, 40)}...
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!reminder.completed && (
                          <button
                            onClick={() => handleCompleteReminder(reminder.id)}
                            className="p-1.5 hover:bg-success/10 rounded text-success"
                            title="Mark complete"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteReminder(reminder.id)}
                          className="p-1.5 hover:bg-destructive/10 rounded text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            No reminders set. Add reminders to schedule follow-ups for this customer.
          </p>
        )}
      </div>

      {/* Attachments by Job */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5" />
          <h3 className="font-semibold">Attachments & Media</h3>
        </div>
        {attachmentsByJob.length > 0 ? (
          <div className="space-y-4">
            {attachmentsByJob
              .sort((a, b) => new Date(b.job.dateOfService).getTime() - new Date(a.job.dateOfService).getTime())
              .map(({ job: relatedJob, attachments: jobAttachments }) => (
                <div key={relatedJob.id} className="border border-border rounded-lg p-4">
                  <div
                    className="flex items-center justify-between mb-3 cursor-pointer hover:text-primary"
                    onClick={() => navigate(`/jobs/${relatedJob.id}`)}
                  >
                    <div>
                      <p className="font-medium text-sm">{relatedJob.problemDescription.substring(0, 50)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(relatedJob.dateOfService).toLocaleDateString()} · {jobAttachments.length} files
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {jobAttachments.map((attachment) => {
                      const isImage = attachment.mimeType.startsWith("image/");
                      const Icon = getAttachmentIcon(attachment.type);
                      return (
                        <div
                          key={attachment.id}
                          className="relative group cursor-pointer"
                          onClick={() => isImage && setPreviewAttachment(attachment)}
                        >
                          {isImage ? (
                            <img
                              src={attachmentUrls[attachment.id] || ""}
                              alt={attachment.name}
                              className="w-full h-16 object-cover rounded border border-border"
                            />
                          ) : (
                            <div className="w-full h-16 flex flex-col items-center justify-center bg-secondary/50 rounded border border-border">
                              <Icon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          {isImage && (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                              <ZoomIn className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground truncate mt-1 text-center">
                            {attachment.type.replace("-", " ")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            No attachments yet. Add photos and documents to jobs to see them here.
          </p>
        )}
      </div>

      {/* Invoice History */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Invoice History</h3>
        {customerInvoices.length > 0 ? (
          <div className="space-y-3">
            {customerInvoices
              .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
              .map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                  className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg cursor-pointer hover:bg-secondary/70 transition-colors"
                >
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(invoice.invoiceDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${centsToDollars(invoice.totalCents)}</p>
                    <span
                      className={`status-badge ${
                        invoice.paymentStatus === "paid"
                          ? "status-paid"
                          : invoice.paymentStatus === "partial"
                          ? "status-partial"
                          : "status-unpaid"
                      }`}
                    >
                      {invoice.paymentStatus}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No invoices yet</p>
        )}
      </div>

      <CustomerDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        customer={customer}
      />

      <JobDialog
        open={isJobDialogOpen}
        onOpenChange={setIsJobDialogOpen}
        customerId={customer.id}
      />

      {selectedJobForReminder && (
        <ReminderDialog
          open={isReminderDialogOpen}
          onOpenChange={(open) => {
            setIsReminderDialogOpen(open);
            if (!open) setSelectedJobForReminder(null);
          }}
          jobId={selectedJobForReminder}
          customerId={customer.id}
          existingReminders={getRemindersByCustomer(customer.id).filter(r => r.jobId === selectedJobForReminder)}
        />
      )}

      {/* Image Preview Modal */}
      {previewAttachment && (
        <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
          <DialogContent className="bg-card border-border max-w-4xl p-0">
            <div className="relative">
              <img
                src={attachmentUrls[previewAttachment.id] || ""}
                alt={previewAttachment.name}
                className="w-full max-h-[80vh] object-contain"
              />
              <div className="p-4 bg-secondary/50">
                <p className="text-sm font-medium">{previewAttachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {previewAttachment.type.replace("-", " ")} · Uploaded: {new Date(previewAttachment.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
