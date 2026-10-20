import React from 'react';

// A stale tab may reference a chart chunk removed by a newer deployment.
// Keep the answer and its data details visible if loading/rendering the chart fails.
export default class ChatChartBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <p className="chat-stopped-label" role="status">Chưa tải được biểu đồ. Bạn vẫn có thể đọc câu trả lời và mở Chi tiết dữ liệu. Hãy tải lại trang để dùng phiên bản mới.</p>;
    }
    return this.props.children;
  }
}
