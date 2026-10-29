/** Capture real input before map handlers run. Camera movement events alone are not user intent. */
export function attachScenarioInput(container: HTMLElement, interrupt: (reason: string) => void) {
    const pointer = (e: PointerEvent) => interrupt(e.pointerType === 'touch' ? 'Touch navigation' : 'Mouse navigation');
    const wheel = () => interrupt('Scroll zoom');
    const key = (e: KeyboardEvent) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '=', 'PageUp', 'PageDown'].includes(e.key))
            interrupt('Keyboard navigation');
    };
    container.addEventListener('pointerdown', pointer, true);
    container.addEventListener('wheel', wheel, { capture: true, passive: true });
    container.addEventListener('keydown', key, true);
    return () => {
        container.removeEventListener('pointerdown', pointer, { capture: true });
        container.removeEventListener('wheel', wheel, { capture: true });
        container.removeEventListener('keydown', key, { capture: true });
    };
}
