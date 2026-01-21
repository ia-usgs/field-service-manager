import { useMemo, useState } from "react";
import { Download, TrendingUp, TrendingDown, Users, Briefcase, DollarSign, Calendar, Package, Clock, ChevronDown, FileSpreadsheet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
import { formatPhoneNumber } from "@/lib/utils";
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
      (job.parts || []).forEach((part) => {
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
      (job.parts || []).forEach((part) => {
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
      const partsTotal = (job.parts || []).reduce((p, part) => p + (part.quantity * part.unitPriceCents), 0);
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
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }
    try {
      const headers = Object.keys(data[0]).join(",");
      const rows = data.map((row) => 
        Object.values(row).map(val => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(",")
      ).join("\n");
      const csv = `${headers}\n${rows}`;
      
      const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    }
  };

  // Comprehensive export data generators
  const getInvoicesExportData = () => filteredInvoices.map(inv => {
    const customer = customers.find(c => c.id === inv.customerId);
    const job = jobs.find(j => j.id === inv.jobId);
    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      dueDate: inv.dueDate,
      customer: customer?.name || "Unknown",
      customerEmail: customer?.email || "",
      jobDescription: job?.problemDescription || "",
      laborTotal: centsToDollars(inv.laborTotalCents),
      partsTotal: centsToDollars(inv.partsTotalCents),
      passThroughParts: centsToDollars(inv.passThroughPartsCents || 0),
      miscFees: centsToDollars(inv.miscFeesCents),
      subtotal: centsToDollars(inv.subtotalCents),
      tax: centsToDollars(inv.taxCents),
      total: centsToDollars(inv.totalCents),
      paidAmount: centsToDollars(inv.paidAmountCents),
      outstanding: centsToDollars(Math.max(0, inv.totalCents - inv.paidAmountCents)),
      incomeAmount: centsToDollars(inv.incomeAmountCents || inv.totalCents),
      status: inv.paymentStatus,
    };
  });

  const getJobsExportData = () => filteredJobs.map(job => {
    const customer = customers.find(c => c.id === job.customerId);
    const laborTotal = job.laborHours * job.laborRateCents;
    const partsTotal = (job.parts || []).reduce((sum, p) => sum + (p.quantity * p.unitPriceCents), 0);
    const partsCost = (job.parts || []).reduce((sum, p) => p.source !== "customer-provided" ? sum + (p.quantity * p.unitCostCents) : sum, 0);
    const partsProfit = (job.parts || []).reduce((sum, p) => p.source !== "customer-provided" ? sum + (p.quantity * (p.unitPriceCents - p.unitCostCents)) : sum, 0);
    return {
      dateOfService: job.dateOfService,
      customer: customer?.name || "Unknown",
      problemDescription: job.problemDescription,
      workPerformed: job.workPerformed,
      status: job.status,
      laborHours: job.laborHours,
      laborRate: centsToDollars(job.laborRateCents),
      laborTotal: centsToDollars(laborTotal),
      partsCount: (job.parts || []).length,
      partsRevenue: centsToDollars(partsTotal),
      partsCost: centsToDollars(partsCost),
      partsProfit: centsToDollars(partsProfit),
      miscFees: centsToDollars(job.miscFeesCents),
      miscFeesDescription: job.miscFeesDescription || "",
      taxRate: job.taxRate,
      technicianNotes: job.technicianNotes || "",
    };
  });

  const getExpensesExportData = () => filteredExpenses.map(exp => ({
    date: exp.date,
    category: exp.category,
    description: exp.description,
    vendor: exp.vendor || "",
    amount: centsToDollars(exp.amountCents),
    notes: exp.notes || "",
  }));

  const getCustomersExportData = () => {
    return customers.filter(c => !c.archived).map(customer => {
      const customerInvoices = filteredInvoices.filter(inv => inv.customerId === customer.id);
      const customerJobs = filteredJobs.filter(j => j.customerId === customer.id);
      const totalRevenue = customerInvoices.reduce((sum, inv) => {
        const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
        return sum + Math.round(inv.paidAmountCents * incomeRatio);
      }, 0);
      const outstandingAmount = customerInvoices.reduce((sum, inv) => sum + Math.max(0, inv.totalCents - inv.paidAmountCents), 0);
      return {
        name: customer.name,
        email: customer.email || "",
        phone: formatPhoneNumber(customer.phone),
        address: customer.address || "",
        totalJobs: customerJobs.length,
        completedJobs: customerJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length,
        totalInvoices: customerInvoices.length,
        totalRevenue: centsToDollars(totalRevenue),
        outstanding: centsToDollars(outstandingAmount),
        createdAt: customer.createdAt,
      };
    });
  };

  const getPaymentsExportData = () => {
    return payments.filter(p => {
      if (!dateFilter) return true;
      return new Date(p.date) >= dateFilter;
    }).map(payment => {
      const invoice = invoices.find(inv => inv.id === payment.invoiceId);
      const customer = invoice ? customers.find(c => c.id === invoice.customerId) : null;
      return {
        date: payment.date,
        invoiceNumber: invoice?.invoiceNumber || "Unknown",
        customer: customer?.name || "Unknown",
        amount: centsToDollars(payment.amountCents),
        type: payment.type,
        method: payment.method,
        notes: payment.notes || "",
      };
    });
  };

  const getMonthlyTrendsExportData = () => monthlyTrends.map(m => ({
    month: m.month,
    revenue: m.revenue.toFixed(2),
    expenses: m.expenses.toFixed(2),
    profit: m.profit.toFixed(2),
    jobsCount: m.jobs,
  }));

  const getPartsExportData = () => {
    const allParts: any[] = [];
    filteredJobs.forEach(job => {
      const customer = customers.find(c => c.id === job.customerId);
      (job.parts || []).forEach(part => {
        allParts.push({
          jobDate: job.dateOfService,
          customer: customer?.name || "Unknown",
          jobDescription: job.problemDescription,
          partName: part.name,
          source: part.source,
          quantity: part.quantity,
          unitCost: centsToDollars(part.unitCostCents),
          unitPrice: centsToDollars(part.unitPriceCents),
          totalCost: centsToDollars(part.quantity * part.unitCostCents),
          totalPrice: centsToDollars(part.quantity * part.unitPriceCents),
          profit: part.source !== "customer-provided" 
            ? centsToDollars(part.quantity * (part.unitPriceCents - part.unitCostCents)) 
            : "0.00",
        });
      });
    });
    return allParts;
  };

  const getSummaryExportData = () => [{
    dateRange: dateRange === "all" ? "All Time" : `Last ${dateRange.replace("m", " months")}`,
    totalRevenue: centsToDollars(totalRevenue),
    totalExpenses: centsToDollars(totalExpenses),
    netProfit: centsToDollars(netProfit),
    profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) + "%" : "0%",
    totalJobs: filteredJobs.length,
    completedJobs: completedJobsCount,
    avgJobValue: centsToDollars(avgJobValue),
    totalInvoices: filteredInvoices.length,
    paidInvoices: filteredInvoices.filter(i => i.paymentStatus === "paid").length,
    collectionRate: collectionRate.toFixed(1) + "%",
    outstandingBalance: centsToDollars(outstandingBalance),
    partsCost: centsToDollars(partsProfit.cost),
    partsRevenue: centsToDollars(partsProfit.revenue),
    partsProfit: centsToDollars(partsProfit.profit),
    partsMargin: partsProfit.margin.toFixed(1) + "%",
    laborRevenue: centsToDollars(revenueBreakdown.find(r => r.name === "Labor")?.value ? revenueBreakdown.find(r => r.name === "Labor")!.value * 100 : 0),
    miscFeesRevenue: centsToDollars(revenueBreakdown.find(r => r.name === "Misc Fees")?.value ? revenueBreakdown.find(r => r.name === "Misc Fees")!.value * 100 : 0),
    activeCustomers: customers.filter(c => !c.archived).length,
  }];

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="btn-secondary flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Export Data</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportCSV(getSummaryExportData(), "summary.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Summary Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(getMonthlyTrendsExportData(), "monthly-trends.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Monthly Trends
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportCSV(getInvoicesExportData(), "invoices.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Invoices (Detailed)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(getJobsExportData(), "jobs.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Jobs (Detailed)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(getExpensesExportData(), "expenses.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Expenses
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(getPaymentsExportData(), "payments.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Payments
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportCSV(getCustomersExportData(), "customers.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Customers
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV(getPartsExportData(), "parts.csv")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Parts Used
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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