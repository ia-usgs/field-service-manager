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
  const { settings, customers, jobs, invoices, expenses, inventoryItems } = useStore();

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
    
    // Use same revenue calculation as Dashboard: income ratio × paid amount
    const getIncomeFromInvoice = (inv: typeof invoices[0]) => {
      const incomeRatio = inv.incomeAmountCents ? inv.incomeAmountCents / inv.totalCents : 1;
      return Math.round(inv.paidAmountCents * incomeRatio);
    };
    
    // Calculate lifetime revenue (same as Dashboard)
    const totalRevenue = invoices.reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    
    // Calculate this month's revenue based on paymentDate (same as Dashboard)
    const thisMonthRevenue = invoices
      .filter(inv => inv.paymentDate?.startsWith(thisMonth))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    
    // Calculate today's revenue based on paymentDate (same as Dashboard)
    const todayRevenue = invoices
      .filter(inv => inv.paymentDate?.startsWith(today))
      .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
    
    const outstandingAmount = invoices
      .filter(inv => inv.paymentStatus !== 'paid')
      .reduce((sum, inv) => sum + (inv.totalCents - inv.paidAmountCents), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);
    const activeJobs = jobs.filter(j => j.status !== 'paid' && j.status !== 'completed');
    const lowStockItems = inventoryItems.filter(item => 
      item.reorderLevel && item.quantity <= item.reorderLevel
    );
    
    const monthName = now.toLocaleString('default', { month: 'long' });

    // Build monthly trends for last 6 months
    const monthlyTrends: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      const monthRevenue = invoices
        .filter(inv => inv.paymentDate?.startsWith(monthKey))
        .reduce((sum, inv) => sum + getIncomeFromInvoice(inv), 0);
      
      const monthExpenses = expenses
        .filter(exp => exp.date.startsWith(monthKey))
        .reduce((sum, exp) => sum + exp.amountCents, 0);
      
      monthlyTrends.push({
        month: monthLabel,
        revenue: monthRevenue,
        expenses: monthExpenses,
        profit: monthRevenue - monthExpenses,
      });
    }

    // Expense breakdown by category
    const expensesByCategory: Record<string, number> = {};
    expenses.forEach(exp => {
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amountCents;
    });
    const topExpenseCategories = Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Revenue by customer (top 5)
    const revenueByCustomer: Record<string, { name: string; revenue: number }> = {};
    invoices.forEach(inv => {
      const customer = customers.find(c => c.id === inv.customerId);
      if (customer) {
        if (!revenueByCustomer[inv.customerId]) {
          revenueByCustomer[inv.customerId] = { name: customer.name, revenue: 0 };
        }
        revenueByCustomer[inv.customerId].revenue += getIncomeFromInvoice(inv);
      }
    });
    const topCustomers = Object.values(revenueByCustomer)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Job status breakdown
    const jobsByStatus = {
      quoted: jobs.filter(j => j.status === 'quoted').length,
      inProgress: jobs.filter(j => j.status === 'in-progress').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      invoiced: jobs.filter(j => j.status === 'invoiced').length,
      paid: jobs.filter(j => j.status === 'paid').length,
    };

    // Parts profit calculation
    const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'paid');
    let partsCost = 0;
    let partsRevenue = 0;
    completedJobs.forEach(job => {
      job.parts?.forEach(part => {
        if (part.source === 'inventory') {
          partsCost += (part.unitCostCents || 0) * part.quantity;
          partsRevenue += part.unitPriceCents * part.quantity;
        }
      });
    });
    const partsProfit = partsRevenue - partsCost;
    const partsMargin = partsRevenue > 0 ? ((partsProfit / partsRevenue) * 100).toFixed(1) : '0';

    // Collection rate
    const totalBilled = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
    const totalCollected = invoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
    const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '100';

    return `
You are an AI assistant for a service business management app. Today is ${now.toLocaleDateString()}.

IMPORTANT: Use ONLY the pre-calculated values below. Do NOT recalculate or sum up values from the detailed data.

FINANCIAL SUMMARY (use these exact values):
- Total Lifetime Revenue: ${centsToDollars(totalRevenue)} (all-time earnings)
- Revenue This Month (${monthName}): ${centsToDollars(thisMonthRevenue)}
- Revenue Today: ${centsToDollars(todayRevenue)}
- Outstanding Amount: ${centsToDollars(outstandingAmount)} (unpaid invoices)
- Total Expenses: ${centsToDollars(totalExpenses)}
- Net Profit: ${centsToDollars(totalRevenue - totalExpenses)}
- Collection Rate: ${collectionRate}%

PARTS & INVENTORY METRICS:
- Parts Revenue: ${centsToDollars(partsRevenue)}
- Parts Cost: ${centsToDollars(partsCost)}
- Parts Profit: ${centsToDollars(partsProfit)}
- Parts Margin: ${partsMargin}%
- Low Stock Items: ${lowStockItems.length}

BUSINESS METRICS:
- Total Customers: ${customers.length}
- Active Jobs: ${activeJobs.length}
- Total Jobs: ${jobs.length}
- Total Invoices: ${invoices.length}

JOB STATUS BREAKDOWN:
- Quoted: ${jobsByStatus.quoted}
- In Progress: ${jobsByStatus.inProgress}
- Completed: ${jobsByStatus.completed}
- Invoiced: ${jobsByStatus.invoiced}
- Paid: ${jobsByStatus.paid}

MONTHLY TRENDS (Last 6 Months):
${monthlyTrends.map(m => `- ${m.month}: Revenue ${centsToDollars(m.revenue)}, Expenses ${centsToDollars(m.expenses)}, Profit ${centsToDollars(m.profit)}`).join('\n')}

TOP 5 CUSTOMERS BY REVENUE:
${topCustomers.map((c, i) => `${i + 1}. ${c.name}: ${centsToDollars(c.revenue)}`).join('\n') || 'No customer data yet'}

TOP 5 EXPENSE CATEGORIES:
${topExpenseCategories.map(([cat, amt]) => `- ${cat}: ${centsToDollars(amt)}`).join('\n') || 'No expenses yet'}

RECENT JOBS (last 10):
${jobs.slice(-10).map(j => {
  const customer = customers.find(c => c.id === j.customerId);
  return `- ${j.problemDescription.substring(0, 50)}... for ${customer?.name || 'Unknown'} - Status: ${j.status}`;
}).join('\n')}

UNPAID INVOICES:
${invoices.filter(inv => inv.paymentStatus !== 'paid').slice(0, 5).map(inv => {
  const customer = customers.find(c => c.id === inv.customerId);
  return `- Invoice #${inv.invoiceNumber} for ${customer?.name || 'Unknown'}: ${centsToDollars(inv.totalCents - inv.paidAmountCents)} outstanding`;
}).join('\n')}

LOW STOCK ITEMS:
${lowStockItems.map(item => `- ${item.name}: ${item.quantity} left (reorder at ${item.reorderLevel})`).join('\n') || 'None'}

Answer questions about trends, comparisons, reports, and business metrics using ONLY the provided summary values. Be concise and helpful.
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
