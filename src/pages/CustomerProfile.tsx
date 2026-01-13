import { useState } from "react";
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
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/ui/stat-card";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { JobDialog } from "@/components/jobs/JobDialog";
import { centsToDollars } from "@/lib/db";

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, jobs, invoices } = useStore();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);

  const customer = customers.find((c) => c.id === id);

  if (!customer) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Customer not found</p>
        </div>
      </AppLayout>
    );
  }

  const customerJobs = jobs.filter((j) => j.customerId === id);
  const customerInvoices = invoices.filter((i) => i.customerId === id);

  const totalSpend = customerInvoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
  const outstanding = customerInvoices
    .filter((inv) => inv.paymentStatus !== "paid")
    .reduce((sum, inv) => sum + (inv.totalCents - inv.paidAmountCents), 0);
  const avgJobValue =
    customerInvoices.length > 0
      ? customerInvoices.reduce((sum, inv) => sum + inv.totalCents, 0) / customerInvoices.length
      : 0;

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
    </AppLayout>
  );
}
