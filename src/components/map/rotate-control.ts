import type { IControl, Map as MapLibreMap } from "maplibre-gl";

// Rotate mode button, in the navigation group under zoom out. The needle turns
// with the map's bearing. The drag itself is handled by <RotateOverlay>.

const NEEDLE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="margin:auto;display:block;transition:transform .1s"><path d="M12 3l3.5 9h-7z" fill="#e85e00"/><path d="M12 21l-3.5-9h7z" fill="#64748b"/></svg>`;

export class RotateControl implements IControl {
  private container?: HTMLDivElement;
  private button?: HTMLButtonElement;
  private map?: MapLibreMap;

  constructor(
    private label: string,
    private onToggle: () => void,
  ) {}

  onAdd(map: MapLibreMap) {
    this.map = map;
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.title = this.label;
    this.button.setAttribute("aria-label", this.label);
    this.button.setAttribute("aria-pressed", "false");
    this.button.innerHTML = NEEDLE;
    this.button.addEventListener("click", this.onToggle);
    this.container.appendChild(this.button);
    map.on("rotate", this.syncNeedle);
    this.syncNeedle();
    return this.container;
  }

  onRemove() {
    this.map?.off("rotate", this.syncNeedle);
    this.container?.remove();
  }

  setActive(on: boolean) {
    if (!this.button) return;
    this.button.setAttribute("aria-pressed", String(on));
    this.button.style.background = on ? "#e85e0026" : "";
  }

  private syncNeedle = () => {
    const svg = this.button?.firstElementChild as SVGElement | null;
    if (svg && this.map)
      svg.style.transform = `rotate(${-this.map.getBearing()}deg)`;
  };
}
