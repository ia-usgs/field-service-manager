import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { JobDialog } from "@/components/jobs/JobDialog";
import { centsToDollars } from "@/lib/db";
import { Job } from "@/types";
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

export default function Jobs() {
  const { jobs, customers, deleteJob } = useStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter === "all") return true;
      return job.status === statusFilter;
    });
  }, [jobs, statusFilter]);

  const jobsWithCustomer = useMemo(() => {
    return filteredJobs.map((job) => {
      const customer = customers.find((c) => c.id === job.customerId);
      const laborTotal = job.laborHours * job.laborRateCents;
      const partsTotal = (job.parts || []).reduce(
        (sum, part) => sum + part.quantity * part.unitPriceCents,
        0
      );
      const subtotal = laborTotal + partsTotal + job.miscFeesCents;
      const tax = Math.round(subtotal * (job.taxRate / 100));
      const total = subtotal + tax;

      return {
        ...job,
        customerName: customer?.name || "Unknown",
        total,
      };
    });
  }, [filteredJobs, customers]);

  const statusColors: Record<string, string> = {
    quoted: "status-quoted",
    "in-progress": "status-in-progress",
    completed: "status-completed",
    invoiced: "status-completed",
    paid: "status-paid",
  };

  const handleRowClick = (job: typeof jobsWithCustomer[0]) => {
    const fullJob = jobs.find((j) => j.id === job.id);
    if (fullJob) {
      setSelectedJob(fullJob);
      setIsDialogOpen(true);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedJob(null);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, job: typeof jobsWithCustomer[0]) => {
    e.stopPropagation(); // Prevent row click
    const fullJob = jobs.find((j) => j.id === job.id);
    if (fullJob) {
      setJobToDelete(fullJob);
      setIsDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    
    const isInvoicedOrPaid = jobToDelete.status === "invoiced" || jobToDelete.status === "paid";
    await deleteJob(jobToDelete.id, isInvoicedOrPaid);
    
    setIsDeleteDialogOpen(false);
    setJobToDelete(null);
  };

  const isInvoicedOrPaid = jobToDelete?.status === "invoiced" || jobToDelete?.status === "paid";

  const columns = [
    {
      key: "dateOfService",
      header: "Date",
      sortable: true,
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className="text-sm">
          {new Date(job.dateOfService).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      sortable: true,
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className="font-medium">{job.customerName}</span>
      ),
    },
    {
      key: "problemDescription",
      header: "Description",
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className="text-sm text-muted-foreground">
          {job.problemDescription.substring(0, 50)}
          {job.problemDescription.length > 50 && "..."}
        </span>
      ),
    },
    {
      key: "laborHours",
      header: "Hours",
      sortable: true,
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className="text-sm">{job.laborHours}h</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      sortable: true,
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className="font-medium">${centsToDollars(job.total)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (job: typeof jobsWithCustomer[0]) => (
        <span className={`status-badge ${statusColors[job.status]}`}>
          {job.status.replace("-", " ")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (job: typeof jobsWithCustomer[0]) => (
        <button
          onClick={(e) => handleDeleteClick(e, job)}
          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors text-muted-foreground hover:text-destructive"
          title="Delete job"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Jobs"
        description="Track and manage work orders"
        actions={
          <button
            onClick={() => {
              setSelectedJob(null);
              setIsDialogOpen(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Job
          </button>
        }
      />

      {/* Status Filter */}
      <div className="flex gap-2 mb-4">
        {["all", "quoted", "in-progress", "completed", "invoiced", "paid"].map(
          (status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {status === "all" ? "All" : status.replace("-", " ")}
            </button>
          )
        )}
      </div>

      <DataTable
        data={jobsWithCustomer}
        columns={columns}
        keyField="id"
        searchable
        searchPlaceholder="Search jobs..."
        onRowClick={handleRowClick}
        emptyMessage="No jobs found. Create your first job to get started."
      />

      <JobDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        job={selectedJob || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isInvoicedOrPaid ? "⚠️ Delete Invoiced/Paid Job" : "Delete Job"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isInvoicedOrPaid ? (
                <>
                  <span className="text-destructive font-semibold">Warning:</span> This job has been{" "}
                  <strong>{jobToDelete?.status}</strong>. Deleting it will also remove:
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>The associated invoice and payment records</li>
                    <li>All reminders and attachments</li>
                    <li>This action will be logged in the audit trail</li>
                  </ul>
                  <p className="mt-3 font-medium">This cannot be undone. Are you absolutely sure?</p>
                </>
              ) : (
                "Are you sure you want to delete this job? This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isInvoicedOrPaid ? "Yes, Delete Everything" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
