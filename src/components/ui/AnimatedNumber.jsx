import React from 'react';
import { useCountUp } from '../../utils/useCountUp';

/**
 * Số đếm dần khi giá trị đổi. Trước đây là hàm local trong
 * module OPS Metric; tách ra đây để tab Leadtime dùng cùng một thứ thay vì
 * copy sang file thứ hai.
 */
export default function AnimatedNumber({ value, format = v => v, className = '' }) {
  const animated = useCountUp(value, 600);
  return <span className={className}>{format(animated)}</span>;
}
