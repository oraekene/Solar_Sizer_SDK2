import React from "react";
import { WarningCircle, ArrowClockwise } from "@phosphor-icons/react";

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center p-4">
          <div className="double-bezel max-w-md w-full">
            <div className="double-bezel-inner p-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{background: 'rgba(220,38,38,0.1)'}}>
                <WarningCircle weight="light" className="text-[#DC2626]" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-[#FAFAF9] mb-2">Something went wrong</h1>
              <p className="text-[#A8A29E] mb-8">
                The application encountered an unexpected error.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary mx-auto"
              >
                <ArrowClockwise weight="light" size={18} />
                <span>Refresh Page</span>
              </button>
              {this.state.error && (
                <div className="mt-8 p-4 rounded-xl text-left overflow-auto max-h-40" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)'}}>
                  <p className="text-xs font-mono text-[#A8A29E] whitespace-pre-wrap">
                    {this.state.error.toString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
