import { materialize } from "@alexdrel/pralinejs";
import { throttle, type Signal } from "@alexdrel/perky";
import template from "./color-map.html.js";
import "./color-map.css";
import type { ColorModel } from "./color.ts";
import { ringPoint, ringPosition, planePoint } from "./geometry.ts";

export function ColorMap(mount: HTMLElement, model: Signal<ColorModel>) {
  let hue = 0;
  const { fragment, refs } = materialize(template, { pick });
  mount.appendChild(fragment);
  const unsubscribe = model.subscribe(throttle(render));
  return {
    model,
    refs,
    dispose() {
      unsubscribe();
      mount.replaceChildren();
    },
  };

  function pick(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const ring = target.dataset.pick === "hue";
    const point = ringPoint(x, y);
    if (event.type === "pointerdown") {
      if (event.button !== 0 || !event.isPrimary) return;
      if (ring && (point.radius < 0.38 || point.radius > 0.5)) return;
      target.setPointerCapture(event.pointerId);
    } else if (!target.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const color = model.value;
    const [, saturation, value] = color.hsv;
    if (ring) {
      hue = point.hue;
      model.value = color.withHsv(hue, saturation, value);
    } else {
      const { saturation, value } = planePoint(x, y);
      model.value = color.withHsv(hue, saturation, value);
    }
  }

  function render() {
    const [selectedHue, saturation, value] = model.value.hsv;
    if (saturation > 0.0001 && value > 0.0001) hue = selectedHue;
    const position = ringPosition(hue);
    refs.hueMarker.style.left = `${position.x}%`;
    refs.hueMarker.style.top = `${position.y}%`;
    refs.plane.style.backgroundColor = `hsl(${hue} 100% 50%)`;
    refs.planeMarker.style.left = `${saturation}%`;
    refs.planeMarker.style.top = `${100 - value}%`;
  }
}
