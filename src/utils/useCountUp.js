import { useEffect, useRef, useState } from 'react';
import { gsap, shouldAnimate } from './gsapSetup';

/**
 * Số đếm dần tới `end`. Lần render đầu nhảy thẳng tới số (không đếm từ 0) —
 * dashboard mở ra là phải đọc được ngay.
 *
 * Bản cũ tự chạy requestAnimationFrame và có một lỗi thật: hàm cleanup chỉ
 * cancel được id của FRAME ĐẦU TIÊN, còn các frame sau do chính vòng lặp tự
 * gọi requestAnimationFrame nên không ai giữ id. Hệ quả: `end` đổi giữa lúc
 * đang đếm thì vòng cũ vẫn sống, hai vòng cùng gọi setValue và số nhảy giật
 * rồi có thể dừng ở giá trị sai. Ở GHN chuyện này xảy ra mỗi lần sync nền trả
 * dữ liệu về đúng lúc card đang đếm.
 *
 * gsap.to() tự ghi đè tween cũ trên cùng target, và tween.kill() trong cleanup
 * dừng được toàn bộ animation chứ không riêng frame đầu. Easing giữ nguyên cảm
 * giác cũ: easeOutExpo ≡ 'expo.out'.
 */
export function useCountUp(end, duration = 800) {
  const [value, setValue] = useState(end);
  const isFirstRunRef = useRef(true);
  // Object trung gian để GSAP tween — GSAP cần một property trên object thật,
  // không tween trực tiếp state của React được. Giữ trong ref để tween sau nối
  // tiếp từ đúng giá trị đang hiển thị khi tween trước bị ngắt giữa đường.
  const holderRef = useRef({ v: end });

  useEffect(() => {
    const holder = holderRef.current;

    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      holder.v = end;
      setValue(end);
      return undefined;
    }

    if (!shouldAnimate() || holder.v === end) {
      holder.v = end;
      setValue(end);
      return undefined;
    }

    const tween = gsap.to(holder, {
      v: end,
      duration: duration / 1000,
      ease: 'expo.out',
      onUpdate: () => setValue(holder.v),
      // Chốt lại bằng đúng `end`: tween dừng ở sai số float rất nhỏ, mà đây là
      // con số người ta đọc để ra quyết định nên không để lệch.
      onComplete: () => setValue(end)
    });

    return () => tween.kill();
  }, [end, duration]);

  return value;
}
