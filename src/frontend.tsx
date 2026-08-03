import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const elem = document.getElementById("root");
if (!elem) throw new Error("Root element not found");

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
if (import.meta.hot) {
  import.meta.hot.data.root ??= createRoot(elem);
  import.meta.hot.data.root.render(app);
} else {
  createRoot(elem).render(app);
}
