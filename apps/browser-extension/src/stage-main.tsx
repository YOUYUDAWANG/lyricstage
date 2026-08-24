import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../stage/src/App";
import { ColumnErrorBoundary } from "../../stage/src/column/ColumnErrorBoundary";
import "../../stage/src/column/column.css";
import "../../stage/src/lyrics/LyricScroller.css";
import "../../stage/src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ColumnErrorBoundary>
      <App />
    </ColumnErrorBoundary>
  </StrictMode>,
);
