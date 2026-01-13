import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Edit, FileText, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { JobDialog } from "@/components/jobs/JobDialog";
import { centsToDollars } from "@/lib/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { jobs, customers, invoices, deleteJob } = useStore();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const job = jobs.find((j) => j.id === id);
  const customer = job ? customers.find((c) => c.id === job.customerId) : null;
  const invoice = job?.invoiceId ? invoices.find((i) => i.id === job.invoiceId) : null;

  if (!job) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Job not found</p>
        </div>
      </AppLayout>
    );
  }

  const laborTotal = job.laborHours * job.laborRateCents;
  const partsTotal = job.parts.reduce(
    (sum, part) => sum + part.quantity * part.unitPriceCents,
    0
  );
  const subtotal = laborTotal + partsTotal + job.miscFeesCents;
  const tax = Math.round(subtotal * (job.taxRate / 100));
  const total = subtotal + tax;

  const statusColors: Record<string, string> = {
    quoted: "status-quoted",
    "in-progress": "status-in-progress",
    completed: "status-completed",
    invoiced: "status-completed",
    paid: "status-paid",
  };

  const handleDelete = async () => {
    if (job.status === "invoiced" || job.status === "paid") {
      return; // Can't delete invoiced/paid jobs
    }
    await deleteJob(job.id);
    navigate("/jobs");
  };

  const canDelete = job.status !== "invoiced" && job.status !== "paid";

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/jobs")}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Job Details</h1>
            <span className={`status-badge ${statusColors[job.status]}`}>
              {job.status.replace("-", " ")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(job.dateOfService).toLocaleDateString()} •{" "}
            <button
              onClick={() => navigate(`/customers/${customer?.id}`)}
              className="text-primary hover:underline"
            >
              {customer?.name || "Unknown Customer"}
            </button>
          </p>
        </div>
        {canDelete && (
          <button
            onClick={() => setIsDeleteDialogOpen(true)}
            className="btn-secondary flex items-center gap-2 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
        <button
          onClick={() => setIsEditDialogOpen(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Edit className="w-4 h-4" />
          Edit
        </button>
        {invoice && (
          <button
            onClick={() => navigate(`/invoices/${invoice.id}`)}
            className="btn-primary flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View Invoice
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Job Details */}
        <div className="space-y-6">
          {/* Problem Description */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-3">Problem Description</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {job.problemDescription}
            </p>
          </div>

          {/* Work Performed */}
          {job.workPerformed && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-3">Work Performed</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {job.workPerformed}
              </p>
            </div>
          )}

          {/* Technician Notes */}
          {job.technicianNotes && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-3">Technician Notes</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {job.technicianNotes}
              </p>
            </div>
          )}
        </div>

        {/* Right Column - Pricing */}
        <div className="space-y-6">
          {/* Labor */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Labor</h3>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {job.laborHours} hours @ ${centsToDollars(job.laborRateCents)}/hr
              </span>
              <span className="font-medium">${centsToDollars(laborTotal)}</span>
            </div>
          </div>

          {/* Parts */}
          {job.parts.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4">Parts</h3>
              <div className="space-y-2">
                {job.parts.map((part) => (
                  <div key={part.id} className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {part.name} (x{part.quantity})
                    </span>
                    <span className="font-medium">
                      ${centsToDollars(part.quantity * part.unitPriceCents)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span>Parts Total</span>
                  <span className="font-medium">${centsToDollars(partsTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Misc Fees */}
          {job.miscFeesCents > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4">Miscellaneous Fees</h3>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {job.miscFeesDescription || "Additional fees"}
                </span>
                <span className="font-medium">${centsToDollars(job.miscFeesCents)}</span>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${centsToDollars(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({job.taxRate}%)</span>
                <span>${centsToDollars(tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-border pt-2">
                <span>Total</span>
                <span className="text-primary">${centsToDollars(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <JobDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        job={job}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this job? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
