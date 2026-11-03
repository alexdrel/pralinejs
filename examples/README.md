# PralineJS examples

- [Todo](todo/README.md) — HTML blueprints, typed native element references, event parameters, and reusable row templates. A small introduction using direct DOM updates.
- [Color picker](color-picker/README.md) — a widget embedded in an ordinary page, an immutable model shared through a signal, and composition of class and functional components.

Both examples use native DOM, with no virtual DOM or diffing. Each README explains the code and includes instructions for running it.

The examples are npm workspaces. Run `npm ci` and `npm run build` at the repository root to install their dependencies, link the current Praline package, and build it. One root lockfile and shared development tools cover both examples. Their commands remain separate; for example, `npm run build --workspace examples/todo` builds only Todo.
