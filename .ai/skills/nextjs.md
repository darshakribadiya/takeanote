# Next.js App Router — Component Organization

- **Page-specific components:** Place components used by only one page inside that page's `_components/` directory.
- **Shared components:** Place genuinely reusable components used across multiple features in the root-level `components/` directory.
- **Feature-specific components:** Keep components shared by related pages at the nearest appropriate feature level.
- **Utilities and services:** Use `lib/` for API clients, utility functions, services, and configuration. Never put React UI components in `lib/`.
- **Reuse:** Check existing components before creating new ones. Avoid unnecessary duplication.

### Example

```text
app/
├── page-1/
│   ├── _components/
│   │   └── Hello.jsx
│   └── page.jsx
components/
│   └── Button.jsx
lib/
└── utils.js
```

If `app/page-1/page.jsx` uses `<Hello />`, its implementation must be in `app/page-1/_components/Hello.jsx`.

**Rule:** Keep components page-local by default. Move them to shared locations only when actual reuse justifies it.