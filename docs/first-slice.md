# First Development Slice

## Scope

This slice implements the first executable foundation for Phase 1:

- Next.js app shell
- Operations workspace page
- Layer template domain model
- Sample 618 and 双11 templates
- Canvas renderer
- Text AutoShrink
- Text overflow and size checks
- Mock layer-template and tag APIs
- Initial schema draft

## Not Yet Included

- RDS-backed persistence
- OSS signed upload
- Real image upload into product slots
- Two-click coordinate admin editor
- External image generation APIs

## Development Notes

The renderer intentionally uses full-layer rerendering for text changes. This follows the technical validation result: template-driven editing should rebuild the layer stack instead of clearing text on complex backgrounds.

Multi-size export is represented by `exportSizes` and always uses `mode: "rerender"`.
