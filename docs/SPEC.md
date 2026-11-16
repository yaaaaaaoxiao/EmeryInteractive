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

## Dislocations page

`dislocations.html` is a second page with its own state, drawn the same way: one state object, and the scene rebuilt from it.

| Field | Values | Notes |
|---|---|---|
| `structure` | `sc` \| `fcc` \| `bcc` | `?s=fcc`. Each uses its usual slip system: SC (0 0 1) with a[1 0 0]; FCC (1 1 1) with a/2[1̄ 1 0]; BCC (1 1 0) with a/2[1̄ 1 1]. |
| `kind` | `edge` \| `screw` \| `mixed` | `?type=screw`. Mixed is 45° in SC, 60° in FCC and 71° in BCC. |
| `position` | where the line is along the glide direction | The slider, Play, and ← / →. Starts in the middle of the block; changing structure or kind puts it back there. |
| `style` | `sticks` \| `hard` | Ball and stick (with bonds), or touching spheres. |
| `coloring` | `plain` \| `planes` \| `strain` | Plain: the half above the slip plane in blue, the half below in grey. Planes: the lattice planes the Burgers vector steps between. Strain: squeezed blue, stretched red; a pure screw changes no volume, so it is coloured by its shear instead (orange, fading with distance from the line). |
| `show` | line, Burgers vector, slip plane, extra half-plane, spiral ramp, Burgers circuit | The half-plane needs an edge part and the ramp a screw part. While the ramp is shown, atoms away from the line are faded so it can be seen. |
| `circuitSteps` | number of steps taken, or all | "Walk the circuit" and "One step". Not in the link: a link shows the finished circuit. |

The block of crystal is cut so that the slip plane is horizontal and the line runs front to back, whatever the structure, so every control and camera button means the same thing in each case.

Atom positions are the perfect crystal plus the displacement field of a straight dislocation in an isotropic elastic solid (Poisson's ratio 1/3). That is a good picture away from the line and only a sketch within about one atom spacing of it. These are perfect dislocations: the splitting into partials in FCC and the three-fold screw core in BCC are not modelled, and the page says so.

How thick the extra half-plane is, how many spiral ramps there are, the bonds across the slip plane and the steps of the Burgers circuit are all computed from the lattice, and checked in `tests/dislocation.test.ts` for all nine combinations.

## Dropped from the old site

- Google Universal Analytics (shut down by Google in 2023) and the visitor IP lookup.
- The "Question #" start/stop recorder, which only sent events to that analytics service.
- Free rotation of the slice plane with the arrow keys; the plane is now set by (h k l) and moved along its normal.
- HCP (was unfinished and hidden).
