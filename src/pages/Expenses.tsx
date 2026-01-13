import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { ExpenseDialog } from "@/components/expenses/ExpenseDialog";
import { centsToDollars } from "@/lib/db";
import { Expense } from "@/types";

export default function Expenses() {
  const { expenses, deleteExpense } = useStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (categoryFilter === "all") return true;
      return exp.category === categoryFilter;
    });
  }, [expenses, categoryFilter]);

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amountCents, 0);

  const categoryColors: Record<string, string> = {
    parts: "bg-primary/20 text-primary",
    tools: "bg-success/20 text-success",
    consumables: "bg-warning/20 text-warning",
    vehicle: "bg-purple-500/20 text-purple-400",
    fuel: "bg-orange-500/20 text-orange-400",
    misc: "bg-muted text-muted-foreground",
  };

  const columns = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (exp: Expense) => (
        <span className="text-sm">{new Date(exp.date).toLocaleDateString()}</span>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      sortable: true,
      render: (exp: Expense) => <span className="font-medium">{exp.vendor}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (exp: Expense) => (
        <span className="text-sm text-muted-foreground">
          {exp.description.substring(0, 40)}
          {exp.description.length > 40 && "..."}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      render: (exp: Expense) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            categoryColors[exp.category]
          }`}
        >
          {exp.category}
        </span>
      ),
    },
    {
      key: "amountCents",
      header: "Amount",
      sortable: true,
      render: (exp: Expense) => (
        <span className="font-medium text-destructive">
          -${centsToDollars(exp.amountCents)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (exp: Expense) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedExpense(exp);
              setIsDialogOpen(true);
            }}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this expense?")) {
                deleteExpense(exp.id);
              }
            }}
            className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Expenses"
        description="Track parts, tools, and operational costs"
        actions={
          <button
            onClick={() => {
              setSelectedExpense(undefined);
              setIsDialogOpen(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        }
      />

      {/* Summary */}
      <div className="p-4 bg-card border border-border rounded-lg mb-6">
        <p className="text-sm text-muted-foreground">
          {categoryFilter === "all" ? "Total Expenses" : `${categoryFilter} Expenses`}
        </p>
        <p className="text-2xl font-bold text-destructive">
          -${centsToDollars(totalExpenses)}
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "parts", "tools", "consumables", "vehicle", "fuel", "misc"].map(
          (category) => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                categoryFilter === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {category === "all"
                ? "All"
                : category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          )
        )}
      </div>

      <DataTable
        data={filteredExpenses}
        columns={columns}
        keyField="id"
        searchable
        searchPlaceholder="Search expenses..."
        emptyMessage="No expenses recorded yet."
      />

      <ExpenseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        expense={selectedExpense}
      />
    </AppLayout>
  );
}
