# Todo, with plain DOM

A small PralineJS example: add a task, check it off, or delete it. Everything on screen is native DOM. The application changes that DOM directly; Praline provides markup construction, template parameters, and typed references.

## Markup and references

The form in [todo.html](src/todo.html) declares its reference and submit handler:

```html
<form ref="{{form}}" onSubmit="{{addTask}}">
  <label class="visually-hidden" for="new-task">New task</label>
  <input id="new-task" ref="{{newTask}}" placeholder="What’s next?" autocomplete="off" required maxlength="200" />
  <button type="submit" class="add">Add task <span aria-hidden="true">+</span></button>
</form>
```

`ref` names an element the code will use. `onSubmit` asks for a handler when the markup is materialized. `refs.newTask` is inferred as `HTMLInputElement`.

In [main.ts](src/main.ts), the imported blueprint creates the page once:

```ts
import { materialize } from "@alexdrel/pralinejs";
import template, { taskItem } from "./todo.html.js";
import "./todo.css";

const { fragment, refs } = materialize(template, { addTask });
document.getElementById("app")!.appendChild(fragment);

appendTask("Read a chapter");
appendTask("Go for a short walk");
```

The Vite plugin compiles `todo.html` for the `./todo.html.js` import. Its generated declaration gives `materialize` the parameter and reference types. The result contains a native `DocumentFragment` and references to its elements.

The submit handler uses those references directly:

```ts
function addTask(event: SubmitEvent) {
  event.preventDefault();
  const title = refs.newTask.value.trim();
  if (!title) return;
  appendTask(title);
  refs.form.reset();
  refs.newTask.focus();
}
```

## Reusable rows

A native template describes one task:

```html
<template ref="{{taskItem}}">
  <li ref="{{item}}">
    <label>
      <input type="checkbox" ref="{{done}}" onChange="{{toggle}}" />
      <span>{{title}}</span>
    </label>
    <button type="button" class="remove" aria-label="Delete {{title}}" onClick="{{remove}}">×</button>
  </li>
</template>
```

It is exported as the reusable `taskItem` blueprint. Each materialization supplies a title and handlers, and returns that row's own references:

```ts
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
```

The new row goes at the template's position using `refs.taskItem.before(fragment)`. Existing rows keep their DOM identity and state.

## Updating the summary

The summary reads the live checkboxes and updates two elements:

```ts
function updateSummary() {
  const checkboxes = refs.taskList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  const remaining = [...checkboxes].filter((checkbox) => !checkbox.checked).length;
  refs.remaining.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} remaining`;
  refs.empty.hidden = checkboxes.length > 0;
}
```

This small example gets away with keeping task state in the DOM: the checkbox holds its checked state, and removing a row removes the task. That keeps the markup and event handling easy to see, but it isn't a recommendation for application state. Persistence, undo, or multiple views of the same data would call for a separate model.

The [color-picker example](../color-picker/README.md) demonstrates explicit state and reactive updates: an immutable model shared through a signal drives native DOM updates in a class component, a functional child component, and the host page.

The common point is **native DOM, without virtual DOM or diffing**. `materialize` creates elements; application code decides how to update them. Here, `textContent` and `hidden` are native DOM properties, and [todo.css](src/todo.css) is ordinary CSS. Two initial tasks return on reload.

## Run locally

After the [repository setup](../README.md), run from this directory:

```sh
npm run serve
```

Vite generates TypeScript declarations while serving or building. Use `npm run check` to type-check and `npm run build` to bundle the example.
