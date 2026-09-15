import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app.css";

import { App } from "./App.tsx";
import { theme } from "./theme.ts";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="bottom-right" limit={4} />
      <App />
    </MantineProvider>
  </StrictMode>,
);
