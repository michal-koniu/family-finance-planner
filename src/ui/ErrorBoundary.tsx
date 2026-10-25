import { Component, type ReactNode } from 'react';

/** Keeps a rendering bug from blanking the app; offers the data as a download so nothing is lost. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const download = () => {
      const raw = localStorage.getItem('ffp.doc') ?? '{}';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      a.download = 'finance-plan-backup.json';
      a.click();
    };
    return (
      <div className="page">
        <div className="card stack">
          <h2>Something went wrong</h2>
          <p>
            The app hit an error while showing this screen. Your data is safe on this device (and on GitHub if sync is on).
          </p>
          <pre className="hint" style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="btn" onClick={download}>
              Download my data
            </button>
          </div>
        </div>
      </div>
    );
  }
}
