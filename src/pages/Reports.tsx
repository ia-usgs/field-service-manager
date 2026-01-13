import { useMemo } from "react";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { centsToDollars } from "@/lib/db";

export default function Reports() {
  const { invoices, expenses, customers } = useStore();

  const revenueByCustomer = useMemo(() => {
    const customerRevenue: Record<string, number> = {};
    invoices.forEach((inv) => {
      customerRevenue[inv.customerId] = (customerRevenue[inv.customerId] || 0) + inv.paidAmountCents;
    });
    return Object.entries(customerRevenue)
      .map(([customerId, revenue]) => ({
        name: customers.find((c) => c.id === customerId)?.name || "Unknown",
        revenue: revenue / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [invoices, customers]);

  const expensesByCategory = useMemo(() => {
    const categories: Record<string, number> = {};
    expenses.forEach((exp) => {
      categories[exp.category] = (categories[exp.category] || 0) + exp.amountCents;
    });
    return Object.entries(categories).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: value / 100,
    }));
  }, [expenses]);

  const COLORS = ["hsl(199, 89%, 48%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)", "hsl(262, 83%, 58%)", "hsl(0, 84%, 60%)"];

  const exportCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {}).join(",");
    const rows = data.map((row) => Object.values(row).join(",")).join("\n");
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);

  return (
    <AppLayout>
      <PageHeader
        title="Reports"
        description="Financial analytics and insights"
        actions={
          <button
            onClick={() => exportCSV(invoices.map(inv => ({
              invoiceNumber: inv.invoiceNumber,
              date: inv.invoiceDate,
              total: centsToDollars(inv.totalCents),
              paid: centsToDollars(inv.paidAmountCents),
              status: inv.paymentStatus,
            })), "invoices.csv")}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Invoices
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold text-success">${centsToDollars(totalRevenue)}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Expenses</p>
          <p className="text-2xl font-bold text-destructive">${centsToDollars(totalExpenses)}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Net Profit</p>
          <p className={`text-2xl font-bold ${totalRevenue - totalExpenses >= 0 ? "text-success" : "text-destructive"}`}>
            ${centsToDollars(totalRevenue - totalExpenses)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Revenue by Customer (Top 10)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByCustomer} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                <XAxis type="number" stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="hsl(215, 20%, 65%)" fontSize={10} width={80} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} />
                <Bar dataKey="revenue" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Expense Breakdown</h3>
          <div className="h-64">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {expensesByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} formatter={(value: number) => [`$${value.toFixed(2)}`, "Amount"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">No expense data</div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
