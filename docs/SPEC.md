# Emery Interactive — rebuild spec

This describes how the rebuilt viewer behaves. The guiding rule: **the screen is always drawn from one state object.** Every control changes one field of that state and the scene is rebuilt from it, so the result never depends on the order of clicks.

## State

| Field | Values | Notes |
|---|---|---|
| `structure` | `fcc` \| `bcc` \| `sc` | One page; switch with the tabs or `?s=bcc`. |
| `showAtoms` | on/off | |
| `showSites` | one on/off per site type | FCC: octahedral, tetrahedral, triangular. BCC: octahedral, tetrahedral, triangular. SC: cubic, square-planar. |
| `style` | `hard` \| `sparse` | Applies to atoms **and** sites (sparse shrinks both by the same factor, so ratios stay correct). |
| `clipToCell` | on/off | On: only the parts of each sphere inside the cell are solid (halves on faces, eighths on corners), with a faint ghost of the full sphere. Replaces the old "Default View". |
| `opacity` | 0.1–1 | Atom transparency, so sites inside a hard-sphere model can be seen. |
| `polyhedra` | on/off | Draws the octahedron / tetrahedron / triangle / cube / square around each visible site. |
| `repeat` | x, y, z (1–3) | Replaces "Mirroring". Applies to everything. |
| `plane` | (h k l), offset, show on/off | One plane, used for display and by the slice. Selecting 3 objects sets it. |
| `slice` | on/off, `section` \| `cutaway`, flip | Section: only the cross-sections on the plane. Cutaway: the 3D model with one side removed, cut faces filled. Respects every visibility toggle. Arrow keys move the plane. |
| `neighbors` | on/off, target | Click any atom or site: its nearest neighbours light up with bonds, its count and r/R are shown, everything else fades. A typical atom is chosen when the tool is turned on. Sites get a "Grow sphere to fit" animation that shows r/R increasing until it touches. Replaces the Coordination view and its A/O/T radio buttons. |
| `selection` | up to 8 atoms/sites | Click to select, Shift+click to add. 2 → direction arrow and [u v w]; 3 → plane and (h k l); 4+ → polyhedron. |
| `marker`, `direction` | (q r s), [u v w] | Lattice position marker and direction arrow from the inputs. |
| `labels` | on/off | Coordinate labels on selected objects. |

The camera is **not** part of the state: changing settings never moves it. It has its own Reset button and "look along [100] / [110] / [111]" buttons.

Most of the state is mirrored in the URL, so an instructor can link to an exact setup.

## Structure data

Each crystal is described by data, not hand-placed coordinates: atom radius (in units of *a*), lattice centering, and one representative position per site type. All positions are generated with cubic symmetry. Neighbour counts, sites per cell and r/R are computed from geometry, so the numbers in the text panel are checked by the code that draws the model.

## Dropped from the old site

- Google Universal Analytics (shut down by Google in 2023) and the visitor IP lookup.
- The "Question #" start/stop recorder, which only sent events to that analytics service.
- Free rotation of the slice plane with the arrow keys; the plane is now set by (h k l) and moved along its normal.
- HCP (was unfinished and hidden).
