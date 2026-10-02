import { memo } from 'react';
import MorphIcon from './MorphIcon';
import { icons, iconSvg } from './iconMotion';

// State changes morph the stroke paths; hover animates their individual parts.
function AnimatedIcon({ name, size = 20 }) {
  return <span className="animated-icon" data-motion={name} style={{ '--icon-size': `${size}px` }} aria-hidden="true">
    <span className="morph-base"><MorphIcon icon={icons[name] || icons.CircleHelp} size={size} strokeWidth={1.8} /></span>
    <span className="motion-layer" dangerouslySetInnerHTML={{ __html: iconSvg(icons[name] ? name : 'CircleHelp', size) }} />
  </span>;
}

// Keep multipart SVG nodes stable while the surrounding popup changes state.
export default memo(AnimatedIcon);
