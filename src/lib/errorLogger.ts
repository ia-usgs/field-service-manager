import { v4 as uuidv4 } from 'uuid';
import { ErrorLog } from '@/types';
import { getDB } from './db';

// In-memory cache for errors before DB is ready
let pendingErrors: ErrorLog[] = [];
let isInitialized = false;

async function saveError(log: ErrorLog): Promise<void> {
  if (!isInitialized) {
    pendingErrors.push(log);
    return;
  }

  try {
    const db = await getDB();
    await db.put('errorLogs', log);
  } catch (e) {
    // If we can't save to DB, at least log to console
    console.error('Failed to save error log:', e);
  }
}

export async function logError(
  message: string,
  options?: { stack?: string; source?: string; level?: ErrorLog['level'] }
): Promise<void> {
  const log: ErrorLog = {
    id: uuidv4(),
    level: options?.level || 'error',
    message: message.substring(0, 1000), // Limit message length
    stack: options?.stack?.substring(0, 2000), // Limit stack length
    source: options?.source,
    timestamp: new Date().toISOString(),
  };

  await saveError(log);
}

export async function logWarning(message: string, source?: string): Promise<void> {
  await logError(message, { level: 'warning', source });
}

export async function logInfo(message: string, source?: string): Promise<void> {
  await logError(message, { level: 'info', source });
}

export async function getErrorLogs(): Promise<ErrorLog[]> {
  try {
    const db = await getDB();
    return await db.getAll('errorLogs');
  } catch {
    return [];
  }
}

export async function clearErrorLogs(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('errorLogs');
  } catch (e) {
    console.error('Failed to clear error logs:', e);
  }
}

export async function deleteErrorLog(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('errorLogs', id);
  } catch (e) {
    console.error('Failed to delete error log:', e);
  }
}

// Flush pending errors once DB is ready
async function flushPendingErrors(): Promise<void> {
  if (pendingErrors.length === 0) return;
  
  const db = await getDB();
  for (const log of pendingErrors) {
    try {
      await db.put('errorLogs', log);
    } catch {
      // Ignore individual failures
    }
  }
  pendingErrors = [];
}

// Initialize global error handlers
export function initializeErrorLogging(): void {
  if (isInitialized) return;

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    logError(event.message || 'Unknown error', {
      stack: event.error?.stack,
      source: `${event.filename}:${event.lineno}:${event.colno}`,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
    logError(message, {
      stack: event.reason?.stack,
      source: 'Promise rejection',
    });
  });

  // Intercept console.error
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    
    const message = args
      .map((arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    // Don't log our own error logging failures
    if (!message.includes('Failed to save error log')) {
      logError(message, { source: 'console.error' });
    }
  };

  // Intercept console.warn
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    originalConsoleWarn.apply(console, args);
    
    const message = args.map((arg) => String(arg)).join(' ');
    logWarning(message, 'console.warn');
  };

  isInitialized = true;
  
  // Flush any pending errors
  flushPendingErrors();
}
