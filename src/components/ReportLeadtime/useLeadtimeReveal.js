import { useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { shouldAnimate } from '../../utils/gsapSetup';

// ScrollTrigger CHỈ được register ở đây, không ở utils/gsapSetup.js. File này
// nằm trong cây của ReportLeadtime — tab duy nhất đủ dài để cần reveal — và
// tab đó được App.jsx lazy() import. Nhờ vậy ~40KB của ScrollTrigger nằm trong
// chunk ReportLeadtime chứ không kéo vào bundle chính, cùng lý do recharts đã
// được tách ra khỏi đó.
gsap.registerPlugin(ScrollTrigger);

// Chỉ lấy con TRỰC TIẾP của .lt-root: .lt-block cũng xuất hiện lồng bên trong
// vài component con, không muốn animate riêng từng cái đó.
const REVEAL_SELECTOR = [
  ':scope > .lt-verdict',
  ':scope > .lt-cards',
  ':scope > .lt-block',
  ':scope > .lt-layer2'
].join(', ');

/**
 * Reveal từng khối của tab Leadtime khi cuộn tới.
 *
 * Dùng gsap.from() (không phải .to() từ trạng thái ẩn dựng trong CSS) là có
 * chủ đích: trạng thái CUỐI là trạng thái tự nhiên của DOM, nên nếu
 * ScrollTrigger tính sai mốc hay animation bị kill giữa đường thì khối vẫn hiện
 * đầy đủ. Đây là bảng số vận hành — hỏng animation thì chấp nhận được, nhưng ẩn
 * mất số thì không.
 *
 * once: true vì đây là dashboard để đọc, không phải landing page: replay mỗi
 * lần cuộn qua sẽ thành nhiễu.
 *
 * @param {React.RefObject<HTMLElement>} scopeRef  ref tới .lt-root
 * @param {unknown} resetKey  đổi giá trị này để dựng lại reveal (khi nội dung
 *   đổi hẳn, vd chuyển từ empty state sang có dữ liệu)
 * @param {unknown} refreshKey  đổi giá trị này để ScrollTrigger đo lại chiều
 *   cao mà KHÔNG animate lại (vd mở/đóng lớp 2)
 */
export function useLeadtimeReveal(scopeRef, resetKey, refreshKey) {
  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !shouldAnimate()) return undefined;

    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray(scope.querySelectorAll(REVEAL_SELECTOR));
      blocks.forEach((block) => {
        gsap.from(block, {
          opacity: 0,
          y: 18,
          duration: 0.35,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: block,
            // 92% = gần đáy viewport: khối đã bắt đầu hiện trước khi mắt kịp
            // tới, nên cảm giác là "mượt khi cuộn" chứ không phải "phải chờ".
            start: 'top 92%',
            once: true
          }
        });
      });
    }, scope);

    return () => ctx.revert();
  }, [scopeRef, resetKey]);

  useLayoutEffect(() => {
    if (!shouldAnimate()) return;
    // Mở lớp 2 làm trang cao thêm vài nghìn px. ScrollTrigger tự đo lại khi
    // resize nhưng không biết gì về việc DOM đổi, nên phải gọi tay.
    ScrollTrigger.refresh();
  }, [refreshKey]);
}
