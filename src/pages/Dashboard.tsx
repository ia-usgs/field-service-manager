import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  Users,
  Briefcase,
  FileText,
  AlertCircle,
  Bell,
  Check,
  Calendar,
} from "lucide-react";
import {
  LineChart,
  Line,
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
import { StatCard } from "@/components/ui/stat-card";
import { centsToDollars } from "@/lib/db";

export default function Dashboard() {
  const navigate = useNavigate();
  const { invoices, expenses, customers, jobs, isLoading, initialize, getUpcomingReminders, completeReminder } = useStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisYear = String(now.getFullYear());

    // Revenue calculations - use incomeAmountCents to exclude pass-through parts
    // For legacy invoices without incomeAmountCents, fall back to paidAmountCents
    const getIncomeFromInvoice = (inv: typeof invoices[0]) => {
      // Calculate income-based paid amount (proportional to what was paid)
      const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
      return Math.round(inv.paidAmountCents * incomeRatio);
    };

    const totalRevenue = invoices.reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    
    const revenueToday = invoices
      .filter((inv) => inv.paymentDate?.startsWith(today))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);

    const revenueThisMonth = invoices
      .filter((inv) => inv.paymentDate?.startsWith(thisMonth))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);

    const revenueThisYear = invoices
      .filter((inv) => inv.paymentDate?.startsWith(thisYear))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);

    // Expenses
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);

    // Net profit
    const netProfit = totalRevenue - totalExpenses;

    // Outstanding invoices
    const outstandingInvoices = invoices.filter((inv) => inv.paymentStatus !== "paid");
    const outstandingCount = outstandingInvoices.length;
    const outstandingAmount = outstandingInvoices.reduce(
      (sum, inv) => sum + (inv.totalCents - inv.paidAmountCents),
      0
    );

    // Average job value
    const completedJobs = jobs.filter((j) => ["invoiced", "paid"].includes(j.status));
    const avgJobValue =
      completedJobs.length > 0
        ? invoices.reduce((sum, inv) => sum + inv.totalCents, 0) / completedJobs.length
        : 0;

    // Top customers - based on actual income, not pass-through
    const customerSpend: Record<string, number> = {};
    invoices.forEach((inv) => {
      customerSpend[inv.customerId] = (customerSpend[inv.customerId] || 0) + getIncomeFromInvoice(inv);
    });
    const topCustomers = Object.entries(customerSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([customerId, spend]) => ({
        customer: customers.find((c) => c.id === customerId),
        spend,
      }));

    return {
      totalRevenue,
      revenueToday,
      revenueThisMonth,
      revenueThisYear,
      totalExpenses,
      netProfit,
      outstandingCount,
      outstandingAmount,
      avgJobValue,
      topCustomers,
      totalCustomers: customers.filter((c) => !c.archived).length,
      totalJobs: jobs.length,
    };
  }, [invoices, expenses, customers, jobs]);

  // Monthly revenue trend data
  const monthlyData = useMemo(() => {
    const months: Record<string, { revenue: number; expenses: number }> = {};
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months[key] = { revenue: 0, expenses: 0 };
    }

    invoices.forEach((inv) => {
      if (inv.paymentDate) {
        const key = inv.paymentDate.substring(0, 7);
        if (months[key]) {
          // Use income ratio for revenue calculation
          const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
          months[key].revenue += Math.round(inv.paidAmountCents * incomeRatio);
        }
      }
    });

    expenses.forEach((exp) => {
      const key = exp.date.substring(0, 7);
      if (months[key]) {
        months[key].expenses += exp.amountCents;
      }
    });

    return Object.entries(months).map(([month, data]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", {
        month: "short",
      }),
      revenue: data.revenue / 100,
      expenses: data.expenses / 100,
    }));
  }, [invoices, expenses]);

  // Expense breakdown by category
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Business overview and key metrics"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={`$${centsToDollars(stats.totalRevenue)}`}
          subtitle="Lifetime earnings"
          icon={DollarSign}
          variant="primary"
        />
        <StatCard
          title="This Month"
          value={`$${centsToDollars(stats.revenueThisMonth)}`}
          subtitle={`Today: $${centsToDollars(stats.revenueToday)}`}
          icon={TrendingUp}
          variant="success"
        />
        <StatCard
          title="Outstanding"
          value={`$${centsToDollars(stats.outstandingAmount)}`}
          subtitle={`${stats.outstandingCount} unpaid invoices`}
          icon={AlertCircle}
          variant="warning"
        />
        <StatCard
          title="Net Profit"
          value={`$${centsToDollars(stats.netProfit)}`}
          subtitle={`Expenses: $${centsToDollars(stats.totalExpenses)}`}
          icon={DollarSign}
          variant={stats.netProfit >= 0 ? "success" : "destructive"}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Customers"
          value={stats.totalCustomers}
          icon={Users}
        />
        <StatCard
          title="Total Jobs"
          value={stats.totalJobs}
          icon={Briefcase}
        />
        <StatCard
          title="Avg Job Value"
          value={`$${centsToDollars(stats.avgJobValue)}`}
          icon={FileText}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue Trend */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Revenue Trend (6 Months)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <YAxis stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 13%)",
                    border: "1px solid hsl(217, 33%, 22%)",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(199, 89%, 48%)"
                  strokeWidth={2}
                  dot={{ fill: "hsl(199, 89%, 48%)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue vs Expenses */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Revenue vs Expenses</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <YAxis stroke="hsl(215, 20%, 65%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 13%)",
                    border: "1px solid hsl(217, 33%, 22%)",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense Breakdown */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Expense Breakdown</h3>
          <div className="h-64">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(222, 47%, 13%)",
                      border: "1px solid hsl(217, 33%, 22%)",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Amount"]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No expense data yet
              </div>
            )}
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Top 5 Customers</h3>
          {stats.topCustomers.length > 0 ? (
            <div className="space-y-3">
              {stats.topCustomers.map(({ customer, spend }, index) => (
                <div
                  key={customer?.id || index}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className="font-medium">
                      {customer?.name || "Unknown Customer"}
                    </span>
                  </div>
                  <span className="font-semibold text-success">
                    ${centsToDollars(spend)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No customer data yet
            </div>
          )}
        </div>

        {/* Upcoming Reminders */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Upcoming Reminders
          </h3>
          {(() => {
            const upcomingReminders = getUpcomingReminders(30);
            const overdueReminders = getUpcomingReminders(0).filter(
              (r) => new Date(r.dueDate) < new Date()
            );
            const allReminders = [...overdueReminders, ...upcomingReminders.filter(
              (r) => new Date(r.dueDate) >= new Date()
            )].slice(0, 5);

            if (allReminders.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Calendar className="w-12 h-12 mb-2 opacity-50" />
                  <p>No upcoming reminders</p>
                  <p className="text-sm">Add reminders from job details</p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {allReminders.map((reminder) => {
                  const customer = customers.find((c) => c.id === reminder.customerId);
                  const isOverdue = new Date(reminder.dueDate) < new Date();
                  const daysUntil = Math.ceil(
                    (new Date(reminder.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );

                  return (
                    <div
                      key={reminder.id}
                      className={`p-3 rounded-lg border ${
                        isOverdue
                          ? "bg-destructive/10 border-destructive/20"
                          : "bg-secondary/50 border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
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
                              {reminder.type.replace("-", " ")}
                            </span>
                            {isOverdue && (
                              <span className="text-xs text-destructive font-medium">
                                OVERDUE
                              </span>
                            )}
                          </div>
                          <p className="font-medium mt-1 truncate">{reminder.title}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {customer?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isOverdue
                              ? `${Math.abs(daysUntil)} days overdue`
                              : daysUntil === 0
                              ? "Due today"
                              : `Due in ${daysUntil} days`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => completeReminder(reminder.id)}
                            className="p-1.5 hover:bg-success/10 rounded text-success"
                            title="Mark complete"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/jobs/${reminder.jobId}`)}
                            className="p-1.5 hover:bg-primary/10 rounded text-primary"
                            title="View job"
                          >
                            <Briefcase className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </AppLayout>
  );
}
