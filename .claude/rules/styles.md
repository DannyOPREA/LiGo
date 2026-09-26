---
paths:
  - "**/*.scss"
  - "**/*.css"
---
# Style rules
- Use lila's SCSS variables, mixins and theme CSS variables (`lila/ui/lib/css/abstract/`); never
  hard-code colours, so all themes (light, dark, transparent) keep working.
- Mobile first: layouts work at phone width first; touch targets are at least 44 px.
- Follow the stylelint config in `lila/`; the format hook runs it.
