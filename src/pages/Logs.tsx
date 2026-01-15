import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Edit,
  Plus,
  Trash2,
  DollarSign,
  RefreshCcw,
  Filter,
  Search,
  Info,
  XCircle,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { AuditLog, ErrorLog } from "@/types";
import { cn } from "@/lib/utils";
import { getErrorLogs, clearErrorLogs, deleteErrorLog } from "@/lib/errorLogger";

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

const errorLevelIcons: Record<ErrorLog["level"], typeof AlertCircle> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const errorLevelColors: Record<ErrorLog["level"], string> = {
  error: "text-red-500 bg-red-500/10",
  warning: "text-yellow-500 bg-yellow-500/10",
  info: "text-blue-500 bg-blue-500/10",
};

export default function Logs() {
  const { auditLogs, customers, jobs } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<AuditLog["entityType"] | "all">("all");
  const [actionFilter, setActionFilter] = useState<AuditLog["action"] | "all">("all");
  const [activeTab, setActiveTab] = useState<"activity" | "errors">("activity");
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // Load error logs
  useEffect(() => {
    getErrorLogs().then(setErrorLogs);
  }, []);

  const handleClearErrors = async () => {
    if (confirm("Are you sure you want to clear all error logs?")) {
      await clearErrorLogs();
      setErrorLogs([]);
    }
  };

  const handleDeleteError = async (id: string) => {
    await deleteErrorLog(id);
    setErrorLogs((prev) => prev.filter((e) => e.id !== id));
  };

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

  // Filter error logs
  const filteredErrors = useMemo(() => {
    return errorLogs
      .filter((log) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            log.message.toLowerCase().includes(query) ||
            log.source?.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [errorLogs, searchQuery]);

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

  const errorCount = errorLogs.filter((e) => e.level === "error").length;
  const warningCount = errorLogs.filter((e) => e.level === "warning").length;

  return (
    <AppLayout>
      <PageHeader
        title="Activity Logs"
        description="View all system activity, changes, and errors"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("activity")}
          className={cn(
            "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
            activeTab === "activity"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          <Activity className="w-4 h-4" />
          Activity
          <span className="text-xs bg-background/20 px-1.5 py-0.5 rounded">
            {auditLogs.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("errors")}
          className={cn(
            "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
            activeTab === "errors"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          <AlertCircle className="w-4 h-4" />
          Errors & Warnings
          {(errorCount > 0 || warningCount > 0) && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              errorCount > 0 ? "bg-red-500 text-white" : "bg-yellow-500 text-black"
            )}>
              {errorCount + warningCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "activity" ? (
        <>
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
        </>
      ) : (
        <>
          {/* Error Logs Section */}
          <div className="bg-card border border-border rounded-lg p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search errors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field w-full pl-10"
                />
              </div>
              {errorLogs.length > 0 && (
                <button
                  onClick={handleClearErrors}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Error Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {(["error", "warning", "info"] as ErrorLog["level"][]).map((level) => {
              const count = errorLogs.filter((l) => l.level === level).length;
              const Icon = errorLevelIcons[level];
              return (
                <div
                  key={level}
                  className="bg-card border border-border rounded-lg p-4 flex items-center gap-3"
                >
                  <div className={cn("p-2 rounded-lg", errorLevelColors[level])}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground capitalize">{level}s</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error Logs List */}
          <div className="space-y-3">
            {filteredErrors.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p className="text-muted-foreground">No errors or warnings</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your app is running smoothly
                </p>
              </div>
            ) : (
              filteredErrors.map((log) => {
                const Icon = errorLevelIcons[log.level];
                const isExpanded = expandedError === log.id;

                return (
                  <div
                    key={log.id}
                    className="bg-card border border-border rounded-lg overflow-hidden"
                  >
                    <div
                      className="flex items-start gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => setExpandedError(isExpanded ? null : log.id)}
                    >
                      <div className={cn("p-2 rounded-lg flex-shrink-0", errorLevelColors[log.level])}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded capitalize",
                            log.level === "error" && "bg-red-500/10 text-red-500",
                            log.level === "warning" && "bg-yellow-500/10 text-yellow-500",
                            log.level === "info" && "bg-blue-500/10 text-blue-500"
                          )}>
                            {log.level}
                          </span>
                          {log.source && (
                            <span className="text-xs text-muted-foreground">
                              {log.source}
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-1 break-words">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(log.timestamp), "MMM d, yyyy h:mm:ss a")}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteError(log.id);
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {isExpanded && log.stack && (
                      <div className="px-4 pb-4">
                        <pre className="text-xs bg-secondary/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words font-mono text-muted-foreground">
                          {log.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
