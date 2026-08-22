import { Component, type ErrorInfo, type ReactNode } from "react";

interface ColumnErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface ColumnErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ColumnErrorBoundary extends Component<
  ColumnErrorBoundaryProps,
  ColumnErrorBoundaryState
> {
  public override state: ColumnErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ColumnErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("LyricStage Column render error:", error, errorInfo);
    this.props.onError?.(error);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="column-error-fallback" role="alert">
          <div className="column-error-badge">LyricStage 故障</div>
          <strong>歌词组件渲染遇到问题</strong>
          <p>{this.state.error?.message || "未知渲染异常。请重新加载扩展或刷新页面重试。"}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
