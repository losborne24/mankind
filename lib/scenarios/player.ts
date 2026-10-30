import { validateScenario, type HistoricalTime, type ScenarioDefinition } from '@/lib/scenarios/schema';
import { directCamera, mixPose, smooth, type CameraPose } from '@/lib/scenarios/camera';
export type PlayerState = 'idle' | 'preparing' | 'playing' | 'paused' | 'completed' | 'error';
export interface StreamingIntent {
    focus: CameraPose['center'];
    destination?: CameraPose['center'];
    route?: CameraPose['center'][];
    arrivalInMs: number;
    detail: 'map' | 'local';
    importance: 'narrative';
    travelling: boolean;
}
export interface PlayerPorts {
    camera: {
        read(): CameraPose;
        write(pose: CameraPose): void;
        stop(): void;
    };
    timeline(time: HistoricalTime): void;
    overlays(ids: string[], scenario: ScenarioDefinition): void;
    scenes?(requirements: string[], scenario: ScenarioDefinition, time: HistoricalTime): { warning?: string };
    releaseScenes?(): void;
    streaming?(intent: StreamingIntent | null): void;
    frame(callback: (now: number) => void): number;
    cancelFrame(id: number): void;
}
export interface PlayerSnapshot {
    state: PlayerState;
    beat: number;
    action: number;
    elapsed: number;
    totalElapsed: number;
    progress: number;
    returning: boolean;
    suspendedForExploration?: boolean;
    reason?: string;
    error?: string;
    warning?: string;
    command?: string;
    intendedTime?: HistoricalTime;
    savedPose?: CameraPose;
    owner: 'scenario' | 'user';
}
export class ScenarioPlayer {
    scenario?: ScenarioDefinition;
    snapshot: PlayerSnapshot = { state: 'idle', beat: 0, action: 0, elapsed: 0, totalElapsed: 0, progress: 0, returning: false, owner: 'user' };
    private listeners = new Set<() => void>();
    private raf: number | undefined;
    private last: number | undefined;
    private sample?: (t: number) => CameraPose;
    private saved?: CameraPose;
    private returnStart?: CameraPose;
    private returnElapsed = 0;
    private destroyed = false;
    private intent: StreamingIntent | null = null;
    constructor(private ports: PlayerPorts) {
    }
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    getSnapshot = () => this.snapshot;
    private publish(patch: Partial<PlayerSnapshot>) {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    private cancel() {
        if (this.raf !== undefined)
            this.ports.cancelFrame(this.raf);
        this.raf = undefined;
        this.last = undefined;
        this.ports.camera.stop();
        this.ports.streaming?.(null);
    }
    load(value: unknown) {
        if (this.destroyed)
            return;
        this.stop();
        try {
            this.scenario = validateScenario(value);
            this.publish({ state: 'idle', error: undefined, warning: undefined });
        }
        catch (e) {
            this.scenario = undefined;
            this.fail(e);
        }
    }
    play() {
        if (this.destroyed || !this.scenario)
            return;
        if (this.snapshot.state === 'paused') {
            this.resume();
            return;
        }
        this.jump(0);
    }
    private get action() {
        return this.scenario!.beats[this.snapshot.beat].actions[this.snapshot.action];
    }
    private prepare() {
        const scenario = this.scenario!, action = this.action, camera = action.camera;
        if (action.time)
            this.publish({ intendedTime: action.time });
        if (this.snapshot.intendedTime)
            this.ports.timeline(this.snapshot.intendedTime);
        this.ports.overlays(action.overlays, scenario);
        const requirements = scenario.beats[this.snapshot.beat].sceneRequirements ?? [];
        this.publish({ warning: this.ports.scenes ? this.ports.scenes(requirements, scenario, this.snapshot.intendedTime!).warning : requirements.length ? 'Requested scene unavailable; map and geographic overlays remain available.' : undefined });
        this.sample = directCamera(camera, this.ports.camera.read(), scenario);
        const next = scenario.beats[this.snapshot.beat + 1]?.actions[0].camera;
        this.intent = { focus: this.ports.camera.read().center, destination: 'center' in camera ? camera.center : next && 'center' in next ? next.center : undefined, route: camera.type === 'followRoute' ? scenario.content.routes.find(r => r.id === camera.route)?.coordinates : undefined, arrivalInMs: camera.duration, detail: 'map', importance: 'narrative', // An orbit stays put around its subject, so detail may stream in during it; only a flight or route is travel.
        travelling: camera.type === 'flyTo' || camera.type === 'followRoute' };
        this.ports.streaming?.(this.intent);
        this.publish({ owner: 'scenario', command: camera.type });
    }
    jump(beat: number) {
        if (this.destroyed || !this.scenario || !Number.isInteger(beat) || beat < 0 || beat >= this.scenario.beats.length)
            return;
        this.cancel();
        this.saved = undefined;
        this.publish({ state: 'preparing', beat, action: 0, elapsed: 0, returning: false, suspendedForExploration: false, error: undefined, reason: undefined, intendedTime: undefined, savedPose: undefined });
        try {
            // Rebuild temporal context deterministically when jumping over actions.
            let intended: HistoricalTime = this.scenario.scope.time;
            for (let b = 0; b <= beat; b++)
                for (const a of this.scenario.beats[b].actions) {
                    if (b === beat)
                        break;
                    if (a.time)
                        intended = a.time;
                }
            this.publish({ intendedTime: intended });
            this.updateProgress();
            this.prepare();
            this.schedule();
        }
        catch (e) {
            this.fail(e);
        }
    }
    pause(reason = 'Playback paused') {
        if (this.destroyed || !['playing', 'preparing'].includes(this.snapshot.state))
            return;
        if (!this.snapshot.returning)
            this.saved = this.ports.camera.read();
        this.cancel();
        this.publish({ state: 'paused', owner: 'user', reason, savedPose: this.saved });
    }
    exploreFreely() {
        if (!['playing', 'preparing', 'paused', 'completed'].includes(this.snapshot.state)) return;
        this.pause('Exploring freely');
        this.publish({ suspendedForExploration: true });
    }
    resume() {
        if (this.destroyed || this.snapshot.state !== 'paused' || !this.saved)
            return;
        try {
            this.ports.camera.stop();
            this.returnStart = this.ports.camera.read();
            this.returnElapsed = 0;
            this.ports.streaming?.(this.intent ? { ...this.intent, travelling: true } : null);
            if (this.snapshot.intendedTime)
                this.ports.timeline(this.snapshot.intendedTime);
            if (this.ports.scenes) this.publish({ warning: this.ports.scenes(this.scenario!.beats[this.snapshot.beat].sceneRequirements ?? [], this.scenario!, this.snapshot.intendedTime!).warning });
            this.publish({ state: 'playing', suspendedForExploration: false, returning: true, owner: 'scenario', reason: undefined });
            this.schedule();
        }
        catch (e) {
            this.fail(e);
        }
    }
    skip() {
        if (this.destroyed)
            return;
        if (this.scenario && this.snapshot.beat < this.scenario.beats.length - 1)
            this.jump(this.snapshot.beat + 1);
        else
            this.complete();
    }
    restart() {
        this.jump(0);
    }
    stop() {
        if (this.destroyed)
            return;
        this.cancel();
        this.saved = undefined;
        this.sample = undefined;
        this.ports.releaseScenes?.();
        if (this.scenario)
            this.ports.overlays([], this.scenario);
        this.publish({ state: 'idle', beat: 0, action: 0, elapsed: 0, totalElapsed: 0, progress: 0, returning: false, suspendedForExploration: false, owner: 'user', savedPose: undefined, intendedTime: undefined, command: undefined, reason: undefined, warning: undefined });
    }
    dispose() {
        if (this.destroyed)
            return;
        this.stop();
        this.destroyed = true;
        this.listeners.clear();
    }
    private complete() {
        this.cancel();
        this.publish({ state: 'completed', returning: false, progress: 1, owner: 'user' });
    }
    private fail(e: unknown) {
        this.cancel();
        this.publish({ state: 'error', owner: 'user', error: e instanceof Error ? e.message : String(e) });
    }
    private schedule() {
        if (this.raf !== undefined || this.destroyed)
            return;
        this.raf = this.ports.frame(this.tick);
    }
    private tick = (now: number) => {
        this.raf = undefined;
        if (this.destroyed || !['preparing', 'playing'].includes(this.snapshot.state))
            return;
        try {
            if (this.snapshot.state === 'preparing') this.publish({ state: 'playing' });
            const dt = this.last === undefined ? 0 : Math.max(0, Math.min(100, now - this.last));
            this.last = now;
            if (this.snapshot.returning) {
                this.returnElapsed += dt;
                const t = Math.min(1, this.returnElapsed / 1800);
                this.ports.camera.write(mixPose(this.returnStart!, this.saved!, smooth(t)));
                if (t === 1) {
                    this.publish({ returning: false });
                    this.ports.streaming?.(this.intent);
                }
            }
            else {
                const elapsed = Math.min(this.action.camera.duration, this.snapshot.elapsed + dt);
                this.ports.camera.write(this.sample!(elapsed / this.action.camera.duration));
                this.publish({ elapsed });
                this.updateProgress();
                if (elapsed === this.action.camera.duration) {
                    const beat = this.scenario!.beats[this.snapshot.beat];
                    if (this.snapshot.action + 1 < beat.actions.length) {
                        this.publish({ action: this.snapshot.action + 1, elapsed: 0 });
                        this.prepare();
                    }
                    else if (this.snapshot.beat + 1 < this.scenario!.beats.length) {
                        this.publish({ beat: this.snapshot.beat + 1, action: 0, elapsed: 0 });
                        this.prepare();
                    }
                    else {
                        this.complete();
                        return;
                    }
                }
            }
            this.schedule();
        }
        catch (e) {
            this.fail(e);
        }
    };
    private updateProgress() {
        let total = 0, done = 0;
        this.scenario!.beats.forEach((b, bi) => b.actions.forEach((a, ai) => {
            total += a.camera.duration;
            if (bi < this.snapshot.beat || (bi === this.snapshot.beat && ai < this.snapshot.action))
                done += a.camera.duration;
        }));
        done += this.snapshot.elapsed;
        this.publish({ totalElapsed: done, progress: done / total });
    }
}
