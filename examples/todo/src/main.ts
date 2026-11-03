import { materialize } from "@alexdrel/pralinejs";
import template, { taskItem } from "./todo.html.js";
import "./todo.css";

function addTask(event: SubmitEvent) {
  event.preventDefault();
  const title = refs.newTask.value.trim();
  if (!title) return;
  appendTask(title);
  refs.form.reset();
  refs.newTask.focus();
}

function appendTask(title: string) {
  const { fragment, refs: task } = materialize(taskItem, {
    title,
    toggle() {
      task.item.classList.toggle("completed", task.done.checked);
      updateSummary();
    },
    remove() {
      task.item.remove();
      updateSummary();
    },
  });
  refs.taskItem.before(fragment);
  updateSummary();
}

function updateSummary() {
  const checkboxes = refs.taskList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  const remaining = [...checkboxes].filter((checkbox) => !checkbox.checked).length;
  refs.remaining.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} remaining`;
  refs.empty.hidden = checkboxes.length > 0;
}

const { fragment, refs } = materialize(template, { addTask });
document.getElementById("app")!.appendChild(fragment);

appendTask("Read a chapter");
appendTask("Go for a short walk");
