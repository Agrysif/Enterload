import React, { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronsUpDown, LuX } from 'react-icons/lu';

export const Switch = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`switch${checked ? ' on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="switch-knob" />
  </button>
);

export const Segmented = ({ options, value, onChange, className = '' }) => {
  const index = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div className={`segmented ${className}`} role="tablist" style={{ '--count': options.length, '--index': index }}>
      <span className="segmented-thumb" />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

export const Group = ({ title, action, footer, children, className = '' }) => (
  <section className={`group ${className}`}>
    {title && (action ? (
      <div className="group-title-row">
        <h3 className="group-title">{title}</h3>
        {action}
      </div>
    ) : <h3 className="group-title">{title}</h3>)}
    <div className="group-body">{children}</div>
    {footer && <p className="group-footer">{footer}</p>}
  </section>
);

export const Row = ({ icon, title, subtitle, children, onClick, hint }) => {
  const className = `row${onClick ? ' row-button' : ''}${icon ? '' : ' no-icon'}`;
  const content = (
    <>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </span>
      {children != null && <span className="row-accessory">{children}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={className} onClick={onClick} title={hint}>{content}</button>
    : <div className={className} title={hint}>{content}</div>;
};

export const IconButton = ({ icon, label, onClick, disabled, className = '', children }) => (
  <button
    type="button"
    className={`icon-btn ${className}`}
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
  >
    {icon}
    {children}
  </button>
);

export const EmptyState = ({ icon, title, text, action, tone = '' }) => (
  <div className={`empty ${tone}`}>
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {action}
  </div>
);

// Closes a popover on outside click or Escape
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, ref]);
}

// iOS-style pop-up button: shows the current value, opens a list with a checkmark
export const Menu = ({ value, options, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const current = options.find(o => o.value === value);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="menu-trigger" onClick={() => setOpen(v => !v)} aria-label={label} aria-expanded={open}>
        {current?.label}
        <LuChevronsUpDown />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              className="menu-item"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="check">{o.value === value && <LuCheck />}</span>
              {o.label}
              {o.hint && <small>{o.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Sheet = ({ title, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-header">
          <h3>{title}</h3>
          <IconButton icon={<LuX />} label="Закрыть" className="filled" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
};
