import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';

/**
 * Bottom sheet on phones, centred dialog on wider screens. Built on <dialog> so focus
 * is trapped, Escape closes it and the page behind is inert.
 */
export default function Sheet({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      // React bubbles close/cancel from a nested sheet (e.g. a picker inside the composer)
      // up to this one, so only react to events from this dialog itself.
      onClose={(e) => {
        if (e.target !== ref.current) return;
        if (open) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== ref.current) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-panel">
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{open && children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
