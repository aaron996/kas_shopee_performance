export default function StatusNotice({ tone = 'info', children, className = '', ...props }) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div className={`status-notice status-notice--${tone} ${className}`.trim()} role={role} {...props}>
      {children}
    </div>
  );
}
