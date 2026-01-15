import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeErrorLogging } from "./lib/errorLogger";

// Initialize global error logging before rendering
initializeErrorLogging();

createRoot(document.getElementById("root")!).render(<App />);
