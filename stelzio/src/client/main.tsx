import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Элемент #root не найден");

createRoot(container).render(<App />);
