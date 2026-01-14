import { useState, useEffect, useMemo } from "react";
import { Bell, Check, X, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationBell() {
  const navigate = useNavigate();
  const { getUpcomingReminders, completeReminder, jobs, customers } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewReminders, setHasNewReminders] = useState(false);

  const upcomingReminders = useMemo(() => {
    return getUpcomingReminders(30);
  }, [getUpcomingReminders]);

  // Show indicator when there are reminders
  useEffect(() => {
    if (upcomingReminders.length > 0) {
      setHasNewReminders(true);
    }
  }, [upcomingReminders.length]);

  const handleComplete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await completeReminder(id);
  };

  const handleViewJob = (jobId: string) => {
    setIsOpen(false);
    navigate(`/jobs/${jobId}`);
  };

  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || "Unknown";
  };

  const getDaysUntil = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    return `In ${diffDays} days`;
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button 
          className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
          onClick={() => setHasNewReminders(false)}
        >
          <Bell className="w-5 h-5" />
          {upcomingReminders.length > 0 && hasNewReminders && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-5 w-5 bg-destructive text-xs items-center justify-center text-destructive-foreground font-medium">
                {upcomingReminders.length > 9 ? "9+" : upcomingReminders.length}
              </span>
            </span>
          )}
          {upcomingReminders.length > 0 && !hasNewReminders && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 rounded-full bg-primary text-xs items-center justify-center text-primary-foreground font-medium">
              {upcomingReminders.length > 9 ? "9+" : upcomingReminders.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-card border-border" align="end">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Reminders
          </h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {upcomingReminders.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No upcoming reminders
            </div>
          ) : (
            upcomingReminders.map((reminder) => (
              <div
                key={reminder.id}
                onClick={() => handleViewJob(reminder.jobId)}
                className="p-3 hover:bg-secondary/50 cursor-pointer border-b border-border/50 last:border-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{reminder.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {getCustomerName(reminder.customerId)}
                    </p>
                    <p className={`text-xs mt-1 ${isOverdue(reminder.dueDate) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {getDaysUntil(reminder.dueDate)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleComplete(reminder.id, e)}
                    className="p-1.5 rounded-full hover:bg-success/20 text-success transition-colors"
                    title="Mark as complete"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        {upcomingReminders.length > 0 && (
          <div className="p-2 border-t border-border">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate("/");
              }}
              className="w-full text-sm text-primary hover:underline"
            >
              View all on Dashboard
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}