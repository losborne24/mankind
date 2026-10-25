import { Explorer } from "@/components/Explorer";

/**
 * The exploration experience is entirely client-driven (WebGL globe + Three.js),
 * so this server component simply mounts the client shell. All browser-only
 * initialization happens below the `Explorer` boundary.
 */
export default function Home() {
  return <Explorer />;
}
