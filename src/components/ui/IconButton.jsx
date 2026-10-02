import AnimatedIcon from './AnimatedIcon';
export default function IconButton({ icon, label, detail, className = '', ...props }) {
  return <button type="button" className={`nav-btn-sleek icon-btn ${className}`} aria-label={label} data-tooltip={label} data-tooltip-detail={detail} {...props}><AnimatedIcon name={icon} /></button>;
}
