import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Mail, Phone, MapPin } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { centsToDollars } from "@/lib/db";
import { Customer } from "@/types";

export default function Customers() {
  const navigate = useNavigate();
  const { customers, jobs, invoices } = useStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const activeCustomers = customers.filter((c) => !c.archived);

  const customersWithStats = useMemo(() => {
    return activeCustomers.map((customer) => {
      const customerJobs = jobs.filter((j) => j.customerId === customer.id);
      const customerInvoices = invoices.filter((i) => i.customerId === customer.id);
      
      const totalSpend = customerInvoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
      const outstanding = customerInvoices
        .filter((inv) => inv.paymentStatus !== "paid")
        .reduce((sum, inv) => sum + (inv.totalCents - inv.paidAmountCents), 0);
      
      const lastJob = customerJobs
        .sort((a, b) => new Date(b.dateOfService).getTime() - new Date(a.dateOfService).getTime())[0];

      return {
        ...customer,
        jobCount: customerJobs.length,
        totalSpend,
        outstanding,
        lastServiceDate: lastJob?.dateOfService || null,
      };
    });
  }, [activeCustomers, jobs, invoices]);

  const columns = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      render: (customer: typeof customersWithStats[0]) => (
        <div>
          <p className="font-medium">{customer.name}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {customer.email}
              </span>
            )}
            {customer.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {customer.phone}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "address",
      header: "Location",
      render: (customer: typeof customersWithStats[0]) =>
        customer.address ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {customer.address.substring(0, 30)}
            {customer.address.length > 30 && "..."}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "jobCount",
      header: "Jobs",
      sortable: true,
      render: (customer: typeof customersWithStats[0]) => (
        <span className="text-sm">{customer.jobCount}</span>
      ),
    },
    {
      key: "totalSpend",
      header: "Total Spend",
      sortable: true,
      render: (customer: typeof customersWithStats[0]) => (
        <span className="font-medium text-success">
          ${centsToDollars(customer.totalSpend)}
        </span>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      sortable: true,
      render: (customer: typeof customersWithStats[0]) => (
        <span
          className={
            customer.outstanding > 0 ? "text-warning font-medium" : "text-muted-foreground"
          }
        >
          ${centsToDollars(customer.outstanding)}
        </span>
      ),
    },
    {
      key: "lastServiceDate",
      header: "Last Service",
      sortable: true,
      render: (customer: typeof customersWithStats[0]) =>
        customer.lastServiceDate ? (
          <span className="text-sm">
            {new Date(customer.lastServiceDate).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "tags",
      header: "Tags",
      render: (customer: typeof customersWithStats[0]) => (
        <div className="flex flex-wrap gap-1">
          {customer.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-secondary rounded-full text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {customer.tags.length > 2 && (
            <span className="px-2 py-0.5 text-xs bg-secondary rounded-full text-muted-foreground">
              +{customer.tags.length - 2}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Customers"
        description="Manage your customer relationships"
        actions={
          <button
            onClick={() => setIsDialogOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        }
      />

      <DataTable
        data={customersWithStats}
        columns={columns}
        keyField="id"
        searchable
        searchPlaceholder="Search customers..."
        onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
        emptyMessage="No customers yet. Add your first customer to get started."
      />

      <CustomerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </AppLayout>
  );
}
