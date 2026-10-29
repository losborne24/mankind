/** Version 1 is JSON only. Content describes the world; direction references it. */
export type Coordinate = [
    number,
    number
];
export type HistoricalDate = {
    year: number;
    month?: number;
    day?: number;
};
export type HistoricalTime = {
    start: HistoricalDate;
    end?: HistoricalDate;
};
export type Certainty = 'established' | 'illustrative' | 'unverified';
export type CameraCommand = {
    type: 'flyTo';
    center: Coordinate;
    zoom: number;
    pitch?: number;
    bearing?: number;
    duration: number;
    easing?: 'linear' | 'smooth';
    transition?: 'cinematic' | 'zoomPanZoom';
} | {
    type: 'orbit';
    center: Coordinate;
    zoom: number;
    pitch: number;
    degrees: number;
    duration: number;
} | {
    type: 'followRoute';
    route: string;
    zoom: number;
    pitch: number;
    lookAt?: Coordinate;
    duration: number;
} | {
    type: 'hold';
    duration: number;
};
export type ScenarioOverlay = {
    id: string;
    type: 'point';
    location: string;
} | {
    id: string;
    type: 'route';
    route: string;
} | {
    id: string;
    type: 'card' | 'caption';
    title?: string;
    text: string;
    sources?: string[];
};
export interface ScenarioDefinition {
    version: 1;
    id: string;
    title: string;
    description: string;
    scope: {
        bounds: [
            number,
            number,
            number,
            number
        ];
        time: HistoricalTime;
    };
    content: {
        sources: {
            id: string;
            title: string;
            url: string;
        }[];
        locations: {
            id: string;
            title: string;
            coordinate: Coordinate;
            certainty: Certainty;
            sources: string[];
        }[];
        routes: {
            id: string;
            coordinates: Coordinate[];
            certainty: Certainty;
            sources: string[];
            time?: HistoricalTime;
        }[];
        scenes?: {
            id: string;
            description: string;
            certainty: Certainty;
            sources: string[];
            required: boolean;
        }[];
        overlays: ScenarioOverlay[];
    };
    beats: {
        id: string;
        title: string;
        explorationPrompt?: string;
        sceneRequirements?: string[];
        actions: {
            camera: CameraCommand;
            time?: HistoricalTime;
            overlays: string[];
        }[];
    }[];
}
const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('Expected object');
    return v as Record<string, unknown>;
};
const list = (v: unknown): unknown[] => {
    if (!Array.isArray(v) || v.length > 10000)
        throw Error('Expected bounded array');
    return v;
};
const str = (v: unknown): string => {
    if (typeof v !== 'string' || !v.length || v.length > 10000)
        throw Error('Expected nonempty text');
    return v;
};
const num = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
        throw Error(`Number outside ${min}…${max}`);
    return v;
};
const coord = (v: unknown) => {
    const a = list(v);
    if (a.length !== 2)
        throw Error('Coordinate needs two numbers');
    num(a[0], -180, 180);
    num(a[1], -85, 85);
};
const date = (v: unknown) => {
    const d = object(v);
    const y = num(d.year, -2999, 2025);
    if (!Number.isInteger(y))
        throw Error('Integer year required');
    if (d.day !== undefined && d.month === undefined)
        throw Error('Day needs month');
    if (d.month !== undefined) {
        const m = num(d.month, 1, 12);
        if (!Number.isInteger(m))
            throw Error('Integer month required');
        if (d.day !== undefined) {
            const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
            const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            const n = num(d.day, 1, days[m - 1]);
            if (!Number.isInteger(n))
                throw Error('Integer day required');
        }
    }
};
const time = (v: unknown) => {
    const t = object(v);
    date(t.start);
    if (t.end !== undefined) {
        date(t.end);
        const key = (v: unknown) => {
            const d = object(v);
            return (d.year as number) * 372 + ((d.month as number) || 1) * 31 + ((d.day as number) || 1);
        };
        if (key(t.end) < key(t.start))
            throw Error('Reversed interval');
    }
};
export function validateScenario(value: unknown): ScenarioDefinition {
    // Reject functions, undefined, cycles and non-JSON objects before cloning input.
    const ancestors = new Set<object>();
    let nodes = 0;
    const walk = (v: unknown, depth = 0): void => {
        if (++nodes > 100000 || depth > 32)
            throw Error('Scenario exceeds JSON complexity limit');
        if (v === null || typeof v === 'string' || typeof v === 'boolean')
            return;
        if (typeof v === 'number' && Number.isFinite(v))
            return;
        if (v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype)) {
            if (ancestors.has(v)) throw Error('Scenario must be acyclic JSON');
            ancestors.add(v);
            const values = Array.isArray(v) ? list(v) : Object.values(v);
            values.forEach(child => walk(child, depth + 1));
            ancestors.delete(v);
            return;
        }
        throw Error('Scenario must be plain JSON');
    };
    walk(value);
    const s = object(value);
    if (s.version !== 1)
        throw Error('Unsupported scenario version');
    ['id', 'title', 'description'].forEach(k => str(s[k]));
    const scope = object(s.scope), bounds = list(scope.bounds);
    if (bounds.length !== 4)
        throw Error('Bounds need four numbers');
    coord(bounds.slice(0, 2));
    coord(bounds.slice(2));
    if ((bounds[1] as number) > (bounds[3] as number))
        throw Error('Reversed latitude bounds');
    time(scope.time);
    const c = object(s.content);
    const ids = (v: unknown) => {
        const result = new Set<string>();
        for (const x of list(v)) {
            const id = str(object(x).id);
            if (result.has(id))
                throw Error('Duplicate ID');
            result.add(id);
        }
        return result;
    };
    const sources = ids(c.sources), locations = ids(c.locations), routes = ids(c.routes), overlays = ids(c.overlays), scenes = ids(c.scenes ?? []);
    const refs = (v: unknown, set: Set<string>) => list(v).forEach(x => {
        if (!set.has(str(x)))
            throw Error(`Unknown reference ${x}`);
    });
    const provenance = (v: Record<string, unknown>) => {
        if (!['established', 'illustrative', 'unverified'].includes(str(v.certainty)))
            throw Error('Unknown certainty');
        refs(v.sources, sources);
    };
    for (const x of list(c.sources)) {
        const v = object(x);
        str(v.title);
        if (!/^https?:\/\//.test(str(v.url)))
            throw Error('Source needs HTTP URL');
    }
    for (const x of list(c.locations)) {
        const v = object(x);
        str(v.title);
        coord(v.coordinate);
        provenance(v);
    }
    for (const x of list(c.routes)) {
        const v = object(x);
        if (list(v.coordinates).length < 2)
            throw Error('Route needs two points');
        list(v.coordinates).forEach(coord);
        provenance(v);
        if (v.time)
            time(v.time);
    }
    for (const x of list(c.scenes ?? [])) {
        const v = object(x);
        str(v.description);
        provenance(v);
        if (typeof v.required !== 'boolean')
            throw Error('Expected required flag');
    }
    for (const x of list(c.overlays)) {
        const v = object(x);
        switch (v.type) {
            case 'point':
                refs([v.location], locations);
                break;
            case 'route':
                refs([v.route], routes);
                break;
            case 'caption':
            case 'card':
                str(v.text);
                if (v.title !== undefined)
                    str(v.title);
                if (v.sources)
                    refs(v.sources, sources);
                break;
            default: throw Error('Unknown overlay');
        }
    }
    ids(s.beats);
    if (!list(s.beats).length)
        throw Error('Scenario needs beats');
    let actionCount = 0, totalDuration = 0;
    for (const b of list(s.beats)) {
        const beat = object(b);
        str(beat.title);
        if (beat.explorationPrompt !== undefined)
            str(beat.explorationPrompt);
        if (beat.sceneRequirements)
            refs(beat.sceneRequirements, scenes);
        if (!list(beat.actions).length)
            throw Error('Beat needs actions');
        for (const a of list(beat.actions)) {
            const action = object(a);
            refs(action.overlays, overlays);
            if (action.time)
                time(action.time);
            const camera = object(action.camera);
            num(camera.duration, 100, 180000);
            totalDuration += camera.duration as number;
            if (++actionCount > 1000 || totalDuration > 3600000)
                throw Error('Scenario exceeds 1000 actions or one hour');
            switch (camera.type) {
                case 'flyTo':
                    coord(camera.center);
                    num(camera.zoom, 0, 20);
                    if (camera.easing !== undefined && !['linear', 'smooth'].includes(str(camera.easing)))
                        throw Error('Unknown easing');
                    if (camera.transition !== undefined && !['cinematic', 'zoomPanZoom'].includes(str(camera.transition)))
                        throw Error('Unknown transition');
                    break;
                case 'orbit':
                    coord(camera.center);
                    num(camera.zoom, 0, 20);
                    num(camera.pitch, 0, 65);
                    num(camera.degrees, -720, 720);
                    break;
                case 'followRoute':
                    refs([camera.route], routes);
                    num(camera.zoom, 0, 20);
                    num(camera.pitch, 0, 65);
                    if (camera.lookAt)
                        coord(camera.lookAt);
                    break;
                case 'hold': break;
                default: throw Error('Unknown camera command');
            }
            if (camera.pitch !== undefined)
                num(camera.pitch, 0, 65);
            if (camera.bearing !== undefined)
                num(camera.bearing, -360, 360);
        }
    }
    return JSON.parse(JSON.stringify(value)) as ScenarioDefinition;
}
