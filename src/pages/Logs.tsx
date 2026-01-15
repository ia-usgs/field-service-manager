import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Edit,
  Plus,
  Trash2,
  DollarSign,
  RefreshCcw,
  Filter,
  Search,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { AuditLog } from "@/types";
import { cn } from "@/lib/utils";

const entityTypeLabels: Record<AuditLog["entityType"], string> = {
  customer: "Customer",
  job: "Job",
  invoice: "Invoice",
  expense: "Expense",
  payment: "Payment",
  reminder: "Reminder",
  inventory: "Inventory",
};

const actionIcons: Record<AuditLog["action"], typeof Plus> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  paid: DollarSign,
  refunded: RefreshCcw,
};

const actionColors: Record<AuditLog["action"], string> = {
  created: "text-green-500 bg-green-500/10",
  updated: "text-blue-500 bg-blue-500/10",
  deleted: "text-red-500 bg-red-500/10",
  paid: "text-emerald-500 bg-emerald-500/10",
  refunded: "text-orange-500 bg-orange-500/10",
};

export default function Logs() {
  const { auditLogs, customers, jobs } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<AuditLog["entityType"] | "all">("all");
  const [actionFilter, setActionFilter] = useState<AuditLog["action"] | "all">("all");

  // Sort logs by timestamp (newest first) and apply filters
  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter((log) => {
        if (entityFilter !== "all" && log.entityType !== entityFilter) return false;
        if (actionFilter !== "all" && log.action !== actionFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            log.details.toLowerCase().includes(query) ||
            log.entityType.toLowerCase().includes(query) ||
            log.action.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLogs, entityFilter, actionFilter, searchQuery]);

  // Get entity name helper
  const getEntityName = (log: AuditLog): string | null => {
    if (log.entityType === "customer") {
      const customer = customers.find((c) => c.id === log.entityId);
      return customer?.name || null;
    }
    if (log.entityType === "job") {
      const job = jobs.find((j) => j.id === log.entityId);
      if (job) {
        const customer = customers.find((c) => c.id === job.customerId);
        return customer?.name || "Unknown Customer";
      }
    }
    return null;
  };

  // Group logs by date for better readability
  const groupedLogs = useMemo(() => {
    const groups: Record<string, AuditLog[]> = {};
    filteredLogs.forEach((log) => {
      const dateKey = format(new Date(log.timestamp), "yyyy-MM-dd");
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return groups;
  }, [filteredLogs]);

  const entityTypes: (AuditLog["entityType"] | "all")[] = [
    "all",
    "customer",
    "job",
    "invoice",
    "expense",
    "payment",
    "reminder",
    "inventory",
  ];

  const actionTypes: (AuditLog["action"] | "all")[] = [
    "all",
    "created",
    "updated",
    "deleted",
    "paid",
    "refunded",
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Activity Logs"
        description="View all system activity and changes"
      />

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as AuditLog["entityType"] | "all")}
              className="input-field"
            >
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "All Types" : entityTypeLabels[type]}
                </option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as AuditLog["action"] | "all")}
            className="input-field"
          >
            {actionTypes.map((action) => (
              <option key={action} value={action}>
                {action === "all" ? "All Actions" : action.charAt(0).toUpperCase() + action.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {(["created", "updated", "deleted", "paid", "refunded"] as AuditLog["action"][]).map((action) => {
          const count = auditLogs.filter((l) => l.action === action).length;
          const Icon = actionIcons[action];
          return (
            <div
              key={action}
              className="bg-card border border-border rounded-lg p-4 flex items-center gap-3"
            >
              <div className={cn("p-2 rounded-lg", actionColors[action])}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">{action}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Logs List */}
      <div className="space-y-6">
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No activity logs found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Activity will appear here as you use the app
            </p>
          </div>
        ) : (
          Object.entries(groupedLogs).map(([dateKey, logs]) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background py-2">
                {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
              </h3>
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                {logs.map((log) => {
                  const Icon = actionIcons[log.action];
                  const entityName = getEntityName(log);

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 hover:bg-secondary/30 transition-colors"
                    >
                      <div className={cn("p-2 rounded-lg", actionColors[log.action])}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                            {entityTypeLabels[log.entityType]}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {log.action}
                          </span>
                          {entityName && (
                            <span className="text-xs text-primary">• {entityName}</span>
                          )}
                        </div>
                        <p className="text-sm mt-1">{log.details}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(log.timestamp), "h:mm:ss a")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
