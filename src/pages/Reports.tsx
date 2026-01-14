import { useMemo, useState } from "react";
import { Download, TrendingUp, TrendingDown, Users, Briefcase, DollarSign, Calendar, Package, Clock } from "lucide-react";
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
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { centsToDollars } from "@/lib/db";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";

export default function Reports() {
  const { invoices, expenses, customers, jobs, payments } = useStore();
  const [dateRange, setDateRange] = useState<"3m" | "6m" | "12m" | "all">("12m");

  // Filter data by date range
  const dateFilter = useMemo(() => {
    const now = new Date();
    if (dateRange === "all") return null;
    const months = dateRange === "3m" ? 3 : dateRange === "6m" ? 6 : 12;
    return subMonths(now, months);
  }, [dateRange]);

  const filteredInvoices = useMemo(() => {
    if (!dateFilter) return invoices;
    return invoices.filter(inv => new Date(inv.invoiceDate) >= dateFilter);
  }, [invoices, dateFilter]);

  const filteredExpenses = useMemo(() => {
    if (!dateFilter) return expenses;
    return expenses.filter(exp => new Date(exp.date) >= dateFilter);
  }, [expenses, dateFilter]);

  const filteredJobs = useMemo(() => {
    if (!dateFilter) return jobs;
    return jobs.filter(job => new Date(job.dateOfService) >= dateFilter);
  }, [jobs, dateFilter]);

  // Revenue by customer
  const revenueByCustomer = useMemo(() => {
    const customerRevenue: Record<string, number> = {};
    filteredInvoices.forEach((inv) => {
      const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
      const incomeAmount = Math.round(inv.paidAmountCents * incomeRatio);
      customerRevenue[inv.customerId] = (customerRevenue[inv.customerId] || 0) + incomeAmount;
    });
    return Object.entries(customerRevenue)
      .map(([customerId, revenue]) => ({
        name: customers.find((c) => c.id === customerId)?.name || "Unknown",
        revenue: revenue / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredInvoices, customers]);

  // Expenses by category
  const expensesByCategory = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredExpenses.forEach((exp) => {
      categories[exp.category] = (categories[exp.category] || 0) + exp.amountCents;
    });
    return Object.entries(categories).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: value / 100,
    }));
  }, [filteredExpenses]);

  // Monthly trends
  const monthlyTrends = useMemo(() => {
    const months: Record<string, { revenue: number; expenses: number; profit: number; jobs: number }> = {};
    
    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "MMM yyyy");
      months[key] = { revenue: 0, expenses: 0, profit: 0, jobs: 0 };
    }

    // Aggregate revenue
    invoices.forEach((inv) => {
      const date = new Date(inv.invoiceDate);
      const key = format(date, "MMM yyyy");
      if (months[key]) {
        const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
        months[key].revenue += Math.round(inv.paidAmountCents * incomeRatio) / 100;
      }
    });

    // Aggregate expenses
    expenses.forEach((exp) => {
      const date = new Date(exp.date);
      const key = format(date, "MMM yyyy");
      if (months[key]) {
        months[key].expenses += exp.amountCents / 100;
      }
    });

    // Aggregate jobs
    jobs.forEach((job) => {
      const date = new Date(job.dateOfService);
      const key = format(date, "MMM yyyy");
      if (months[key]) {
        months[key].jobs += 1;
      }
    });

    // Calculate profit
    Object.keys(months).forEach((key) => {
      months[key].profit = months[key].revenue - months[key].expenses;
    });

    return Object.entries(months).map(([month, data]) => ({
      month,
      ...data,
    }));
  }, [invoices, expenses, jobs]);

  // Job status breakdown
  const jobStatusBreakdown = useMemo(() => {
    const statuses: Record<string, number> = {};
    filteredJobs.forEach((job) => {
      statuses[job.status] = (statuses[job.status] || 0) + 1;
    });
    return Object.entries(statuses).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace("-", " "),
      value: count,
    }));
  }, [filteredJobs]);

  // Labor vs Parts revenue
  const revenueBreakdown = useMemo(() => {
    let laborRevenue = 0;
    let partsRevenue = 0;
    let miscRevenue = 0;

    filteredJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).forEach((job) => {
      laborRevenue += job.laborHours * job.laborRateCents;
      job.parts.forEach((part) => {
        if (part.source !== "customer-provided") {
          partsRevenue += part.quantity * part.unitPriceCents;
        }
      });
      miscRevenue += job.miscFeesCents;
    });

    return [
      { name: "Labor", value: laborRevenue / 100 },
      { name: "Parts", value: partsRevenue / 100 },
      { name: "Misc Fees", value: miscRevenue / 100 },
    ].filter(item => item.value > 0);
  }, [filteredJobs]);

  // Parts profit analysis
  const partsProfit = useMemo(() => {
    let totalCost = 0;
    let totalRevenue = 0;

    filteredJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).forEach((job) => {
      job.parts.forEach((part) => {
        if (part.source !== "customer-provided") {
          totalCost += part.quantity * part.unitCostCents;
          totalRevenue += part.quantity * part.unitPriceCents;
        }
      });
    });

    return {
      cost: totalCost,
      revenue: totalRevenue,
      profit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0,
    };
  }, [filteredJobs]);

  // Average job value
  const avgJobValue = useMemo(() => {
    const completedJobs = filteredJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status));
    if (completedJobs.length === 0) return 0;
    const totalValue = completedJobs.reduce((sum, job) => {
      const laborTotal = job.laborHours * job.laborRateCents;
      const partsTotal = job.parts.reduce((p, part) => p + (part.quantity * part.unitPriceCents), 0);
      const subtotal = laborTotal + partsTotal + job.miscFeesCents;
      const tax = Math.round(subtotal * (job.taxRate / 100));
      return sum + subtotal + tax;
    }, 0);
    return totalValue / completedJobs.length;
  }, [filteredJobs]);

  // Payment collection rate
  const collectionRate = useMemo(() => {
    const totalBilled = filteredInvoices.reduce((sum, inv) => sum + inv.totalCents, 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
    return totalBilled > 0 ? (totalPaid / totalBilled * 100) : 0;
  }, [filteredInvoices]);

  // Outstanding balance
  const outstandingBalance = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => {
      const outstanding = inv.totalCents - inv.paidAmountCents;
      return sum + (outstanding > 0 ? outstanding : 0);
    }, 0);
  }, [filteredInvoices]);

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

  // Calculate totals
  const totalRevenue = filteredInvoices.reduce((sum, inv) => {
    const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
    return sum + Math.round(inv.paidAmountCents * incomeRatio);
  }, 0);
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amountCents, 0);
  const netProfit = totalRevenue - totalExpenses;
  const completedJobsCount = filteredJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length;

  return (
    <AppLayout>
      <PageHeader
        title="Reports"
        description="Financial analytics and business insights"
        actions={
          <div className="flex gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="input-field text-sm"
            >
              <option value="3m">Last 3 Months</option>
              <option value="6m">Last 6 Months</option>
              <option value="12m">Last 12 Months</option>
              <option value="all">All Time</option>
            </select>
            <button
              onClick={() => exportCSV(filteredInvoices.map(inv => ({
                invoiceNumber: inv.invoiceNumber,
                date: inv.invoiceDate,
                total: centsToDollars(inv.totalCents),
                paid: centsToDollars(inv.paidAmountCents),
                status: inv.paymentStatus,
              })), "invoices.csv")}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        }
      />

      {/* Summary Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard
          title="Total Revenue"
          value={`$${centsToDollars(totalRevenue)}`}
          subtitle="Income collected"
          icon={DollarSign}
          variant="success"
        />
        <StatCard
          title="Total Expenses"
          value={`$${centsToDollars(totalExpenses)}`}
          subtitle="Business costs"
          icon={TrendingDown}
          variant="destructive"
        />
        <StatCard
          title="Net Profit"
          value={`$${centsToDollars(netProfit)}`}
          subtitle={netProfit >= 0 ? "Positive margin" : "Loss"}
          icon={netProfit >= 0 ? TrendingUp : TrendingDown}
          variant={netProfit >= 0 ? "success" : "destructive"}
        />
        <StatCard
          title="Jobs Completed"
          value={completedJobsCount}
          subtitle={`${filteredJobs.length} total jobs`}
          icon={Briefcase}
          variant="primary"
        />
      </div>

      {/* Summary Cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Avg Job Value"
          value={`$${centsToDollars(avgJobValue)}`}
          subtitle="Per completed job"
          icon={Calendar}
        />
        <StatCard
          title="Collection Rate"
          value={`${collectionRate.toFixed(1)}%`}
          subtitle="Of invoiced amount"
          icon={DollarSign}
          variant={collectionRate >= 90 ? "success" : collectionRate >= 70 ? "warning" : "destructive"}
        />
        <StatCard
          title="Outstanding"
          value={`$${centsToDollars(outstandingBalance)}`}
          subtitle="Unpaid invoices"
          icon={Clock}
          variant={outstandingBalance > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Parts Margin"
          value={`${partsProfit.margin.toFixed(1)}%`}
          subtitle={`$${centsToDollars(partsProfit.profit)} profit`}
          icon={Package}
          variant={partsProfit.margin >= 25 ? "success" : "warning"}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Revenue Trend */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Monthly Revenue & Profit Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(215, 20%, 65%)" fontSize={10} />
                <YAxis stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} />
                <Area type="monotone" dataKey="revenue" stackId="1" stroke="hsl(199, 89%, 48%)" fill="hsl(199, 89%, 48%)" fillOpacity={0.3} name="Revenue" />
                <Area type="monotone" dataKey="profit" stackId="2" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.3} name="Profit" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Jobs Per Month */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Jobs Per Month</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(215, 20%, 65%)" fontSize={10} />
                <YAxis stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} />
                <Bar dataKey="jobs" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Customer */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Revenue by Customer (Top 10)</h3>
          <div className="h-64">
            {revenueByCustomer.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByCustomer} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                  <XAxis type="number" stroke="hsl(215, 20%, 65%)" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="hsl(215, 20%, 65%)" fontSize={10} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">No revenue data</div>
            )}
          </div>
        </div>

        {/* Expense Breakdown */}
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

        {/* Revenue Breakdown */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Revenue Sources</h3>
          <div className="h-64">
            {revenueBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={revenueBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {revenueBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">No revenue data</div>
            )}
          </div>
        </div>

        {/* Job Status */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Job Status Breakdown</h3>
          <div className="h-64">
            {jobStatusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={jobStatusBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {jobStatusBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 13%)", border: "1px solid hsl(217, 33%, 22%)", borderRadius: "8px" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">No job data</div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers Table */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Top Customers</h3>
          {revenueByCustomer.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Customer</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByCustomer.slice(0, 5).map((customer, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-2 px-3">{customer.name}</td>
                      <td className="py-2 px-3 text-right font-medium text-success">${customer.revenue.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {((customer.revenue / (totalRevenue / 100)) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No customer data</div>
          )}
        </div>

        {/* Expense Categories Table */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Expense Categories</h3>
          {expensesByCategory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Category</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesByCategory.sort((a, b) => b.value - a.value).map((cat, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-2 px-3">{cat.name}</td>
                      <td className="py-2 px-3 text-right font-medium text-destructive">${cat.value.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {((cat.value / (totalExpenses / 100)) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No expense data</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}