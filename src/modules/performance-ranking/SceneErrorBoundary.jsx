import React from 'react';

// Catches render errors and failed lazy imports of the 3D chunk (offline, stale deploy) so the
// ranking page can show a recovery notice and table access. `onError` is called once.
export default class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (typeof this.props.onError === 'function') this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
