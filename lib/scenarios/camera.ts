import type { CameraCommand, Coordinate, ScenarioDefinition } from '@/lib/scenarios/schema';
export interface CameraPose {
    center: Coordinate;
    zoom: number;
    pitch: number;
    bearing: number;
}
export const angleDelta = (a: number, b: number) => ((b - a + 180) % 360 + 360) % 360 - 180;
const rad = Math.PI / 180;
export function distance(a: Coordinate, b: Coordinate): number {
    const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(angleDelta(a[0], b[0]) * rad / 2) ** 2;
    return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
/** Great-circle interpolation avoids dateline travel through Greenwich. */
export function coordinateAt(a: Coordinate, b: Coordinate, t: number): Coordinate {
    if (t <= 0)
        return [...a];
    if (t >= 1)
        return [...b];
    const delta = distance(a, b) / 6371008.8;
    if (delta < 1e-9 || Math.abs(Math.sin(delta)) < 1e-8)
        return [a[0] + angleDelta(a[0], b[0]) * t, a[1] + (b[1] - a[1]) * t];
    const u = Math.sin((1 - t) * delta) / Math.sin(delta), v = Math.sin(t * delta) / Math.sin(delta);
    const x = u * Math.cos(a[1] * rad) * Math.cos(a[0] * rad) + v * Math.cos(b[1] * rad) * Math.cos(b[0] * rad), y = u * Math.cos(a[1] * rad) * Math.sin(a[0] * rad) + v * Math.cos(b[1] * rad) * Math.sin(b[0] * rad), z = u * Math.sin(a[1] * rad) + v * Math.sin(b[1] * rad);
    return [Math.atan2(y, x) / rad, Math.atan2(z, Math.hypot(x, y)) / rad];
}
export function mixPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
    return { center: coordinateAt(a.center, b.center, t), zoom: a.zoom + (b.zoom - a.zoom) * t, pitch: a.pitch + (b.pitch - a.pitch) * t, bearing: a.bearing + angleDelta(a.bearing, b.bearing) * t };
}
export const smooth = (t: number) => t * t * (3 - 2 * t);
export function createRouteSampler(points: Coordinate[]): (t: number) => Coordinate {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++)
        cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
    const total = cumulative[cumulative.length - 1];
    return t => {
        if (!total)
            return [...points[points.length - 1]];
        const target = Math.max(0, Math.min(1, t)) * total;
        let low = 0, high = points.length - 1;
        while (low + 1 < high) {
            const mid = (low + high) >>> 1;
            if (cumulative[mid] <= target)
                low = mid;
            else
                high = mid;
        }
        const length = cumulative[high] - cumulative[low];
        return coordinateAt(points[low], points[high], length ? (target - cumulative[low]) / length : 1);
    };
}
export function routePoint(points: Coordinate[], t: number): Coordinate {
    return createRouteSampler(points)(t);
}
function bearing(a: Coordinate, b: Coordinate): number {
    const d = angleDelta(a[0], b[0]) * rad;
    return Math.atan2(Math.sin(d) * Math.cos(b[1] * rad), Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos(d)) / rad;
}
/** Compile once per command; elapsed time, rather than engine animation state, is authoritative. */
export function directCamera(command: CameraCommand, start: CameraPose, scenario: ScenarioDefinition): (t: number) => CameraPose {
    if (command.type === 'hold')
        return () => start;
    if (command.type === 'flyTo') {
        const end = { ...start, ...command, center: command.center };
        if (command.transition === 'zoomPanZoom') {
            // Pull back at the origin, pan at a distance-aware scale, then descend.
            const span = Math.max(1000, distance(start.center, command.center) * 4);
            const zoom = Math.max(0, Math.min(start.zoom - 1, end.zoom - 1, Math.log2(40075000 / span)));
            const departure = { ...start, zoom, pitch: 0 };
            const arrival = { ...departure, center: command.center, bearing: end.bearing };
            return t => t < .25
                ? mixPose(start, departure, smooth(t / .25))
                : t < .6
                    ? mixPose(departure, arrival, smooth((t - .25) / .35))
                    : mixPose(arrival, end, smooth((t - .6) / .4));
        }
        return t => {
            const p = command.easing === 'linear' ? t : smooth(t), pose = mixPose(start, end, p);
            if (command.transition === 'cinematic')
                pose.zoom -= Math.sin(Math.PI * p) * Math.min(3, Math.max(0, Math.min(start.zoom, end.zoom) - 1));
            return pose;
        };
    }
    if (command.type === 'orbit') {
        const entry = { center: command.center, zoom: command.zoom, pitch: command.pitch, bearing: start.bearing };
        return t => t < .2 ? mixPose(start, entry, smooth(t / .2)) : { ...entry, bearing: start.bearing + command.degrees * smooth((t - .2) / .8) };
    }
    const points = scenario.content.routes.find(r => r.id === command.route)!.coordinates;
    const sampleRoute = createRouteSampler(points);
    // Ease into the route, then use metre-based progress and a spatial look-ahead to soften corners.
    const entry = { center: points[0], zoom: command.zoom, pitch: command.pitch, bearing: start.bearing };
    const headings: number[] = [];
    for (let i = 0; i <= 512; i++) {
        const p = i / 512, raw = bearing(sampleRoute(Math.max(0, p - .025)), command.lookAt ?? sampleRoute(Math.min(1, p + .025)));
        headings.push(i === 0 ? start.bearing + angleDelta(start.bearing, raw) : headings[i - 1] + angleDelta(headings[i - 1], raw));
    }
    return t => {
        if (t < .15)
            return mixPose(start, entry, smooth(t / .15));
        const p = smooth((t - .15) / .85), center = sampleRoute(p);
        const index = Math.min(511, Math.floor(p * 512)), heading = headings[index] + (headings[index + 1] - headings[index]) * (p * 512 - index);
        return { center, zoom: command.zoom, pitch: command.pitch, bearing: start.bearing + (heading - start.bearing) * smooth(Math.min(1, (t - .15) / .15)) };
    };
}
