import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal">
          <h1>Let’s give that another go.</h1>
          <p>
            The app hit an unexpected error. Reload to recover your saved draft,
            or delete it to start fresh.
          </p>
          <button onClick={() => location.reload()}>Reload app</button>
          <button
            onClick={() => {
              localStorage.removeItem("gather.receipt.v1");
              location.reload();
            }}
          >
            Delete local draft
          </button>
        </main>
      );
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
