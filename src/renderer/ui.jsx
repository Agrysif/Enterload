import React, { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronsUpDown, LuX } from 'react-icons/lu';
import { t } from '../i18n';

// The same bug icon as in the other apps of the author, drawn like the react-icons set (1em, 2px stroke)
export const BugIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8 2 1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Zm0 0v-9M6.5 13H3m18 0h-3.5M6 9.5 3 8m15 1.5L21 8M6 17l-3 1.5m15-1.5 3 1.5" />
  </svg>
);

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
  // A hint (e.g. a full folder path) stays a tooltip, the button is named by its title:
  // the "Report a problem" log records clicks by name and must not get the path
  return onClick
    ? <button type="button" className={className} onClick={onClick} title={hint} aria-label={hint && typeof title === 'string' ? title : undefined}>{content}</button>
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
          <IconButton icon={<LuX />} label={t('common.close')} className="filled" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
};
