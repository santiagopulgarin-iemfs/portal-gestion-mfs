import { createRoot } from "react-dom/client";
import "./legacy/portal.css";
import "./app.css";
import "./login.css";
import { App } from "./App";

// Sin StrictMode a propósito: la lógica legacy se inicializa una sola vez sobre el DOM montado.
createRoot(document.getElementById("root")!).render(<App />);
