import { validateScenario, type HistoricalTime, type ScenarioDefinition } from '@/lib/scenarios/schema';
import { directCamera, distance, returnCamera, type CameraPose } from '@/lib/scenarios/camera';
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
    /** True once the map and the step's scene have loaded at the current camera; `sceneOnly` skips the map's own tiles (mid-step arrivals). */
    ready?(requirements: string[], sceneOnly?: boolean): boolean;
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
    private returnPath?: ReturnType<typeof returnCamera>;
    private returnElapsed = 0;
    /** A user-chosen step started far away: the return flight replaces the step's own approach. */
    private leadIn = false;
    /** Holding progress until the step's scene has loaded; gives up after a while so a failed load cannot stall the journey. */
    private waiting = false;
    private waited = 0;
    /** The wait is at the end of a flight within a step, so the map's own tiles need not hold it. */
    private waitingSceneOnly = false;
    /** The current action has already paused once at its end for its scene. */
    private endHeld = false;
    private detailLifted = false;
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
        this.waiting = false;
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
        this.endHeld = false;
        this.detailLifted = false;
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
        this.leadIn = false;
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
            this.startLeadIn();
            this.schedule();
        }
        catch (e) {
            this.fail(e);
        }
    }
    private holdForScene(arrived = false) {
        this.waited = 0;
        this.waitingSceneOnly = arrived;
        this.waiting = (arrived || !this.snapshot.returning) && !!this.ports.ready && !this.ports.ready(this.scenario!.beats[this.snapshot.beat].sceneRequirements ?? [], arrived);
        // Detail only streams in while the camera is parked and not "travelling", so lift that for the wait.
        if (this.waiting && this.intent)
            this.ports.streaming?.({ ...this.intent, focus: this.ports.camera.read().center, travelling: false });
    }
    /** Far from the scene (say, zoomed in on another continent): pull back, pan to it and descend before the step plays. */
    private startLeadIn() {
        const camera = this.action.camera, now = this.ports.camera.read();
        if (camera.type === 'hold' || (camera.type === 'flyTo' && camera.transition === 'zoomPanZoom'))
            return;
        const center = camera.type === 'followRoute' ? this.scenario!.content.routes.find(r => r.id === camera.route)!.coordinates[0] : camera.center;
        const target: CameraPose = { center, zoom: camera.zoom, pitch: camera.pitch ?? now.pitch, bearing: ('bearing' in camera && camera.bearing !== undefined) ? camera.bearing : now.bearing };
        const scene = !!this.scenario!.beats[this.snapshot.beat].sceneRequirements?.length;
        // A step with a scene always parks at its view first so the scene's detail can load before progress starts.
        if (distance(now.center, center) < (scene ? 1 : .25 * 156543 * Math.cos(now.center[1] * Math.PI / 180) * 1000 / 2 ** now.zoom) && (!scene || Math.abs(now.zoom - target.zoom) < .05)) {
            if (scene)
                this.holdForScene();
            return;
        }
        this.saved = target;
        this.leadIn = true;
        this.returnPath = returnCamera(now, target);
        this.returnElapsed = 0;
        this.publish({ returning: true, savedPose: target });
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
            this.returnPath = returnCamera(this.ports.camera.read(), this.saved);
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
        this.leadIn = false;
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
            const dt = this.last === undefined ? 0 : Math.max(0, Math.min(100, now - this.last));
            this.last = now;
            if (this.waiting) {
                this.waited += dt;
                if (!this.ports.ready!(this.scenario!.beats[this.snapshot.beat].sceneRequirements ?? [], this.waitingSceneOnly) && this.waited < 20000) {
                    this.schedule();
                    return;
                }
                this.waiting = false;
                this.ports.streaming?.(this.intent);
            }
            if (this.snapshot.state === 'preparing') this.publish({ state: 'playing' });
            if (this.snapshot.returning) {
                this.returnElapsed += dt;
                const t = Math.min(1, this.returnElapsed / this.returnPath!.duration);
                this.ports.camera.write(this.returnPath!.sample(t));
                if (t === 1) {
                    this.publish({ returning: false });
                    this.holdForScene();
                    if (this.waiting) this.publish({ state: 'preparing' });
                    if (this.leadIn) {
                        this.leadIn = false;
                        this.sample = directCamera(this.action.camera, this.saved!, this.scenario!);
                        if (this.action.camera.type === 'flyTo')
                            this.publish({ elapsed: this.action.camera.duration });
                    }
                    // While holding for the scene, keep the parked intent holdForScene sent: re-sending the flight's would mark the
                    // camera as travelling again and stop the very detail being waited for.
                    if (!this.waiting) this.ports.streaming?.(this.intent);
                }
            }
            else {
                const elapsed = Math.min(this.action.camera.duration, this.snapshot.elapsed + dt);
                this.ports.camera.write(this.sample!(elapsed / this.action.camera.duration));
                this.publish({ elapsed });
                // Start streaming the scene's detail for the last stretch of a flight, so it is ready on arrival.
                if (!this.detailLifted && this.intent?.travelling && this.action.camera.type === 'flyTo' && elapsed >= this.action.camera.duration * .6 && this.scenario!.beats[this.snapshot.beat].sceneRequirements?.length) {
                    this.detailLifted = true;
                    this.ports.streaming?.({ ...this.intent, travelling: false });
                }
                this.updateProgress();
                if (elapsed === this.action.camera.duration && !this.endHeld) {
                    // Arrived: let this beat's scene finish loading while parked, rather than during the next beat.
                    this.endHeld = true;
                    this.holdForScene(true);
                    if (this.waiting) {
                        this.publish({ state: 'preparing' });
                        this.schedule();
                        return;
                    }
                }
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
