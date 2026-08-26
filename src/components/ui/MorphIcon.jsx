import React from 'react';
import { MorphIcon as BaseMorphIcon } from 'morphicons/react';

/**
 * Wrapper quanh morphicons/react. Tồn tại vì 2 lý do, đừng import
 * 'morphicons/react' trực tiếp ở component khác:
 *
 * 1. reducedMotion: BaseMorphIcon mặc định là "never" — tức là VẪN animate dù
 *    OS bật reduce-motion. App này đã tôn trọng prefers-reduced-motion ở
 *    index.css:23 và 2 chỗ trong Report1, nên để mặc định là tự mâu thuẫn với
 *    chính mình. Ở đây chốt "user": khi user bật reduce-motion thì morph rơi
 *    về đổi icon tức thời.
 *
 * 2. Icon data, không phải component: morphicons nhận IconNode (mảng
 *    [tag, attrs]) từ package `lucide`, KHÔNG nhận component từ
 *    `lucide-react`. Hai package sống song song có chủ đích và đều tree-shake;
 *    chỗ nào icon tĩnh thì vẫn dùng lucide-react như cũ, chỗ nào cần morph thì
 *    import data từ `lucide`. Giữ 2 version cùng major để hình icon khớp nhau.
 *
 * Prop còn lại (size, color, strokeWidth, className, ...) pass thẳng xuống,
 * cùng bộ với lucide-react nên gọi y như icon cũ.
 */
export default function MorphIcon({ spring = 'snappy', ...props }) {
  return <BaseMorphIcon spring={spring} reducedMotion="user" {...props} />;
}
