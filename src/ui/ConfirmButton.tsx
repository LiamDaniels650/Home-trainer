import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Bouton à confirmer par un second appui (ne dépend pas de window.confirm, peu fiable dans les navigateurs intégrés). */
export function ConfirmButton({ children, confirmLabel = 'Appuie encore pour confirmer', onConfirm, class: cls = '', style, disabled }:
  { children: ComponentChildren; confirmLabel?: string; onConfirm: () => void | Promise<void>; class?: string; style?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button class={cls} style={style} disabled={disabled} onClick={async () => {
      if (!armed) { setArmed(true); return; }
      setArmed(false);
      await onConfirm();
    }}>{armed ? confirmLabel : children}</button>
  );
}
