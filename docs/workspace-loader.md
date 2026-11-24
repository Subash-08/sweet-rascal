# Sweet Rascal loader animation

Open `lib/workspace-loader-config.ts` and set `heartAnimationMode` to one of these values.

| Value | What you’ll see |
| --- | --- |
| `sequential` | The left heart draws first, then the right heart. This is the default. |
| `simultaneous` | Both hearts start and finish drawing together. |

Save the file and refresh the local app. To change the version used on the live site, deploy the updated code.

Both animations are defined in `app/workspace-loader.css`. They share the overlapping outlines, italic wordmark and reveal behavior in `components/workspace-loader.tsx`. Each animation loops while the workspace loads, then finishes both outlines before fading out. Reduced-motion mode displays both outlines immediately.
