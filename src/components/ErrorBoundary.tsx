import React from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface EBProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface EBState {
  error: Error | null;
}

// Class component required for React error boundaries (no hook equivalent exists)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ErrorBoundary extends (React.Component as any) {
  declare props: EBProps;
  declare state: EBState;

  constructor(props: EBProps) {
    super(props);
    (this as unknown as { state: EBState }).state = { error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Could log to error tracking service here
  }

  render(): ReactNode {
    const self = this as unknown as {
      state: EBState;
      props: EBProps;
      setState: (s: Partial<EBState>) => void;
    };

    if (self.state.error) {
      if (self.props.fallback) return self.props.fallback;
      const err = self.state.error;
      return (
        <div style={{ padding: 32, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a14', margin: '0 0 8px' }}>
            Something went wrong displaying this page.
          </h3>
          <p style={{ color: '#6b6b5e', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
            {err.message}
          </p>
          <button
            onClick={() => self.setState({ error: null })}
            style={{ background: '#2d5a27', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return self.props.children;
  }
}
