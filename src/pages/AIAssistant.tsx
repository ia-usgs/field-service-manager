import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/page-header";
import { useStore } from "@/store/useStore";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { centsToDollars } from "@/lib/db";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, customers, jobs, invoices, expenses, inventoryItems, payments, reminders, attachments, auditLogs } = useStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const buildContext = () => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthName = now.toLocaleString('default', { month: 'long' });
    
    // Revenue calculation helper (same as Dashboard)
    const getIncomeFromInvoice = (inv: typeof invoices[0]) => {
      const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
      return Math.round(inv.paidAmountCents * incomeRatio);
    };
    
    // Pre-computed summaries for accuracy
    const totalRevenue = invoices.reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    const thisMonthRevenue = invoices
      .filter(inv => inv.paymentDate?.startsWith(thisMonth))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    const todayRevenue = invoices
      .filter(inv => inv.paymentDate?.startsWith(today))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    const outstandingAmount = invoices
      .filter(inv => inv.paymentStatus !== 'paid')
      .reduce((sum, inv) => sum + (inv.totalCents - inv.paidAmountCents), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);

    // Monthly trends for last 6 months
    const monthlyTrends: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      monthlyTrends.push({
        month: monthLabel,
        revenue: invoices.filter(inv => inv.paymentDate?.startsWith(monthKey)).reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0),
        expenses: expenses.filter(exp => exp.date.startsWith(monthKey)).reduce((sum, exp) => sum + exp.amountCents, 0),
      });
    }

    // Pre-compute revenue by customer (formatted as dollars)
    const revenueByCustomer: Record<string, number> = {};
    invoices.forEach(inv => {
      const customer = customers.find(c => c.id === inv.customerId);
      if (customer) {
        revenueByCustomer[customer.name] = (revenueByCustomer[customer.name] || 0) + getIncomeFromInvoice(inv);
      }
    });
    const customerRevenueList = Object.entries(revenueByCustomer)
      .map(([name, cents]) => ({ name, revenue: centsToDollars(cents) }))
      .sort((a, b) => parseFloat(b.revenue.replace(/[$,]/g, '')) - parseFloat(a.revenue.replace(/[$,]/g, '')));

    // Build compact data with FORMATTED dollar values (not cents)
    const fullData = {
      customers: customers.slice(0, 100).map(c => ({ name: c.name, email: c.email, phone: c.phone, archived: c.archived })),
      jobs: jobs.map(j => {
        const customer = customers.find(c => c.id === j.customerId);
        const totalCents = (j.laborHours * j.laborRateCents) + j.parts.reduce((sum, p) => sum + (p.unitPriceCents * p.quantity), 0) + j.miscFeesCents;
        return {
          customer: customer?.name || 'Unknown',
          date: j.dateOfService,
          description: j.problemDescription.substring(0, 60),
          total: centsToDollars(totalCents),
          status: j.status,
        };
      }),
      invoices: invoices.map(inv => {
        const customer = customers.find(c => c.id === inv.customerId);
        return {
          number: inv.invoiceNumber,
          customer: customer?.name || 'Unknown',
          total: centsToDollars(inv.totalCents),
          income: centsToDollars(inv.incomeAmountCents),
          paid: centsToDollars(inv.paidAmountCents),
          status: inv.paymentStatus,
        };
      }),
      expenses: expenses.slice(0, 50).map(e => ({ date: e.date, category: e.category, amount: centsToDollars(e.amountCents) })),
      reminders: reminders.filter(r => !r.completed).slice(0, 20).map(r => {
        const customer = customers.find(c => c.id === r.customerId);
        return { title: r.title, customer: customer?.name || 'Unknown', dueDate: r.dueDate };
      }),
      inventory: inventoryItems.map(i => ({ name: i.name, qty: i.quantity, price: centsToDollars(i.unitPriceCents) })),
    };

    return `
You are an AI assistant for a service business management app. Today is ${now.toLocaleDateString()} (${monthName}).

CRITICAL: All dollar amounts below are ALREADY FORMATTED. Use them exactly as shown - do NOT recalculate anything.

=== FINANCIAL SUMMARY ===
- Total Lifetime Revenue: ${centsToDollars(totalRevenue)}
- Revenue This Month (${monthName}): ${centsToDollars(thisMonthRevenue)}
- Revenue Today: ${centsToDollars(todayRevenue)}
- Outstanding Amount: ${centsToDollars(outstandingAmount)}
- Total Expenses: ${centsToDollars(totalExpenses)}
- Net Profit: ${centsToDollars(totalRevenue - totalExpenses)}

=== REVENUE BY CUSTOMER (sorted highest to lowest) ===
${customerRevenueList.map((c, i) => `${i + 1}. ${c.name}: ${c.revenue}`).join('\n') || 'No customer revenue data'}

=== MONTHLY TRENDS (Last 6 Months) ===
${monthlyTrends.map(m => `${m.month}: Revenue ${centsToDollars(m.revenue)}, Expenses ${centsToDollars(m.expenses)}, Profit ${centsToDollars(m.revenue - m.expenses)}`).join('\n')}

=== QUICK STATS ===
- Total Customers: ${customers.length}
- Total Jobs: ${jobs.length} (Quoted: ${jobs.filter(j => j.status === 'quoted').length}, In Progress: ${jobs.filter(j => j.status === 'in-progress').length}, Completed: ${jobs.filter(j => j.status === 'completed').length}, Invoiced: ${jobs.filter(j => j.status === 'invoiced').length}, Paid: ${jobs.filter(j => j.status === 'paid').length})
- Total Invoices: ${invoices.length}
- Pending Reminders: ${reminders.filter(r => !r.completed).length}
- Inventory Items: ${inventoryItems.length}

=== DETAILED DATA (all amounts are formatted as dollars) ===
${JSON.stringify(fullData, null, 2)}

Use the pre-formatted dollar amounts exactly as shown. Be concise and helpful.
`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const groqApiKey = settings?.groqApiKey;
    if (!groqApiKey) {
      toast({
        title: "API Key Required",
        description: "Please add your Groq API key in Settings to use the AI Assistant.",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: buildContext() },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage.content },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.choices[0]?.message?.content || "No response",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between mb-4">
          <PageHeader 
            title="AI Assistant" 
            description="Ask questions about your business data" 
          />
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Clear Chat
            </button>
          )}
        </div>

        {!settings?.groqApiKey && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>Setup Required:</strong> Add your Groq API key in{" "}
              <a href="/settings" className="underline hover:no-underline">Settings</a>{" "}
              to enable the AI Assistant.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-muted/30 rounded-lg border border-border p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">How can I help you today?</p>
              <p className="text-sm mt-2">Ask me anything about your customers, jobs, invoices, or business metrics.</p>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 max-w-xl">
                {[
                  "What's my total revenue this month?",
                  "Which customers have unpaid invoices?",
                  "Show me jobs in progress",
                  "What inventory items are low on stock?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-left text-sm p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-60 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business..."
            className="input-field flex-1"
            disabled={isLoading || !settings?.groqApiKey}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !settings?.groqApiKey}
            className="btn-primary flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
