import { useEffect, useRef, type ReactNode } from 'react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, titleId, ariaLabel, className = '', children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger element that opened the dialog
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // Lock background scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Mark other root children as inert so screen readers and keyboard cannot escape
    const rootEl = document.getElementById('root');
    const siblings: HTMLElement[] = [];
    if (rootEl) {
      for (let i = 0; i < rootEl.children.length; i++) {
        const child = rootEl.children[i] as HTMLElement;
        if (child && !child.contains(overlayRef.current) && child !== overlayRef.current) {
          if (!child.hasAttribute('inert')) {
            child.setAttribute('inert', '');
            siblings.push(child);
          }
        }
      }
    }

    // Auto-focus the close button or first focusable element inside the modal
    const focusTimer = requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const focusable = contentRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstEl = focusable[0];
      if (firstEl) {
        firstEl.focus();
      } else {
        contentRef.current.focus();
      }
    });

    // Handle Escape and Tab trapping
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!contentRef.current) return;
        const focusable = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !contentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            if (last) last.focus();
          }
        } else {
          if (document.activeElement === last || !contentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            if (first) first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(focusTimer);
      document.body.style.overflow = originalOverflow;
      for (const sib of siblings) {
        sib.removeAttribute('inert');
      }
      window.removeEventListener('keydown', handleKeyDown, true);

      // Return focus to previous active element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={ariaLabel}
      onClick={e => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div ref={contentRef} className={`modal-content ${className}`} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
