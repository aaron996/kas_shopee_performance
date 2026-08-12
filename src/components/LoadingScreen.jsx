import React from 'react';
import './LoadingScreen.css';

export default function LoadingScreen({ text = "Đang tải dữ liệu...", option = 4 }) {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className={`loading-sprite sprite-option-${option}`}>
        </div>
        <p className="loading-text">{text}</p>
      </div>
    </div>
  );
}
