import { ColorPicker } from "./color-picker/picker.ts";

const preview = document.getElementById("preview")!;
const value = document.getElementById("preview-value")!;
const picker = new ColorPicker(document.getElementById("picker")!);

picker.model.subscribe((color) => {
  preview.style.backgroundColor = color.hex;
  value.textContent = color.hex;
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-color]")) {
  button.addEventListener("click", () => picker.setColor(button.dataset.color!));
}
