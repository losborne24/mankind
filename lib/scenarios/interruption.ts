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

/** Only explicit navigation controls take ownership; inspecting debug UI is inert. */
export function attachScenarioControls(root: EventTarget, player: { pause(reason: string): void; stop(): void }) {
    const manual = (event: Event) => {
        const target = event.target as Element | null;
        // Resetting diagnostics at pointerdown can move the clicked fixture button
        // before pointerup. Release on activation, still before its React handler.
        if (target?.closest?.('[data-scenario-exit]')) {
            if (event.type === 'click' || event.type === 'input') player.stop();
        }
        else if (target?.closest?.('[aria-label="Historical timeline"]')) player.pause('Timeline manipulation');
        else if (target?.closest?.('[data-manual-camera]')) player.pause('Manual camera control');
    };
    const events = ['pointerdown', 'keydown', 'input', 'click'];
    for (const type of events) root.addEventListener(type, manual, { capture: true });
    return () => { for (const type of events) root.removeEventListener(type, manual, { capture: true }); };
}
