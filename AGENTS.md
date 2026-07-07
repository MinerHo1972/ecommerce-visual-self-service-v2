# AGENTS.md

## Development Principles

Apply these rules to the entire repository.

### Prefer the Smallest Useful Change

Before adding code, dependencies, database tables, background jobs, or new abstractions, first check whether the goal can be met by reusing existing routes, services, state fields, config flags, or native platform features.

Use this decision ladder:

1. If the feature does not need to exist, do not add it.
2. If existing code already solves it, reuse that path.
3. If the platform or framework provides it, use the native feature.
4. If an installed dependency already handles it, use that dependency.
5. If a small inline change is enough, prefer that over a new abstraction.
6. Only then add the minimum new code that works.

### Keep Product UX Low-Anxiety

Do not present internal pipeline failures as user-facing product failures. For AI review, generation, or automation states, prefer actionable and low-pressure labels such as "建议优化" or "暂不可用" over hard failure wording, unless the user's asset is actually unusable.

### Preserve Safety Boundaries

Never remove user data, generated assets, or database records without explicit confirmation and a backup plan. Avoid destructive migrations unless they are required and reversible.

### Validate Focused Changes

For code changes, run the narrowest useful validation first, such as `npm run typecheck`, before broader build or deployment steps.
