import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

// Đăng ký tập trung tại 1 chỗ. Vite tree-shake khá hăng: nếu chỉ import
// 'gsap/Flip' rồi dùng qua chuỗi (vd Flip.from trong file khác) mà không
// registerPlugin thì plugin bị coi là code chết và bị loại khỏi bundle
// production — đúng cái bẫy GSAP docs cảnh báo. ScrollTrigger KHÔNG nằm ở đây:
// chỉ tab Leadtime cần, nên nó tự register trong chunk lazy của tab đó để
// không kéo thêm ~40KB vào bundle chính.
gsap.registerPlugin(Flip);

/**
 * App đã tôn trọng prefers-reduced-motion ở 3 chỗ (index.css:23 hạ mọi
 * transition/animation về 1ms, và 2 chỗ JS trong Report1). GSAP chạy bằng
 * requestAnimationFrame nên KHÔNG bị block bởi CSS đó — phải tự kiểm tra,
 * nếu không thì bật reduce-motion xong app vẫn animate y như cũ.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Có nên animate ở thời điểm này không. Dùng cái này thay vì gọi
 * prefersReducedMotion() trực tiếp.
 *
 * Ngoài reduce-motion, hàm này còn chặn khi document đang ẩn. Lý do rất cụ
 * thể: trình duyệt cho requestAnimationFrame về 0 callback khi trang không
 * composite frame, mà cả GSAP lẫn morphicons đều chạy bằng rAF. Với animation
 * kiểu gsap.from()/fromTo() thì trạng thái ĐẦU (opacity 0) được ghi vào inline
 * style ngay lập tức, còn trạng thái cuối phải chờ tick — nên nếu tick không
 * bao giờ tới, khối nội dung nằm im ở opacity 0 và người dùng thấy trang trắng.
 *
 * Trường hợp này đo được thật: mở app trong tab ẩn thì 5 khối của tab Leadtime
 * đều đứng ở "transform: translate(0px, 18px); opacity: 0". App còn được embed
 * trong iframe của Control Tower nên càng phải phòng. Bỏ animation là mất một
 * thứ trang trí; mất nội dung thì không đánh đổi được.
 */
export function shouldAnimate() {
  if (prefersReducedMotion()) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  return true;
}

/**
 * Chạy `fn` bằng GSAP, nhưng bỏ qua khi user bật reduce-motion. Trả về hàm
 * cleanup để useEffect gọi lúc unmount — mọi tween/ScrollTrigger tạo bên
 * trong `fn` đều bị revert, kể cả khi component chết giữa lúc đang bay.
 *
 * Dùng gsap.context() thay vì tự gom tween: context bắt cả tween lồng trong
 * timeline con và cả ScrollTrigger instance, thứ mà việc gom tay dễ bỏ sót.
 */
export function runAnimation(fn, scope) {
  if (!shouldAnimate()) return () => {};
  const ctx = gsap.context(fn, scope);
  return () => ctx.revert();
}

/**
 * Ép mọi tween đang bay về trạng thái cuối, ngay lập tức.
 *
 * Cần cho việc xuất ảnh: Report1/Report5 chụp DOM bằng html-to-image
 * (htmlToImage.toPng) — nếu bấm "Chụp ảnh" đúng lúc một tween đang chạy, GSAP
 * đang giữ transform/opacity dở dang trên element và ảnh xuất ra sẽ dính
 * trạng thái nửa vời đó (row lệch, card mờ). Gọi hàm này trước khi chụp.
 */
export function settleAnimations() {
  // Không dùng gsap.globalTimeline.progress(1): globalTimeline có duration vô
  // hạn nên progress(1) trên nó không có nghĩa gì. Phải đi qua từng child.
  // getChildren(nested, tweens, timelines) — cả 3 = true để lấy luôn tween nằm
  // trong timeline con (modal/toast đều dùng timeline, không phải tween lẻ).
  gsap.globalTimeline.getChildren(true, true, true).forEach((anim) => {
    if (anim.progress() < 1) anim.progress(1);
  });
}

export { gsap, Flip };
