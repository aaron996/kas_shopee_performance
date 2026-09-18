import React from 'react';

/**
 * Màn phủ "Đang phát triển" (Development Overlay).
 *
 * Tuân thủ triết lý "The Calm Operations Desk" (DESIGN.md):
 * - Hiển thị lớp kính mờ nhẹ (frosted glass) để người dùng vẫn nhận diện được
 *   bố cục và các chỉ số nền của Tab (Leadtime hoặc Insight).
 * - Vô hiệu hóa toàn bộ tương tác chuột, con lăn và focus bàn phím (inert + pointer-events: none)
 *   đối với nội dung bên dưới.
 * - Thẻ thông báo bo góc chuẩn 22px (surface), nổi bật trên nền pastel canvas.
 * - Áp dụng quy tắc "The One-Action Accent Rule": Duy nhất 1 nút cyan pill "Quay lại trang tổng quan".
 */
export default function UnderDevelopmentOverlay({
  title = 'Tính năng đang được phát triển',
  description,
  badge = 'BẢN XEM TRƯỚC',
  onBackToOverview,
  children
}) {
  return (
    <div className="dev-overlay-wrapper">
      {/* Khối nội dung nền: bị vô hiệu hóa hoàn toàn tương tác và trợ năng */}
      <div
        className="dev-overlay-content"
        inert="true"
        aria-hidden="true"
        tabIndex={-1}
      >
        {children}
      </div>

      {/* Lớp phủ mờ kính và thẻ thông báo */}
      <div
        className="dev-overlay-backdrop"
        role="region"
        aria-label={title}
      >
        <div className="dev-overlay-card">
          {badge && <span className="dev-overlay-badge">{badge}</span>}
          <h2 className="dev-overlay-title">{title}</h2>
          {description && <p className="dev-overlay-desc">{description}</p>}
          <button
            type="button"
            className="dev-overlay-btn"
            onClick={onBackToOverview}
          >
            Quay lại trang tổng quan
          </button>
        </div>
      </div>
    </div>
  );
}
