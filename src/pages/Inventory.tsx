import { useMemo, useState } from "react";
import { Package, TrendingUp, DollarSign, ShoppingCart, Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
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
import { StatCard } from "@/components/ui/stat-card";
import { centsToDollars } from "@/lib/db";
import { InventoryItemDialog } from "@/components/inventory/InventoryItemDialog";
import { InventoryItem } from "@/types";

export default function Inventory() {
  const { jobs, customers, inventoryItems, deleteInventoryItem } = useStore();
  const [viewMode, setViewMode] = useState<"items" | "analytics" | "history">("items");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();

  // Calculate parts data from all jobs
  const partsAnalysis = useMemo(() => {
    const partsSold: {
      name: string;
      quantity: number;
      costCents: number;
      revenueCents: number;
      profitCents: number;
      source: string;
      jobId: string;
      customerId: string;
      date: string;
    }[] = [];

    // Only include completed/invoiced/paid jobs
    const completedJobs = jobs.filter((j) =>
      ["completed", "invoiced", "paid"].includes(j.status)
    );

    completedJobs.forEach((job) => {
      (job.parts || []).forEach((part) => {
        // Only count inventory parts for profit (customer-provided are pass-through)
        if (part.source !== "customer-provided") {
          const totalCost = part.quantity * part.unitCostCents;
          const totalRevenue = part.quantity * part.unitPriceCents;
          partsSold.push({
            name: part.name,
            quantity: part.quantity,
            costCents: totalCost,
            revenueCents: totalRevenue,
            profitCents: totalRevenue - totalCost,
            source: part.source || "inventory",
            jobId: job.id,
            customerId: job.customerId,
            date: job.dateOfService,
          });
        }
      });
    });

    return partsSold;
  }, [jobs]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalCost = partsAnalysis.reduce((sum, p) => sum + p.costCents, 0);
    const totalRevenue = partsAnalysis.reduce((sum, p) => sum + p.revenueCents, 0);
    const totalProfit = partsAnalysis.reduce((sum, p) => sum + p.profitCents, 0);
    const totalQuantity = partsAnalysis.reduce((sum, p) => sum + p.quantity, 0);
    const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    // Inventory value and stock
    const inventoryValue = inventoryItems.reduce((sum, item) => sum + (item.unitCostCents * item.quantity), 0);
    const inventorySellValue = inventoryItems.reduce((sum, item) => sum + (item.unitPriceCents * item.quantity), 0);
    const totalStockQuantity = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
    const lowStockItems = inventoryItems.filter(item => item.reorderLevel && item.quantity <= item.reorderLevel).length;

    return {
      totalCost,
      totalRevenue,
      totalProfit,
      totalQuantity,
      avgMargin,
      uniqueParts: new Set(partsAnalysis.map((p) => p.name.toLowerCase())).size,
      inventoryValue,
      inventorySellValue,
      lowStockItems,
      totalItems: inventoryItems.length,
      totalStockQuantity,
    };
  }, [partsAnalysis, inventoryItems]);

  // Group by part name for chart
  const partsByName = useMemo(() => {
    const grouped: Record<string, { name: string; cost: number; revenue: number; profit: number; quantity: number }> = {};
    
    partsAnalysis.forEach((part) => {
      const key = part.name.toLowerCase();
      if (!grouped[key]) {
        grouped[key] = { name: part.name, cost: 0, revenue: 0, profit: 0, quantity: 0 };
      }
      grouped[key].cost += part.costCents;
      grouped[key].revenue += part.revenueCents;
      grouped[key].profit += part.profitCents;
      grouped[key].quantity += part.quantity;
    });

    return Object.values(grouped)
      .map((p) => ({
        name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
        fullName: p.name,
        cost: p.cost / 100,
        revenue: p.revenue / 100,
        profit: p.profit / 100,
        quantity: p.quantity,
        margin: p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  }, [partsAnalysis]);

  // Profit distribution for pie chart
  const profitDistribution = useMemo(() => {
    return partsByName.slice(0, 5).map((p) => ({
      name: p.name,
      value: p.profit,
    }));
  }, [partsByName]);

  const COLORS = [
    "hsl(142, 71%, 45%)",
    "hsl(199, 89%, 48%)",
    "hsl(38, 92%, 50%)",
    "hsl(262, 83%, 58%)",
    "hsl(0, 84%, 60%)",
  ];

  // Detailed parts list with customer info
  const detailedParts = useMemo(() => {
    return partsAnalysis
      .map((part) => ({
        ...part,
        customerName: customers.find((c) => c.id === part.customerId)?.name || "Unknown",
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [partsAnalysis, customers]);

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingItem(undefined);
    setDialogOpen(true);
  };

  const handleDelete = async (item: InventoryItem) => {
    if (confirm(`Delete "${item.name}" from inventory?`)) {
      await deleteInventoryItem(item.id);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Inventory & Parts"
        description="Manage your parts inventory and track profit margins"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("items")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "items"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Inventory
            </button>
            <button
              onClick={() => setViewMode("analytics")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "analytics"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "history"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Sales History
            </button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Inventory Value"
          value={`$${centsToDollars(stats.inventoryValue)}`}
          subtitle={`${stats.totalStockQuantity} units across ${stats.totalItems} items`}
          icon={Package}
          variant="default"
        />
        <StatCard
          title="Potential Revenue"
          value={`$${centsToDollars(stats.inventorySellValue)}`}
          subtitle="If all stock sold"
          icon={DollarSign}
          variant="primary"
        />
        <StatCard
          title="Parts Profit (Sold)"
          value={`$${centsToDollars(stats.totalProfit)}`}
          subtitle={`${stats.avgMargin.toFixed(1)}% avg margin`}
          icon={TrendingUp}
          variant="success"
        />
        <StatCard
          title="Low Stock Alert"
          value={stats.lowStockItems}
          subtitle={stats.lowStockItems > 0 ? "Items need reorder" : "All items stocked"}
          icon={AlertTriangle}
          variant={stats.lowStockItems > 0 ? "warning" : "default"}
        />
      </div>

      {viewMode === "items" && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Inventory Items</h3>
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {inventoryItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">SKU</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Price</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Margin</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Stock</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((item) => {
                      const margin = item.unitPriceCents > 0
                        ? ((item.unitPriceCents - item.unitCostCents) / item.unitPriceCents * 100).toFixed(1)
                        : "0";
                      const isLowStock = item.reorderLevel && item.quantity <= item.reorderLevel;
                      return (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/50">
                          <td className="py-3 px-4 font-medium">{item.name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{item.sku || "-"}</td>
                          <td className="py-3 px-4 text-muted-foreground">{item.category || "-"}</td>
                          <td className="py-3 px-4 text-right">${centsToDollars(item.unitCostCents)}</td>
                          <td className="py-3 px-4 text-right">${centsToDollars(item.unitPriceCents)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              parseFloat(margin) >= 30
                                ? "bg-success/20 text-success"
                                : parseFloat(margin) >= 15
                                ? "bg-warning/20 text-warning"
                                : "bg-destructive/20 text-destructive"
                            }`}>
                              {margin}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={isLowStock ? "text-warning font-medium" : ""}>
                              {item.quantity}
                              {isLowStock && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 hover:bg-secondary rounded"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No inventory items yet</p>
              <p className="text-sm mb-4">Add parts and items you sell to track profit margins</p>
              <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Your First Item
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === "analytics" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Parts by Profit */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Top Parts by Profit</h3>
            <div className="h-72">
              {partsByName.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={partsByName} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 22%)" />
                    <XAxis type="number" stroke="hsl(215, 20%, 65%)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(215, 20%, 65%)" fontSize={10} width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(222, 47%, 13%)",
                        border: "1px solid hsl(217, 33%, 22%)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number, name: string) => [
                        `$${value.toFixed(2)}`,
                        name.charAt(0).toUpperCase() + name.slice(1),
                      ]}
                    />
                    <Bar dataKey="cost" fill="hsl(0, 84%, 60%)" name="cost" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="profit" fill="hsl(142, 71%, 45%)" name="profit" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No parts data yet
                </div>
              )}
            </div>
          </div>

          {/* Profit Distribution */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Profit Distribution (Top 5)</h3>
            <div className="h-72">
              {profitDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={profitDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {profitDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(222, 47%, 13%)",
                        border: "1px solid hsl(217, 33%, 22%)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Profit"]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No profit data yet
                </div>
              )}
            </div>
          </div>

          {/* Parts Performance Table */}
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Parts Performance</h3>
            {partsByName.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Part Name</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Qty Sold</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Cost</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Profit</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partsByName.map((part, index) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-secondary/50">
                        <td className="py-3 px-4 font-medium">{part.fullName}</td>
                        <td className="py-3 px-4 text-right">{part.quantity}</td>
                        <td className="py-3 px-4 text-right text-destructive">${part.cost.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">${part.revenue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-success">${part.profit.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              parseFloat(part.margin) >= 30
                                ? "bg-success/20 text-success"
                                : parseFloat(part.margin) >= 15
                                ? "bg-warning/20 text-warning"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {part.margin}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No parts have been sold yet. Parts data will appear here once jobs with inventory parts are completed.
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "history" && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Parts Sales History</h3>
          {detailedParts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Part Name</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Qty</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Unit Cost</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Unit Price</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Cost</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedParts.map((part, index) => (
                    <tr key={index} className="border-b border-border/50 hover:bg-secondary/50">
                      <td className="py-3 px-4">
                        {new Date(part.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">{part.customerName}</td>
                      <td className="py-3 px-4 font-medium">{part.name}</td>
                      <td className="py-3 px-4 text-right">{part.quantity}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        ${centsToDollars(part.costCents / part.quantity)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        ${centsToDollars(part.revenueCents / part.quantity)}
                      </td>
                      <td className="py-3 px-4 text-right text-destructive">
                        ${centsToDollars(part.costCents)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        ${centsToDollars(part.revenueCents)}
                      </td>
                      <td className={`py-3 px-4 text-right font-medium ${part.profitCents >= 0 ? "text-success" : "text-destructive"}`}>
                        ${centsToDollars(part.profitCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No parts sales history yet. Complete jobs with inventory parts to see data here.
            </div>
          )}
        </div>
      )}

      <InventoryItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
      />
    </AppLayout>
  );
}