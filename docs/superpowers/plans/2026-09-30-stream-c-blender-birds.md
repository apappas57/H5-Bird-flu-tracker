# Stream C: Blender Birds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build four parametric ink-line seabirds in headless Blender and publish, for each, a rigged GLB with a 24 frame `flap` animation plus still, WebM and APNG fallbacks, indexed by a manifest that the three.js runtime (stream D) consumes.

**Architecture:** Geometry is generated from numbers, never modelled by hand. `blender/species.json` holds per species proportions; `blender/birdlib.py` holds the shape grammar (a single ring loft used for body, wings and tail) plus the render configuration; `blender/build_birds.py` composes those into one mesh and one armature per species; `blender/render.py` renders with Workbench plus Freestyle line art; `blender/export.py` writes the GLBs, runs the ffmpeg encodes and writes the manifest. No `.blend` file is ever written or committed: the source of truth is the scripts plus the JSON, so a review note is a parameter change rather than a remodel. Two review gates (silhouette, then motion) are hard stops in the task list.

**Tech Stack:** Blender 4.5.13 LTS (`/usr/local/bin/blender`, bundled Python 3.11, `bpy` + `bmesh` + `mathutils`), `unittest` run inside Blender, ffmpeg 8.1 (`libvpx-vp9`, `apng`), ImageMagick 7 (`/usr/local/bin/magick`), POSIX shell.

**Spec:** `docs/superpowers/specs/2026-09-30-map-first-rebuild-design.md` (sections 6.1 to 6.3, and 6.5 subgoals 1 to 4; section 8 row C for the allowlist)

## Global Constraints

- **Allowlist.** This stream may create or edit only `blender/**` and `site/assets/birds/**`. If any other file appears to need a change, STOP and ask. Do not touch `pipeline/**`, `site/app.js`, `site/styles.css`, `package.json`, `.gitignore` or anything in the home directory.
- **No git.** The executor runs no `git` command at all: no add, commit, push, branch, stash or rebase. Commit steps in this plan are written for the parent agent, which runs them after reviewing `git diff --stat`.
- **Blender invocation.** Always `/usr/local/bin/blender -b --factory-startup --python <script> -- <args>`. `--factory-startup` keeps user preferences and add-ons out of the result. Arguments after `--` are the script's own; read them with `birdlib.script_args()`.
- **Render engine.** Workbench (`BLENDER_WORKBENCH`) with Freestyle only. Never Cycles. Do not switch to EEVEE. The machine is an Intel Core i5 with Intel Iris Plus graphics and no discrete GPU.
- **Disk.** About 6.6 GB free. Every intermediate (PNG sequences, contact sheets, test GLBs) goes under `BIRDS_SCRATCH` and is deleted after use. Only final assets land in `site/assets/birds/`.
- **Scratch root.** `BIRDS_SCRATCH` when set, otherwise `/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/blender`. `blender/build.sh` exports a stable `BIRDS_SCRATCH` so the session specific default is only a last resort.
- **No new Python packages.** Blender's bundled Python only. No pip, no numpy, no Pillow.
- **Colour.** No colour on any bird, ever. Only paper white `(1, 1, 1)` and ink `#101010` = `(0.063, 0.063, 0.063)`. Carmine never touches a bird. A test asserts every material is greyscale (R equals G equals B).
- **Budgets.** Triangles: 3,000 hard ceiling per species, 1,400 working target. GLB 60 KB or less. WebM 150 KB or less. APNG 300 KB or less. PNG still 40 KB or less. **All bird assets together under 1 MB**, which is the binding constraint (see the note in Task 8) and is tested.
- **Copy.** No em dashes anywhere, in code comments, in `STYLE.md`, or in commit messages. Use commas, colons or sentence breaks.
- **Licence.** Every asset is original work released under the repository's MIT licence. The manifest records `"licence": "MIT (original work)"`. No copyrighted reference image is committed; references are descriptions in words.
- **Geometry convention.** One model unit is the greater crested tern's body length (46 cm). Origin at the body centre. Blender `+X` forward (the bill), `+Y` the bird's left, `+Z` up. The GLB is exported with `export_yup` at its default, so in glTF space `+X` is forward, `+Y` is up and `-Z` is the bird's left.

## Verified environment facts

These were confirmed by running Blender headless on 30 September 2026. Do not re-derive them.

| Fact | Value |
| --- | --- |
| Blender | 4.5.13 LTS, `/usr/local/bin/blender` |
| Freestyle line width | `scene.render.line_thickness_mode = 'ABSOLUTE'`, `scene.render.line_thickness` in pixels |
| Freestyle line colour | `scene.view_layers[0].freestyle_settings.linesets[0].linestyle.color`, a 3 component `Color` |
| Workbench flat ink look | `display.shading.light = 'FLAT'`, `color_type = 'MATERIAL'` (so a second ink material renders dark), `render_aa = '8'` |
| Material viewport colour | `material.diffuse_color`, a 4 component RGBA |
| Render cost | 15 s for one 640x480 transparent Freestyle frame |
| bmesh gotcha | `bm.edges[i]` raises `IndexError` until `bm.edges.ensure_lookup_table()` is called. Same for `bm.verts`. |
| Action gotcha | Blender 4.5 uses slotted actions. Do **not** build an action by hand. Call `pose_bone.keyframe_insert(...)`, which creates the action and its slot, then rename `armature.animation_data.action.name` to `"flap"`. Verified to produce `animations: ["flap"]` in the GLB. |
| glTF export | `bpy.ops.export_scene.gltf(export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_apply=True, use_selection=True)`. `export_apply` deliberately skips armature modifiers, so the skin survives. Verified: a 2 bone rig plus cube exported to 5,016 bytes with one skin and one animation named `flap`. |
| ffmpeg | 8.1, `/usr/local/bin/ffmpeg`, has `libvpx-vp9` (alpha via `-pix_fmt yuva420p`) and the `apng` muxer |
| ImageMagick | present at `/usr/local/bin/magick`, so it is the primary contact sheet compositor; the Blender image API is the coded fallback |

## File structure

| File | Responsibility |
| --- | --- |
| `blender/STYLE.md` | The acceptance standard. Restates spec 6.3, gives the per species reference description in words, the parameter glossary, the conventions and the budgets. Reviewers judge renders against this file. |
| `blender/species.json` | Per species proportions plus the `generic` alias. The only file a review note should need to change. |
| `blender/birdlib.py` | Shape grammar and shared plumbing: scratch paths, species loading, the ring loft, ring builders, mesh assembly with materials and vertex groups, triangle and manifold checks, GLB inspection, Workbench plus Freestyle configuration, orthographic camera fitting. Imported by every other script. |
| `blender/build_birds.py` | Composes a species: body, head, bill, wings, tail, ink overlays, then the armature and the `flap` action. CLI for a smoke build. |
| `blender/render.py` | Contact sheets (side, top, front at 800 px), the hero still, and the 24 frame flap PNG sequence. |
| `blender/export.py` | GLB per species, ffmpeg WebM and APNG encodes, and `site/assets/birds/manifest.json`. |
| `blender/tests/run_tests.py` | The whole `unittest` suite, run inside Blender. One `TestCase` class per concern so later tasks append a class and change nothing else. |
| `blender/build.sh` | Runs build, render, export, tests in order, honouring `BIRDS_SCRATCH`, and cleans intermediates. |
| `site/assets/birds/<slug>.glb` etc. | Generated. Four species, four files each, plus `manifest.json`. |

---

### Task 1: Style spec, species parameters and the test harness

**Files:**
- Create: `blender/STYLE.md`
- Create: `blender/species.json`
- Create: `blender/tests/run_tests.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `blender/species.json`, a JSON object whose keys are species slugs. Four real species (`greater-crested-tern`, `brown-skua`, `southern-giant-petrel`, `silver-gull`) each hold the full parameter set below; the fifth key `generic` holds only `{"alias": "<slug>"}`. `blender/tests/run_tests.py` exposes a module level `REQUIRE_MANIFEST` boolean and a `main()` that exits 0 on success and 1 on failure.

Parameter set, all lengths in model units (one unit is 46 cm), all angles in degrees:

| Key | Meaning |
| --- | --- |
| `common_name`, `scientific_name` | Strings for `STYLE.md` and the manifest. |
| `body_length`, `body_width`, `body_depth` | Body bounding proportions. `body_length` sets the overall scale. |
| `head_length`, `head_width`, `head_depth` | Head ellipsoid. |
| `bill_length`, `bill_depth` | Bill cone. |
| `bill_droop` | Degrees the bill tips down from horizontal. |
| `bill_tube` | Boolean. A second small cylinder along the bill's top, for the petrel's tube nose. |
| `wing_span` | Full tip to tip span. |
| `wing_chord` | Chord at the wing root. |
| `wing_taper` | Tip chord divided by root chord. |
| `wing_sweep` | Degrees the leading edge sweeps back. |
| `wing_dihedral` | Degrees the wing rises from root to tip. |
| `wing_notch` | Fractional chord reduction at the wrist station, the trailing edge break. |
| `wing_thickness` | Blade thickness in Z. |
| `tail_length`, `tail_width` | Tail blade length and width at the root. |
| `tail_fork` | Degrees of splay between the two tail halves. Zero is a square tail. |
| `cap` | Boolean. An ink filled shape over the crown and nape. |
| `wing_flash` | Boolean. Ink filled outer wing panels with a white band left between them. |

- [ ] **Step 1: Write the failing test harness and the species.json cases**

Create `blender/tests/run_tests.py`:

```python
"""The Blender bird pipeline test suite.

Run it inside Blender so bpy, bmesh and mathutils are importable:

    /usr/local/bin/blender -b --factory-startup \
      --python blender/tests/run_tests.py -- [--require-manifest]

--require-manifest turns the published asset checks from skips into
failures. blender/build.sh passes it, because by then the assets exist.
"""

import argparse
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

BLENDER_DIR = pathlib.Path(__file__).resolve().parent.parent
SPECIES_PATH = BLENDER_DIR / "species.json"

REQUIRE_MANIFEST = False

REQUIRED_PARAMS = (
    "common_name", "scientific_name",
    "body_length", "body_width", "body_depth",
    "head_length", "head_width", "head_depth",
    "bill_length", "bill_depth", "bill_droop", "bill_tube",
    "wing_span", "wing_chord", "wing_taper", "wing_sweep",
    "wing_dihedral", "wing_notch", "wing_thickness",
    "tail_length", "tail_width", "tail_fork",
    "cap", "wing_flash",
)

EXPECTED_SLUGS = (
    "greater-crested-tern",
    "brown-skua",
    "southern-giant-petrel",
    "silver-gull",
)


class TestSpeciesJson(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.species = json.loads(SPECIES_PATH.read_text(encoding="utf-8"))

    def test_all_four_species_present(self):
        for slug in EXPECTED_SLUGS:
            self.assertIn(slug, self.species, "missing species %s" % slug)

    def test_generic_aliases_a_real_species(self):
        self.assertIn("generic", self.species)
        alias = self.species["generic"].get("alias")
        self.assertIn(alias, EXPECTED_SLUGS,
                      "generic must alias one of the four species")
        self.assertEqual(
            set(self.species["generic"].keys()), {"alias"},
            "the generic entry carries an alias and nothing else")

    def test_every_species_has_every_parameter(self):
        for slug in EXPECTED_SLUGS:
            params = self.species[slug]
            for key in REQUIRED_PARAMS:
                self.assertIn(key, params, "%s is missing %s" % (slug, key))
            extra = set(params) - set(REQUIRED_PARAMS)
            self.assertEqual(extra, set(), "%s has unknown keys %s" % (slug, extra))

    def test_numeric_parameters_are_positive_numbers(self):
        never_negative = [k for k in REQUIRED_PARAMS
                          if k not in ("common_name", "scientific_name",
                                       "bill_tube", "cap", "wing_flash",
                                       "tail_fork", "wing_notch")]
        for slug in EXPECTED_SLUGS:
            params = self.species[slug]
            for key in never_negative:
                value = params[key]
                self.assertIsInstance(value, (int, float), "%s.%s" % (slug, key))
                self.assertGreater(value, 0.0, "%s.%s must be positive" % (slug, key))
            for key in ("tail_fork", "wing_notch"):
                self.assertGreaterEqual(params[key], 0.0, "%s.%s" % (slug, key))
            for key in ("bill_tube", "cap", "wing_flash"):
                self.assertIsInstance(params[key], bool, "%s.%s" % (slug, key))

    def test_wing_taper_is_a_ratio(self):
        for slug in EXPECTED_SLUGS:
            taper = self.species[slug]["wing_taper"]
            self.assertGreater(taper, 0.0)
            self.assertLessEqual(taper, 1.0, "%s taper is tip over root chord" % slug)

    def test_the_tern_is_the_slenderest_and_the_petrel_the_largest(self):
        lengths = {s: self.species[s]["body_length"] for s in EXPECTED_SLUGS}
        self.assertEqual(max(lengths, key=lengths.get), "southern-giant-petrel")
        ratios = {s: self.species[s]["body_width"] / self.species[s]["body_length"]
                  for s in EXPECTED_SLUGS}
        self.assertEqual(min(ratios, key=ratios.get), "greater-crested-tern")


def main():
    global REQUIRE_MANIFEST
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-manifest", action="store_true")
    args = parser.parse_args(argv)
    REQUIRE_MANIFEST = args.require_manifest
    suite = unittest.TestLoader().loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the suite to verify it fails**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: non-zero exit, with a `FileNotFoundError` for `blender/species.json` raised out of `setUpClass`, reported as an error on every `TestSpeciesJson` case.

- [ ] **Step 3: Write species.json**

Create `blender/species.json`:

```json
{
  "greater-crested-tern": {
    "common_name": "Greater crested tern",
    "scientific_name": "Thalasseus bergii",
    "body_length": 1.0,
    "body_width": 0.2,
    "body_depth": 0.24,
    "head_length": 0.24,
    "head_width": 0.15,
    "head_depth": 0.17,
    "bill_length": 0.17,
    "bill_depth": 0.04,
    "bill_droop": 4.0,
    "bill_tube": false,
    "wing_span": 2.28,
    "wing_chord": 0.23,
    "wing_taper": 0.3,
    "wing_sweep": 26.0,
    "wing_dihedral": 5.0,
    "wing_notch": 0.16,
    "wing_thickness": 0.024,
    "tail_length": 0.38,
    "tail_width": 0.075,
    "tail_fork": 30.0,
    "cap": true,
    "wing_flash": false
  },
  "brown-skua": {
    "common_name": "Brown skua",
    "scientific_name": "Stercorarius antarcticus",
    "body_length": 1.13,
    "body_width": 0.36,
    "body_depth": 0.4,
    "head_length": 0.28,
    "head_width": 0.2,
    "head_depth": 0.22,
    "bill_length": 0.17,
    "bill_depth": 0.075,
    "bill_droop": 12.0,
    "bill_tube": false,
    "wing_span": 2.74,
    "wing_chord": 0.47,
    "wing_taper": 0.52,
    "wing_sweep": 14.0,
    "wing_dihedral": 3.0,
    "wing_notch": 0.1,
    "wing_thickness": 0.04,
    "tail_length": 0.3,
    "tail_width": 0.16,
    "tail_fork": 4.0,
    "cap": false,
    "wing_flash": true
  },
  "southern-giant-petrel": {
    "common_name": "Southern giant petrel",
    "scientific_name": "Macronectes giganteus",
    "body_length": 1.89,
    "body_width": 0.49,
    "body_depth": 0.56,
    "head_length": 0.44,
    "head_width": 0.28,
    "head_depth": 0.32,
    "bill_length": 0.44,
    "bill_depth": 0.14,
    "bill_droop": 8.0,
    "bill_tube": true,
    "wing_span": 4.02,
    "wing_chord": 0.34,
    "wing_taper": 0.62,
    "wing_sweep": 6.0,
    "wing_dihedral": 1.0,
    "wing_notch": 0.06,
    "wing_thickness": 0.038,
    "tail_length": 0.42,
    "tail_width": 0.22,
    "tail_fork": 2.0,
    "cap": false,
    "wing_flash": false
  },
  "silver-gull": {
    "common_name": "Silver gull",
    "scientific_name": "Chroicocephalus novaehollandiae",
    "body_length": 0.87,
    "body_width": 0.23,
    "body_depth": 0.27,
    "head_length": 0.22,
    "head_width": 0.15,
    "head_depth": 0.17,
    "bill_length": 0.15,
    "bill_depth": 0.045,
    "bill_droop": 6.0,
    "bill_tube": false,
    "wing_span": 2.04,
    "wing_chord": 0.3,
    "wing_taper": 0.46,
    "wing_sweep": 18.0,
    "wing_dihedral": 6.0,
    "wing_notch": 0.12,
    "wing_thickness": 0.026,
    "tail_length": 0.28,
    "tail_width": 0.15,
    "tail_fork": 0.0,
    "cap": false,
    "wing_flash": false
  },
  "generic": {
    "alias": "greater-crested-tern"
  }
}
```

- [ ] **Step 4: Write STYLE.md**

Create `blender/STYLE.md`:

```markdown
# Bird style spec

The acceptance standard for every bird render in this repository. A render
is accepted when it satisfies every line below. Reviewers judge against
this file, not against taste.

Source of truth: `blender/species.json` plus the scripts beside it. No
`.blend` file is written or committed. A review note becomes a parameter
change in `species.json`, not a remodel.

## The look

- Ground is paper white. Lines are ink `#101010` at about 1.2 px at 1x.
- Surfaces are flat white. No gradients, no shadows, no texture, no
  ambient occlusion, no cavity, no specular highlight.
- No colour on any bird, ever. Only paper white and ink. Carmine is
  reserved for the live outbreak on the map and never touches a bird.
- Ink fills are allowed and are how a black cap and dark primaries read.
  They use the ink material, never a shade of grey.
- Renders are transparent (`film_transparent`), RGBA, so the page's own
  paper shows through.

## Technique

Overlapping closed shells, never boolean unions. The body, head, bill,
wings, tail and ink overlays are separate closed shells joined into one
mesh object. Freestyle culls the occluded part of each shell's silhouette,
so overlapping shells read as one merged outline with no seam and no
interior line. Booleans are slow, fragile and unnecessary here.

Every shell is built by one helper, `birdlib.loft`, from a list of equal
length vertex rings. The body and head use elliptical rings closed with a
pole. The wings, the tail and the ink panels use four point blade rings
closed with a flat quad. This is why the whole bird is a handful of numbers.

## Budgets

| Thing | Ceiling | Working target |
| --- | --- | --- |
| Triangles per species | 3,000 | 1,400 |
| GLB | 60 KB | 50 KB |
| WebM loop | 150 KB | 80 KB |
| APNG loop | 300 KB | 150 KB |
| PNG still | 40 KB | 25 KB |
| All bird assets together | 1 MB | 1 MB |

The aggregate 1 MB is the binding constraint. The levers, in order, are
the flap loop resolution and the VP9 `-crf`.

Meshes are one object with one armature. Capped species and flashed
species carry two materials, `bird_white` and `bird_ink`. Everything else
carries one. Spec 6.3 says one material, but 6.3 also requires a black cap
read as a filled ink shape, which one material cannot deliver, so the ink
material is the deliberate exception and the greyscale test is the guard.

## Motion

One armature, seven bones: `root` in the body, and `shoulder`, `elbow`,
`hand` per wing. The body never moves, so only the wings flap.

One animation, `flap`: 24 frames at 24 fps, keyed on every frame from an
analytic sine of period 24, so frame 25 equals frame 1 and the loop is
seamless by construction. The elbow and the hand lag the shoulder, which
is what stops a flap reading as a flapping plank.

`glide` is the rest pose, not an animation. The wings are built spread
with dihedral, so a GLB loaded with nothing playing is already gliding.

## Geometry convention

One model unit is the greater crested tern's body length, 46 cm. Origin at
the body centre. Blender `+X` forward (the bill), `+Y` the bird's left,
`+Z` up. Exported with `export_yup` at its default, so in glTF space `+X`
is forward, `+Y` is up and `-Z` is the bird's left.

## Parameter glossary

All lengths in model units, all angles in degrees.

- `body_length`, `body_width`, `body_depth`: the body's bounding
  proportions. `body_length` sets the species' overall scale.
- `head_length`, `head_width`, `head_depth`: the head ellipsoid.
- `bill_length`, `bill_depth`: the bill cone. `bill_droop` tips it down.
  `bill_tube` adds the petrel's nostril tube along the bill's top.
- `wing_span`: full tip to tip. `wing_chord`: chord at the root.
  `wing_taper`: tip chord over root chord, so a smaller number is a more
  pointed wing. `wing_sweep`: degrees the leading edge sweeps back.
  `wing_dihedral`: degrees the wing rises. `wing_notch`: fractional chord
  reduction at the wrist, the trailing edge break. `wing_thickness`:
  blade thickness in Z.
- `tail_length`, `tail_width`: the tail blade. `tail_fork`: degrees of
  splay between the two halves, so zero is a square tail.
- `cap`: an ink shape over the crown and nape. `wing_flash`: ink outer
  wing panels with a white band left between them.

## Reference descriptions

No copyrighted reference image is committed. These descriptions are the
reference. A birder should recognise each species from its silhouette
alone, at drawer size, with no colour.

### Greater crested tern, *Thalasseus bergii*

The outbreak's dominant species and the local transmission species, so it
is also the generic seabird and the bird that flies across the map.

Slender and long. Body about 46 cm, wingspan about 105 cm, so the span is
roughly 2.3 body lengths. The wings are the narrowest of the four: long,
pointed, swept well back, chord about a tenth of the span. The tail is
long and deeply forked, the outer feathers drawn out into fine streamers.
The bill is long, slender and slightly drooped, held level in flight. A
shaggy black cap runs from above the eye back over the nape and lifts into
a short crest at the rear of the crown, and it reads as a filled ink shape
with a clean lower border. Accept when the fork and the cap are legible at
120 px wide.

### Brown skua, *Stercorarius antarcticus*

The first detection of the outbreak.

Heavy and broad. Body about 52 cm, wingspan about 126 cm. The bulk is the
point: the body is nearly twice as wide, proportionally, as the tern's,
and the wings are broad and blunt with a high taper ratio and little
sweep, so they read as paddles rather than blades. The tail is short and
wedge shaped, barely forked. The bill is short, deep and hooked. The
diagnostic marking is the white flash at the base of the primaries, which
here is drawn by inking the outer wing panel and leaving a white band
across its base, so the flash reads as white against ink rather than
white against white. Accept when the bird looks heavy beside the tern at
the same scale and the wing band is unmistakable.

### Southern giant petrel, *Macronectes giganteus*

The largest of the four by a wide margin. Body about 87 cm, wingspan about
185 cm. Long, straight, narrow wings held almost without sweep or
dihedral, close to constant chord out to a blunt tip: an albatross like
glider, not a flapper. The body is thick and the head is large. The
diagnostic feature is the bill, which is enormous, as long as the head,
pale and tipped with a heavy hook, and carries a raised nostril tube along
its top ridge. The tail is short and square. Accept when the bill reads as
a tube nose in the side view and the wings look like a glider's.

### Silver gull, *Chroicocephalus novaehollandiae*

The bird every Australian already knows, so its silhouette has the least
room for error.

Compact and neat. Body about 40 cm, wingspan about 94 cm, the smallest of
the four. The wings are rounded rather than pointed, moderately swept,
with a higher taper ratio than the tern's and a pronounced dihedral. The
tail is short and square, not forked at all. The bill is short, straight
and slender. The head is plain white with no cap at all, which is what
separates it from the tern in a colourless silhouette. Accept when it
reads as smaller and rounder than the tern and carries no cap.
```

- [ ] **Step 5: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, six tests passing, exit 0.

- [ ] **Step 6: Confirm no em dashes**

```bash
grep -n $'\xe2\x80\x94' /Users/Alex/dev/h5-bird-flu-tracker/blender/STYLE.md \
  /Users/Alex/dev/h5-bird-flu-tracker/blender/species.json \
  /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py \
  && echo "EM DASH FOUND, fix it" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 7: Commit (parent agent only)**

```bash
git add blender/STYLE.md blender/species.json blender/tests/run_tests.py
git commit -m "feat(birds): style spec, species parameters and test harness"
```

---

### Task 2: birdlib.py, the shape grammar and shared plumbing

**Files:**
- Create: `blender/birdlib.py`
- Modify: `blender/tests/run_tests.py` (append two `TestCase` classes)

**Interfaces:**
- Consumes: `blender/species.json` from Task 1.
- Produces, all importable as `birdlib.*`:
  - `INK = (0.063, 0.063, 0.063)`, `PAPER = (1.0, 1.0, 1.0)`
  - `MAT_PAPER = 0`, `MAT_INK = 1`
  - `TRI_CEILING = 3000`, `TRI_TARGET = 1400`
  - `GLB_MAX = 61440`, `STILL_MAX = 40960`, `WEBM_MAX = 153600`, `APNG_MAX = 307200`, `TOTAL_MAX = 1048576`
  - `FPS = 24`, `FLAP_FRAMES = 24`
  - `REPO_ROOT`, `BLENDER_DIR`, `ASSET_DIR`, `SPECIES_PATH` as `pathlib.Path`
  - `script_args() -> list[str]`
  - `scratch_dir(sub: str | None = None) -> pathlib.Path` (creates it)
  - `load_species() -> dict`, `real_slugs(species) -> list[str]`, `generic_slug(species) -> str`
  - `loft(rings, cap_start=None, cap_end=None) -> (verts, faces)`
  - `ellipse_ring(x, half_y, half_z, segments, z=0.0) -> list[tuple]`
  - `blade_ring(a, b, thickness) -> list[tuple]`
  - `mirror_y(verts) -> list[tuple]`, `rotate_y(verts, degrees, pivot) -> list[tuple]`
  - `class Part` with `.verts`, `.faces`, `.mats`, `.groups` and `.add(verts, faces, mat, weights)`
  - `make_mesh(name, part) -> bpy.types.Object`
  - `tri_count(obj) -> int`
  - `manifold_report(obj) -> dict` with keys `non_manifold_edges`, `non_manifold_verts`, `loose_verts`, `wire_edges`, `ok`
  - `configure_ink_render(scene, width, height, thickness=1.2) -> None`
  - `add_camera(scene, name="cam") -> bpy.types.Object`, `aim(cam, target=(0,0,0)) -> None`
  - `fit_ortho(cam, obj, width, height, margin=1.14) -> None`
  - `place_camera(scene, obj, view, width, height, distance=12.0, margin=1.14) -> bpy.types.Object`, which positions, aims and fits in one call
  - `render_still(scene, out_path) -> pathlib.Path`
  - `VIEWS: dict[str, tuple]` mapping `"side" | "top" | "front" | "hero"` to a unit direction
  - `glb_summary(path) -> dict` with keys `bytes`, `animations`, `skins`, `meshes`
  - `compose_grid(paths, cols, out_path, labels=None, tile=None) -> pathlib.Path`

- [ ] **Step 1: Write the failing tests for the shape grammar**

Append to `blender/tests/run_tests.py`, after `TestSpeciesJson` and before `def main():`:

```python
class TestLoft(unittest.TestCase):
    """The loft is the one helper every shell is built from, so it gets
    tested on synthetic rings where the right answer is arithmetic."""

    def setUp(self):
        import bpy
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def test_a_tube_with_flat_caps_is_closed_and_manifold(self):
        import birdlib
        rings = [birdlib.ellipse_ring(x * 0.5, 0.2, 0.2, 8) for x in range(4)]
        verts, faces = birdlib.loft(rings)
        part = birdlib.Part()
        part.add(verts, faces, birdlib.MAT_PAPER,
                 [{"root": 1.0} for _ in verts])
        obj = birdlib.make_mesh("tube", part)
        report = birdlib.manifold_report(obj)
        self.assertTrue(report["ok"], report)
        self.assertEqual(len(verts), 4 * 8)
        self.assertEqual(len(faces), 3 * 8 + 2)

    def test_poles_close_the_ends_with_triangle_fans(self):
        import birdlib
        rings = [birdlib.ellipse_ring(x * 0.5, 0.2, 0.2, 6) for x in range(3)]
        verts, faces = birdlib.loft(rings, cap_start=(-0.4, 0.0, 0.0),
                                    cap_end=(1.4, 0.0, 0.0))
        part = birdlib.Part()
        part.add(verts, faces, birdlib.MAT_PAPER,
                 [{"root": 1.0} for _ in verts])
        obj = birdlib.make_mesh("capsule", part)
        self.assertTrue(birdlib.manifold_report(obj)["ok"])
        self.assertEqual(len(verts), 3 * 6 + 2)
        self.assertEqual(len(faces), 2 * 6 + 2 * 6)

    def test_rings_of_unequal_length_are_rejected(self):
        import birdlib
        with self.assertRaises(ValueError):
            birdlib.loft([birdlib.ellipse_ring(0.0, 1.0, 1.0, 6),
                          birdlib.ellipse_ring(1.0, 1.0, 1.0, 8)])

    def test_blade_ring_is_four_points_thick_in_z(self):
        import birdlib
        ring = birdlib.blade_ring((1.0, 0.5, 0.0), (0.4, 0.5, 0.0), 0.02)
        self.assertEqual(len(ring), 4)
        self.assertAlmostEqual(max(p[2] for p in ring), 0.01)
        self.assertAlmostEqual(min(p[2] for p in ring), -0.01)

    def test_mirror_y_flips_only_y(self):
        import birdlib
        out = birdlib.mirror_y([(1.0, 2.0, 3.0)])
        self.assertEqual(out, [(1.0, -2.0, 3.0)])

    def test_rotate_y_about_a_pivot(self):
        import birdlib
        out = birdlib.rotate_y([(1.0, 0.0, 0.0)], 90.0, (0.0, 0.0, 0.0))
        self.assertAlmostEqual(out[0][0], 0.0, places=6)
        self.assertAlmostEqual(out[0][2], -1.0, places=6)


class TestPlumbing(unittest.TestCase):
    def test_scratch_dir_honours_the_env_var(self):
        import os
        import birdlib
        before = os.environ.get("BIRDS_SCRATCH")
        target = pathlib.Path(birdlib.scratch_dir()).parent / "birdlib-env-probe"
        os.environ["BIRDS_SCRATCH"] = str(target)
        try:
            got = birdlib.scratch_dir("seq")
            self.assertEqual(got, target / "seq")
            self.assertTrue(got.is_dir())
        finally:
            if before is None:
                del os.environ["BIRDS_SCRATCH"]
            else:
                os.environ["BIRDS_SCRATCH"] = before

    def test_scratch_dir_is_outside_the_repository(self):
        import birdlib
        self.assertNotIn(str(birdlib.REPO_ROOT), str(birdlib.scratch_dir()),
                         "intermediates must never land in the repo")

    def test_generic_resolves_to_a_real_slug(self):
        import birdlib
        species = birdlib.load_species()
        self.assertIn(birdlib.generic_slug(species), birdlib.real_slugs(species))
        self.assertNotIn("generic", birdlib.real_slugs(species))

    def test_materials_are_greyscale(self):
        """The load bearing brand rule: no colour on birds, carmine never."""
        import birdlib
        for colour in (birdlib.PAPER, birdlib.INK):
            self.assertEqual(colour[0], colour[1])
            self.assertEqual(colour[1], colour[2])

    def test_ink_render_config_uses_workbench_and_freestyle(self):
        import bpy
        import birdlib
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        birdlib.configure_ink_render(scene, 320, 240, thickness=1.2)
        self.assertEqual(scene.render.engine, "BLENDER_WORKBENCH")
        self.assertTrue(scene.render.use_freestyle)
        self.assertTrue(scene.render.film_transparent)
        self.assertEqual(scene.render.image_settings.color_mode, "RGBA")
        self.assertEqual(scene.display.shading.light, "FLAT")
        self.assertEqual(scene.display.shading.color_type, "MATERIAL")
        lineset = scene.view_layers[0].freestyle_settings.linesets[0]
        self.assertAlmostEqual(lineset.linestyle.color[0], birdlib.INK[0], places=3)
        self.assertAlmostEqual(scene.render.line_thickness, 1.2, places=3)
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: the six `TestSpeciesJson` tests still pass; every `TestLoft` and `TestPlumbing` test errors with `ModuleNotFoundError: No module named 'birdlib'`.

- [ ] **Step 3: Write birdlib.py**

Create `blender/birdlib.py`:

```python
"""Shape grammar and shared plumbing for the Blender bird pipeline.

Geometry convention: one model unit is the greater crested tern's body
length (46 cm). Origin at the body centre. Blender +X is forward (the
bill), +Y is the bird's left, +Z is up.

Every shell in every bird is built by loft() from a list of equal length
vertex rings. Overlapping closed shells are joined into one mesh and
Freestyle culls the occluded parts, so there are no booleans anywhere.
"""

import json
import math
import os
import pathlib
import shutil
import struct
import subprocess
import sys

import bmesh
import bpy
import mathutils

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
BLENDER_DIR = REPO_ROOT / "blender"
ASSET_DIR = REPO_ROOT / "site" / "assets" / "birds"
SPECIES_PATH = BLENDER_DIR / "species.json"

# The documented default for this workstation. blender/build.sh exports a
# stable BIRDS_SCRATCH so this constant is only a last resort.
DEFAULT_SCRATCH = ("/private/tmp/claude-502/-Users-Alex/"
                   "b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/blender")

INK = (0.063, 0.063, 0.063)
PAPER = (1.0, 1.0, 1.0)
MAT_PAPER = 0
MAT_INK = 1
MAT_NAMES = ("bird_white", "bird_ink")

TRI_CEILING = 3000
TRI_TARGET = 1400

GLB_MAX = 60 * 1024
STILL_MAX = 40 * 1024
WEBM_MAX = 150 * 1024
APNG_MAX = 300 * 1024
TOTAL_MAX = 1024 * 1024

FPS = 24
FLAP_FRAMES = 24

# Unit direction from the origin to the camera, per view.
VIEWS = {
    "side": (0.0, -1.0, 0.0),
    "top": (0.0, 0.0, 1.0),
    "front": (1.0, 0.0, 0.0),
    "hero": (0.62, -0.72, 0.31),
}


# --------------------------------------------------------------------------
# plumbing
# --------------------------------------------------------------------------

def script_args():
    """The arguments after -- on the blender command line."""
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    return []


def scratch_dir(sub=None):
    """The intermediate directory, created. Never inside the repository."""
    root = pathlib.Path(os.environ.get("BIRDS_SCRATCH") or DEFAULT_SCRATCH)
    path = root / sub if sub else root
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_species():
    return json.loads(SPECIES_PATH.read_text(encoding="utf-8"))


def real_slugs(species):
    """Species with parameters, in file order. Aliases are excluded."""
    return [k for k, v in species.items() if "alias" not in v]


def generic_slug(species):
    return species["generic"]["alias"]


# --------------------------------------------------------------------------
# shape grammar
# --------------------------------------------------------------------------

def ellipse_ring(x, half_y, half_z, segments, z=0.0):
    """An elliptical cross section in the YZ plane at the given x."""
    ring = []
    for j in range(segments):
        a = 2.0 * math.pi * j / segments
        ring.append((x, half_y * math.cos(a), z + half_z * math.sin(a)))
    return ring


def blade_ring(a, b, thickness):
    """A thin rectangular cross section spanning a to b, thick along Z.

    Wings pass leading and trailing edge points, which differ in X. The
    tail passes inner and outer edge points, which differ in Y. Same
    helper either way.
    """
    h = thickness * 0.5
    return [
        (a[0], a[1], a[2] + h),
        (b[0], b[1], b[2] + h),
        (b[0], b[1], b[2] - h),
        (a[0], a[1], a[2] - h),
    ]


def loft(rings, cap_start=None, cap_end=None):
    """Bridge equal length vertex rings into a closed shell.

    rings: a list of lists of (x, y, z). Every ring has the same length
    and walks its cross section in the same direction.
    cap_start / cap_end: None for a flat n-gon cap, or an (x, y, z) point
    for a single pole vertex fanned to the end ring.

    Returns (verts, faces). Face winding is not guaranteed consistent;
    make_mesh() runs recalc_face_normals, which fixes it for a closed
    shell, so callers do not need to care.
    """
    if len(rings) < 2:
        raise ValueError("a loft needs at least two rings")
    m = len(rings[0])
    for ring in rings:
        if len(ring) != m:
            raise ValueError("every ring must have the same length")

    verts = []
    for ring in rings:
        verts.extend(tuple(p) for p in ring)

    faces = []
    for i in range(len(rings) - 1):
        a = i * m
        b = (i + 1) * m
        for j in range(m):
            k = (j + 1) % m
            faces.append((a + j, a + k, b + k, b + j))

    if cap_start is None:
        faces.append(tuple(range(m - 1, -1, -1)))
    else:
        pole = len(verts)
        verts.append(tuple(cap_start))
        for j in range(m):
            k = (j + 1) % m
            faces.append((pole, k, j))

    last = (len(rings) - 1) * m
    if cap_end is None:
        faces.append(tuple(range(last, last + m)))
    else:
        pole = len(verts)
        verts.append(tuple(cap_end))
        for j in range(m):
            k = (j + 1) % m
            faces.append((pole, last + j, last + k))

    return verts, faces


def mirror_y(verts):
    return [(x, -y, z) for (x, y, z) in verts]


def rotate_y(verts, degrees, pivot):
    """Rotate about the Y axis through pivot. Used to tilt the ink cap."""
    a = math.radians(degrees)
    ca, sa = math.cos(a), math.sin(a)
    px, py, pz = pivot
    out = []
    for (x, y, z) in verts:
        dx, dz = x - px, z - pz
        out.append((px + dx * ca + dz * sa, y, pz - dx * sa + dz * ca))
    return out


class Part:
    """An accumulating pile of shells, each with a material and weights."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.mats = []
        self.groups = []

    def add(self, verts, faces, mat, weights):
        """weights is one {group_name: weight} dict per vertex."""
        if len(weights) != len(verts):
            raise ValueError("one weight dict per vertex is required")
        offset = len(self.verts)
        self.verts.extend(verts)
        self.groups.extend(weights)
        for face in faces:
            self.faces.append(tuple(i + offset for i in face))
            self.mats.append(mat)

    def group_names(self):
        names = set()
        for w in self.groups:
            names.update(w)
        return sorted(names)


def _material(index):
    name = MAT_NAMES[index]
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        rgb = PAPER if index == MAT_PAPER else INK
        mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
        mat.roughness = 1.0
        mat.metallic = 0.0
    return mat


def make_mesh(name, part):
    """Turn a Part into a linked mesh object with materials and groups."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(part.verts, [], part.faces)
    mesh.validate(verbose=False)
    mesh.update()

    used = sorted(set(part.mats))
    slot_of = {}
    for slot, mat_index in enumerate(used):
        mesh.materials.append(_material(mat_index))
        slot_of[mat_index] = slot
    for poly, mat_index in zip(mesh.polygons, part.mats):
        poly.material_index = slot_of[mat_index]

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    for group in part.group_names():
        obj.vertex_groups.new(name=group)
    for i, weights in enumerate(part.groups):
        for group, weight in weights.items():
            obj.vertex_groups[group].add([i], weight, "REPLACE")

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return obj


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def manifold_report(obj):
    """Every edge bounded by exactly two faces, no loose or wire geometry.

    Two overlapping closed shells in one mesh both pass, which is the
    whole point of the overlapping shells technique.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    report = {
        "non_manifold_edges": [e.index for e in bm.edges if not e.is_manifold],
        "non_manifold_verts": [v.index for v in bm.verts if not v.is_manifold],
        "loose_verts": [v.index for v in bm.verts if not v.link_edges],
        "wire_edges": [e.index for e in bm.edges if e.is_wire],
    }
    bm.free()
    report["ok"] = not any(report[k] for k in
                           ("non_manifold_edges", "non_manifold_verts",
                            "loose_verts", "wire_edges"))
    return report


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

def configure_ink_render(scene, width, height, thickness=1.2):
    """Workbench plus Freestyle, flat white surfaces, ink lines, alpha.

    color_type is MATERIAL rather than SINGLE so the ink material renders
    dark and a filled cap is possible.
    """
    render = scene.render
    render.engine = "BLENDER_WORKBENCH"
    render.use_freestyle = True
    render.film_transparent = True
    render.resolution_x = width
    render.resolution_y = height
    render.resolution_percentage = 100
    render.fps = FPS
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    render.image_settings.compression = 100
    render.line_thickness_mode = "ABSOLUTE"
    render.line_thickness = thickness

    shading = scene.display.shading
    shading.light = "FLAT"
    shading.color_type = "MATERIAL"
    shading.show_object_outline = False
    shading.show_specular_highlight = False
    shading.show_cavity = False
    shading.show_shadows = False
    scene.display.render_aa = "8"

    settings = scene.view_layers[0].freestyle_settings
    settings.mode = "EDITOR"
    lineset = settings.linesets[0]
    lineset.select_by_visibility = True
    lineset.visibility = "VISIBLE"
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    lineset.select_edge_mark = True
    lineset.select_contour = False
    lineset.linestyle.color = INK
    lineset.linestyle.thickness = thickness
    lineset.linestyle.alpha = 1.0
    lineset.linestyle.caps = "ROUND"


def add_camera(scene, name="cam"):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.clip_start = 0.01
    data.clip_end = 100.0
    cam = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim(cam, target=(0.0, 0.0, 0.0)):
    """Point the camera at target. to_track_quat handles the straight down
    case, so the top view needs no special casing."""
    direction = mathutils.Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def fit_ortho(cam, obj, width, height, margin=1.14):
    """Set ortho_scale so obj fills the frame with a margin.

    ortho_scale is the view width along the larger render dimension, so
    the vertical requirement is scaled by width over height.
    """
    matrix = cam.matrix_world.inverted()
    u = v = 0.0
    for corner in obj.bound_box:
        p = matrix @ (obj.matrix_world @ mathutils.Vector(corner))
        u = max(u, abs(p.x))
        v = max(v, abs(p.y))
    need_u = 2.0 * u
    need_v = 2.0 * v * (float(width) / float(height))
    cam.data.ortho_scale = max(need_u, need_v, 1e-4) * margin


def place_camera(scene, obj, view, width, height, distance=12.0, margin=1.14):
    """Position, aim and fit a camera for one named view."""
    cam = scene.camera or add_camera(scene)
    direction = mathutils.Vector(VIEWS[view]).normalized()
    cam.location = direction * distance
    aim(cam)
    bpy.context.view_layer.update()
    fit_ortho(cam, obj, width, height, margin)
    return cam


def render_still(scene, out_path):
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    return pathlib.Path(out_path)


# --------------------------------------------------------------------------
# inspection and composition
# --------------------------------------------------------------------------

def glb_summary(path):
    """Read the GLB JSON chunk without unpacking the whole file."""
    path = pathlib.Path(path)
    with path.open("rb") as fh:
        magic, _version, _length = struct.unpack("<4sII", fh.read(12))
        if magic != b"glTF":
            raise ValueError("%s is not a GLB" % path)
        chunk_len, chunk_type = struct.unpack("<II", fh.read(8))
        if chunk_type != 0x4E4F534A:
            raise ValueError("%s does not start with a JSON chunk" % path)
        doc = json.loads(fh.read(chunk_len).decode("utf-8"))
    return {
        "bytes": path.stat().st_size,
        "animations": [a.get("name") for a in doc.get("animations", [])],
        "skins": len(doc.get("skins", [])),
        "meshes": [m.get("name") for m in doc.get("meshes", [])],
    }


def compose_grid(paths, cols, out_path, labels=None, tile=None):
    """Composite PNGs into a contact sheet on white.

    ImageMagick is the primary path because magick is installed at
    /usr/local/bin/magick. The Blender image API fallback exists for a
    machine without it and is slow, so it downscales tiles first.
    """
    paths = [str(p) for p in paths]
    out_path = pathlib.Path(out_path)
    magick = shutil.which("magick") or shutil.which("montage")
    if magick:
        cmd = [magick]
        if magick.endswith("magick"):
            cmd.append("montage")
        cmd += ["-background", "white", "-fill", "#101010", "-pointsize", "20",
                "-tile", "%dx" % cols, "-geometry", "+10+10"]
        for i, path in enumerate(paths):
            if labels:
                cmd += ["-label", labels[i]]
            cmd.append(path)
        cmd.append(str(out_path))
        subprocess.run(cmd, check=True)
        return out_path
    return _compose_grid_blender(paths, cols, out_path, tile or 400)


def _compose_grid_blender(paths, cols, out_path, tile):
    images = []
    for path in paths:
        img = bpy.data.images.load(path)
        w, h = img.size
        scale = min(1.0, float(tile) / float(max(w, h)))
        if scale < 1.0:
            img.scale(max(1, int(w * scale)), max(1, int(h * scale)))
        images.append(img)

    gap = 8
    tw = max(i.size[0] for i in images)
    th = max(i.size[1] for i in images)
    rows = (len(images) + cols - 1) // cols
    width = cols * tw + (cols + 1) * gap
    height = rows * th + (rows + 1) * gap
    buf = [1.0] * (width * height * 4)

    for n, img in enumerate(images):
        row, col = divmod(n, cols)
        w, h = img.size
        src = list(img.pixels)
        x0 = gap + col * (tw + gap) + (tw - w) // 2
        # Blender pixel rows run bottom up, so the first row is the last one.
        y0 = gap + (rows - 1 - row) * (th + gap) + (th - h) // 2
        for y in range(h):
            si = y * w * 4
            di = ((y0 + y) * width + x0) * 4
            for k in range(0, w * 4, 4):
                alpha = src[si + k + 3]
                if alpha <= 0.0:
                    continue
                for channel in range(3):
                    value = src[si + k + channel]
                    buf[di + k + channel] = (value * alpha
                                             + buf[di + k + channel] * (1.0 - alpha))
        bpy.data.images.remove(img)

    dst = bpy.data.images.new("sheet", width, height, alpha=True)
    dst.pixels = buf
    dst.filepath_raw = str(out_path)
    dst.file_format = "PNG"
    dst.save()
    bpy.data.images.remove(dst)
    return pathlib.Path(out_path)
```

- [ ] **Step 4: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, seventeen tests passing, exit 0. If `test_a_tube_with_flat_caps_is_closed_and_manifold` reports `non_manifold_edges`, the loft's ring wrap is wrong; the `% m` in both the quad and the fan is what closes the ring.

- [ ] **Step 5: Commit (parent agent only)**

```bash
git add blender/birdlib.py blender/tests/run_tests.py
git commit -m "feat(birds): shape grammar, render config and shared plumbing"
```

---

### Task 3: build_birds.py, the silhouette build

Geometry only. No rig, no animation: those wait behind the silhouette gate, exactly as spec 6.5 subgoal 1 requires.

**Files:**
- Create: `blender/build_birds.py`
- Modify: `blender/tests/run_tests.py` (append one `TestCase` class)

**Interfaces:**
- Consumes: every name in the Task 2 interface block.
- Produces:
  - `build_birds.build_species(slug, params, rig=True) -> (mesh_obj, armature_obj | None)`
  - `build_birds.build_scene(slug, rig=True) -> (mesh_obj, armature_obj | None)`, which resets the scene, resolves an alias to its target, and returns the built objects
  - `build_birds.WING_STATIONS = 9`, `BODY_SEGMENTS = 12`, `HEAD_SEGMENTS = 10`
  - `build_birds.wing_geometry(params, sign) -> list[list[tuple]]`, the spanwise blade rings for one wing
  - `build_birds.wing_weights(s) -> dict`, the vertex weights at spanwise fraction `s`
  - Group names: `root`, `wing_L_shoulder`, `wing_L_elbow`, `wing_L_hand`, and the `wing_R_*` mirrors

- [ ] **Step 1: Write the failing tests for the build**

Append to `blender/tests/run_tests.py`, before `def main():`:

```python
class TestBuild(unittest.TestCase):
    """Every species builds, inside budget, closed, and colourless."""

    def test_every_species_builds(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                mesh_obj, armature = build_birds.build_scene(slug, rig=False)
                self.assertIsNotNone(mesh_obj)
                self.assertIsNone(armature)
                self.assertGreater(len(mesh_obj.data.polygons), 100)

    def test_triangle_budget(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                mesh_obj, _ = build_birds.build_scene(slug, rig=False)
                tris = birdlib.tri_count(mesh_obj)
                print("  %-24s %5d tris" % (slug, tris))
                self.assertLess(tris, birdlib.TRI_CEILING,
                                "%s is over the 3000 ceiling" % slug)
                self.assertLess(tris, birdlib.TRI_TARGET,
                                "%s is over the 1400 working target" % slug)

    def test_every_mesh_is_manifold(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                mesh_obj, _ = build_birds.build_scene(slug, rig=False)
                report = birdlib.manifold_report(mesh_obj)
                self.assertTrue(report["ok"], "%s: %s" % (slug, report))

    def test_no_colour_on_any_bird(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                mesh_obj, _ = build_birds.build_scene(slug, rig=False)
                self.assertGreaterEqual(len(mesh_obj.data.materials), 1)
                for mat in mesh_obj.data.materials:
                    r, g, b, _a = mat.diffuse_color
                    self.assertAlmostEqual(r, g, places=5,
                                           msg="%s %s is not greyscale" % (slug, mat.name))
                    self.assertAlmostEqual(g, b, places=5,
                                           msg="%s %s is not greyscale" % (slug, mat.name))

    def test_capped_and_flashed_species_carry_the_ink_material(self):
        import birdlib
        import build_birds
        species = birdlib.load_species()
        for slug in birdlib.real_slugs(species):
            params = species[slug]
            mesh_obj, _ = build_birds.build_scene(slug, rig=False)
            names = [m.name for m in mesh_obj.data.materials]
            wants_ink = params["cap"] or params["wing_flash"]
            with self.subTest(slug=slug):
                self.assertEqual("bird_ink" in names, wants_ink,
                                 "%s ink material presence is wrong" % slug)

    def test_the_bird_faces_positive_x_and_spans_its_wingspan(self):
        import birdlib
        import build_birds
        species = birdlib.load_species()
        for slug in birdlib.real_slugs(species):
            mesh_obj, _ = build_birds.build_scene(slug, rig=False)
            xs = [v.co.x for v in mesh_obj.data.vertices]
            ys = [v.co.y for v in mesh_obj.data.vertices]
            with self.subTest(slug=slug):
                self.assertGreater(max(xs), 0.0, "%s bill must lead in +X" % slug)
                span = max(ys) - min(ys)
                self.assertAlmostEqual(span, species[slug]["wing_span"],
                                       delta=0.06,
                                       msg="%s span is %.3f" % (slug, span))

    def test_wing_weights_sum_to_one(self):
        import build_birds
        for i in range(21):
            s = i / 20.0
            total = sum(build_birds.wing_weights(s).values())
            self.assertAlmostEqual(total, 1.0, places=6, msg="s=%.2f" % s)

    def test_generic_builds_by_building_its_target(self):
        import build_birds
        mesh_obj, _ = build_birds.build_scene("generic", rig=False)
        self.assertEqual(mesh_obj.name, "greater-crested-tern")
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `TestBuild` errors with `ModuleNotFoundError: No module named 'build_birds'`; earlier tests still pass.

- [ ] **Step 3: Write build_birds.py**

Create `blender/build_birds.py`:

```python
"""Build one parametric ink seabird per species, from species.json.

Each bird is a set of overlapping closed shells joined into one mesh:
body, head, bill, optional bill tube, two wings, two tail halves, and
optional ink overlays for a cap and for dark outer wing panels. Freestyle
culls the occluded parts of each shell, so overlapping is how the merged
outline is achieved without a single boolean.

Run a smoke build and print the budgets:

    /usr/local/bin/blender -b --factory-startup \
      --python blender/build_birds.py -- --all
"""

import argparse
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import bpy

import birdlib

BODY_SEGMENTS = 12
HEAD_SEGMENTS = 10
HEAD_RINGS = 5
BILL_SEGMENTS = 8
BILL_RINGS = 3
WING_STATIONS = 9
TAIL_STATIONS = 5
CAP_SEGMENTS = 10
CAP_RINGS = 4

# Normalised body profile: t from the head end to the tail end, then the
# half width factor, the half height factor, and the centreline rise.
# Multiplied by body_width, body_depth and body_depth respectively.
BODY_PROFILE = (
    (0.00, 0.10, 0.12, 0.10),
    (0.12, 0.28, 0.34, 0.06),
    (0.28, 0.42, 0.48, 0.02),
    (0.45, 0.50, 0.50, 0.00),
    (0.62, 0.44, 0.44, -0.02),
    (0.78, 0.30, 0.32, -0.02),
    (0.90, 0.16, 0.20, 0.00),
    (1.00, 0.06, 0.09, 0.03),
)

NOTCH_STATION = 0.625
NOTCH_HALF_WIDTH = 0.125

# Spanwise fractions where the wing blade is inked, for a flashed wing.
# The white band between them is the flash.
FLASH_PANELS = ((0.66, 0.72), (0.80, 1.0))


def wing_weights(s):
    """Vertex weights at spanwise fraction s, for the left wing.

    Three bones share the blade with linear crossfades, so the weights
    always sum to one and the wing folds rather than hinging.
    """
    if s <= 0.30:
        return {"shoulder": 1.0}
    if s <= 0.55:
        t = (s - 0.30) / 0.25
        return {"shoulder": 1.0 - t, "elbow": t}
    if s <= 0.80:
        t = (s - 0.55) / 0.25
        return {"elbow": 1.0 - t, "hand": t}
    return {"hand": 1.0}


def _side_weights(s, side):
    return {"wing_%s_%s" % (side, bone): w
            for bone, w in wing_weights(s).items()}


def _notch_factor(s, notch):
    d = abs(s - NOTCH_STATION)
    if d >= NOTCH_HALF_WIDTH:
        return 1.0
    return 1.0 - notch * (1.0 - d / NOTCH_HALF_WIDTH)


def _shoulder(params):
    """Where the wing root sits: just outside the body, at its widest."""
    length = params["body_length"]
    x = length * (0.5 - BODY_PROFILE[3][0])
    y = params["body_width"] * 0.45
    z = params["body_depth"] * 0.18
    return x, y, z


def wing_geometry(params, sign):
    """Spanwise blade rings for one wing. sign is +1 left, -1 right."""
    x0, y0, z0 = _shoulder(params)
    half_span = params["wing_span"] * 0.5
    sweep = math.tan(math.radians(params["wing_sweep"]))
    dihedral = math.tan(math.radians(params["wing_dihedral"]))
    rings = []
    for i in range(WING_STATIONS):
        s = i / float(WING_STATIONS - 1)
        reach = s * (half_span - y0)
        y = sign * (y0 + reach)
        x_le = x0 - sweep * reach
        z = z0 + dihedral * reach
        chord = (params["wing_chord"]
                 * (1.0 - s * (1.0 - params["wing_taper"]))
                 * _notch_factor(s, params["wing_notch"]))
        rings.append(birdlib.blade_ring((x_le, y, z),
                                        (x_le - chord, y, z),
                                        params["wing_thickness"]))
    return rings


def _wing_panel_rings(params, sign, s_start, s_end, thickness_scale=1.6):
    """A short ink blade laid over the wing between two spanwise fractions."""
    x0, y0, z0 = _shoulder(params)
    half_span = params["wing_span"] * 0.5
    sweep = math.tan(math.radians(params["wing_sweep"]))
    dihedral = math.tan(math.radians(params["wing_dihedral"]))
    rings = []
    steps = 3
    for i in range(steps):
        s = s_start + (s_end - s_start) * i / float(steps - 1)
        reach = s * (half_span - y0)
        y = sign * (y0 + reach)
        x_le = x0 - sweep * reach
        z = z0 + dihedral * reach
        chord = (params["wing_chord"]
                 * (1.0 - s * (1.0 - params["wing_taper"]))
                 * _notch_factor(s, params["wing_notch"]))
        rings.append(birdlib.blade_ring((x_le + 0.002, y, z),
                                        (x_le - chord - 0.002, y, z),
                                        params["wing_thickness"] * thickness_scale))
    return rings, [s_start + (s_end - s_start) * i / float(steps - 1)
                   for i in range(steps)]


def _body(part, params):
    length = params["body_length"]
    rings = []
    for (t, wf, hf, rise) in BODY_PROFILE:
        x = length * (0.5 - t)
        rings.append(birdlib.ellipse_ring(
            x,
            params["body_width"] * wf,
            params["body_depth"] * hf,
            BODY_SEGMENTS,
            z=params["body_depth"] * rise))
    nose = (length * 0.5 + params["body_width"] * 0.06,
            0.0, params["body_depth"] * 0.10)
    tail = (-length * 0.5 - params["body_width"] * 0.04,
            0.0, params["body_depth"] * 0.03)
    verts, faces = birdlib.loft(rings, cap_start=nose, cap_end=tail)
    part.add(verts, faces, birdlib.MAT_PAPER, [{"root": 1.0}] * len(verts))


def _head_centre(params):
    return (params["body_length"] * 0.5 + params["head_length"] * 0.28,
            0.0,
            params["body_depth"] * 0.22)


def _dome_rings(centre, radii, segments, ring_count, phi_max, scale=1.0):
    """Latitude rings of an ellipsoid from the pole down to phi_max."""
    cx, cy, cz = centre
    rx, ry, rz = (r * scale for r in radii)
    rings = []
    for i in range(1, ring_count + 1):
        phi = phi_max * i / float(ring_count)
        r = math.sin(phi)
        z = math.cos(phi)
        ring = []
        for j in range(segments):
            a = 2.0 * math.pi * j / segments
            ring.append((cx + rx * r * math.cos(a),
                         cy + ry * r * math.sin(a),
                         cz + rz * z))
        rings.append(ring)
    return rings, (cx, cy, cz + rz)


def _head(part, params):
    centre = _head_centre(params)
    radii = (params["head_length"] * 0.5,
             params["head_width"] * 0.5,
             params["head_depth"] * 0.5)
    rings, pole = _dome_rings(centre, radii, HEAD_SEGMENTS, HEAD_RINGS,
                              math.pi * (HEAD_RINGS / float(HEAD_RINGS + 1)))
    bottom = (centre[0], centre[1], centre[2] - radii[2])
    verts, faces = birdlib.loft(rings, cap_start=pole, cap_end=bottom)
    part.add(verts, faces, birdlib.MAT_PAPER, [{"root": 1.0}] * len(verts))


def _bill(part, params):
    centre = _head_centre(params)
    base_x = centre[0] + params["head_length"] * 0.34
    droop = math.radians(params["bill_droop"])
    rings = []
    for i in range(BILL_RINGS):
        t = i / float(BILL_RINGS - 1)
        reach = t * params["bill_length"]
        x = base_x + reach * math.cos(droop)
        z = centre[2] - reach * math.sin(droop)
        half = params["bill_depth"] * 0.5 * (1.0 - 0.55 * t)
        rings.append(birdlib.ellipse_ring(x, half * 0.72, half,
                                          BILL_SEGMENTS, z=z))
    tip = (base_x + params["bill_length"] * 1.06 * math.cos(droop),
           0.0,
           centre[2] - params["bill_length"] * 1.06 * math.sin(droop)
           - params["bill_depth"] * 0.18)
    verts, faces = birdlib.loft(rings, cap_end=tip)
    part.add(verts, faces, birdlib.MAT_PAPER, [{"root": 1.0}] * len(verts))

    if params["bill_tube"]:
        tube = []
        for i in range(3):
            t = 0.18 + 0.46 * i / 2.0
            reach = t * params["bill_length"]
            x = base_x + reach * math.cos(droop)
            z = (centre[2] - reach * math.sin(droop)
                 + params["bill_depth"] * 0.30)
            half = params["bill_depth"] * 0.20
            tube.append(birdlib.ellipse_ring(x, half, half, 6, z=z))
        verts, faces = birdlib.loft(tube)
        part.add(verts, faces, birdlib.MAT_PAPER, [{"root": 1.0}] * len(verts))


def _wings(part, params):
    for sign, side in ((1.0, "L"), (-1.0, "R")):
        rings = wing_geometry(params, sign)
        verts, faces = birdlib.loft(rings)
        weights = []
        for i in range(WING_STATIONS):
            s = i / float(WING_STATIONS - 1)
            weights.extend([_side_weights(s, side)] * 4)
        # The two flat caps add no vertices, so weights already match.
        part.add(verts, faces, birdlib.MAT_PAPER, weights)

        if params["wing_flash"]:
            for (a, b) in FLASH_PANELS:
                panel, fractions = _wing_panel_rings(params, sign, a, b)
                pverts, pfaces = birdlib.loft(panel)
                pweights = []
                for s in fractions:
                    pweights.extend([_side_weights(s, side)] * 4)
                part.add(pverts, pfaces, birdlib.MAT_INK, pweights)


def _tail(part, params):
    x_tail = -params["body_length"] * 0.5 + params["body_length"] * 0.02
    angle = math.radians(params["tail_fork"] * 0.5)
    for sign in (1.0, -1.0):
        rings = []
        for i in range(TAIL_STATIONS):
            s = i / float(TAIL_STATIONS - 1)
            reach = s * params["tail_length"]
            x = x_tail - reach * math.cos(angle)
            y_inner = sign * reach * math.sin(angle)
            width = params["tail_width"] * 0.5 * (1.0 - 0.5 * s)
            rings.append(birdlib.blade_ring(
                (x, y_inner, 0.0),
                (x, y_inner + sign * width, 0.0),
                params["wing_thickness"] * 0.8))
        verts, faces = birdlib.loft(rings)
        part.add(verts, faces, birdlib.MAT_PAPER, [{"root": 1.0}] * len(verts))


def _cap(part, params):
    """An ink dome over the crown, tilted back so it covers the nape."""
    centre = _head_centre(params)
    radii = (params["head_length"] * 0.5,
             params["head_width"] * 0.5,
             params["head_depth"] * 0.5)
    rings, pole = _dome_rings(centre, radii, CAP_SEGMENTS, CAP_RINGS,
                              math.radians(96.0), scale=1.035)
    verts, faces = birdlib.loft(rings, cap_start=pole)
    # Tilt the dome back so the cap covers the nape, as a tern's does.
    verts = birdlib.rotate_y(verts, -14.0, centre)
    part.add(verts, faces, birdlib.MAT_INK, [{"root": 1.0}] * len(verts))


def build_species(slug, params, rig=True):
    """Build one species into the current scene."""
    part = birdlib.Part()
    _body(part, params)
    _head(part, params)
    _bill(part, params)
    _wings(part, params)
    _tail(part, params)
    if params["cap"]:
        _cap(part, params)

    mesh_obj = birdlib.make_mesh(slug, part)
    if not rig:
        return mesh_obj, None
    armature = _rig(mesh_obj, params, slug)
    return mesh_obj, armature


def _rig(mesh_obj, params, slug):
    raise NotImplementedError("the rig arrives in Task 6, after the gate")


def build_scene(slug, rig=True):
    """Reset the scene, resolve an alias, and build."""
    species = birdlib.load_species()
    entry = species[slug]
    if "alias" in entry:
        slug = entry["alias"]
        entry = species[slug]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return build_species(slug, entry, rig=rig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--species", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--rig", action="store_true")
    args = parser.parse_args(birdlib.script_args())

    species = birdlib.load_species()
    slugs = args.species or (birdlib.real_slugs(species) if args.all else [])
    if not slugs:
        parser.error("pass --all or one or more --species <slug>")

    failed = False
    for slug in slugs:
        mesh_obj, _ = build_scene(slug, rig=args.rig)
        tris = birdlib.tri_count(mesh_obj)
        report = birdlib.manifold_report(mesh_obj)
        status = "ok" if (report["ok"] and tris < birdlib.TRI_TARGET) else "FAIL"
        print("%-24s %5d tris  manifold=%-5s  %s"
              % (slug, tris, report["ok"], status))
        if status == "FAIL":
            failed = True
            print("   %s" % report)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the smoke build**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/build_birds.py -- --all
```

Expected: four lines, each `manifold=True` and `ok`, triangle counts in the 500 to 900 range, exit 0.

- [ ] **Step 5: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, twenty-five tests passing, exit 0.

If `test_the_bird_faces_positive_x_and_spans_its_wingspan` fails on the span, the wing tip is short by the shoulder inset: `wing_geometry` reaches `half_span` exactly, so the measured span should equal `wing_span` to within the blade thickness. A larger error means `_shoulder` is returning a `y` greater than `half_span`, which only happens if a species has a wingspan narrower than its body.

- [ ] **Step 6: Commit (parent agent only)**

```bash
git add blender/build_birds.py blender/tests/run_tests.py
git commit -m "feat(birds): parametric silhouette build for four species"
```

---

### Task 4: render.py, the contact sheets

**Files:**
- Create: `blender/render.py`
- Modify: `blender/tests/run_tests.py` (append one `TestCase` class)

**Interfaces:**
- Consumes: `birdlib.*` from Task 2, `build_birds.build_scene` from Task 3.
- Produces:
  - `render.SHEET_PX = 800`, `render.LOOP_W = 420`, `render.LOOP_H = 300`, `render.STILL_W = 420`, `render.STILL_H = 300`
  - `render.render_view(slug, view, width, height, out_path, rig=False, frame=None, margin=1.14) -> pathlib.Path`, the one primitive the other three products are built from
  - `render.contact_sheet(slug, size=SHEET_PX) -> pathlib.Path`, writing `<scratch>/review/<slug>-sheet.png`
  - `render.silhouette_board(slugs) -> pathlib.Path`, writing `<scratch>/review/silhouettes.png`
  - `render.still(slug) -> pathlib.Path`, writing `site/assets/birds/<slug>.png`
  - `render.flap_sequence(slug, width=LOOP_W, height=LOOP_H) -> pathlib.Path` (Task 7)

- [ ] **Step 1: Write the failing tests for the sheets**

Append to `blender/tests/run_tests.py`, before `def main():`:

```python
class TestContactSheets(unittest.TestCase):
    """Renders are slow, so this class renders one species at a small
    size and checks the plumbing. The visual judgement is the gate in
    Task 5, made by a reviewer against blender/STYLE.md."""

    def test_a_contact_sheet_is_three_tiles_wide(self):
        import bpy
        import birdlib
        import render
        path = render.contact_sheet("silver-gull", size=160)
        self.assertTrue(path.is_file(), path)
        self.assertGreater(path.stat().st_size, 1000)
        img = bpy.data.images.load(str(path))
        try:
            width, height = img.size
        finally:
            bpy.data.images.remove(img)
        self.assertGreater(width, height * 2,
                           "expected three tiles side by side, got %dx%d"
                           % (width, height))
        self.assertNotIn(str(birdlib.REPO_ROOT), str(path),
                         "contact sheets are review artifacts, not repo files")

    def test_every_view_renders_a_non_empty_transparent_frame(self):
        import bpy
        import birdlib
        import render
        scratch = birdlib.scratch_dir("views-probe")
        for view in ("side", "top", "front", "hero"):
            with self.subTest(view=view):
                path = render.render_view("silver-gull", view, 120, 120,
                                          scratch / ("%s.png" % view))
                self.assertTrue(path.is_file())
                img = bpy.data.images.load(str(path))
                try:
                    pixels = list(img.pixels)
                    self.assertEqual(tuple(img.size), (120, 120))
                    inked = sum(1 for i in range(3, len(pixels), 4)
                                if pixels[i] > 0.5)
                finally:
                    bpy.data.images.remove(img)
                self.assertGreater(inked, 40,
                                   "%s view rendered almost nothing" % view)
                self.assertLess(inked, 120 * 120 * 0.9,
                                "%s view is not transparent" % view)
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `TestContactSheets` errors with `ModuleNotFoundError: No module named 'render'`.

- [ ] **Step 3: Write render.py**

Create `blender/render.py`:

```python
"""Render the birds as ink line art with Workbench plus Freestyle.

Three products:
  contact sheets  side, top and front per species, for the silhouette gate
  the hero still  site/assets/birds/<slug>.png, the reduced motion fallback
  the flap loop   a 24 frame PNG sequence in scratch, encoded by export.py

Cost on this machine is about 15 s for a 640x480 frame, so a sheet at
800 px is roughly 25 s a view and the four species take about five
minutes. The 24 frame loop at 420x300 is about six seconds a frame.

    /usr/local/bin/blender -b --factory-startup \
      --python blender/render.py -- --all --sheets --still --loop
"""

import argparse
import pathlib
import shutil
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import bpy

import birdlib
import build_birds

SHEET_PX = 800
LOOP_W = 420
LOOP_H = 300
STILL_W = 420
STILL_H = 300


def render_view(slug, view, width, height, out_path, rig=False, frame=None,
                margin=1.14):
    """Build the species fresh and render one orthographic view.

    The camera is fitted to obj.bound_box, which reports the undeformed
    mesh, so the frame does not breathe with the wings. Pass a larger
    margin when rendering a mid stroke frame, or an up stroke wingtip
    clips the edge.
    """
    mesh_obj, armature = build_birds.build_scene(slug, rig=rig)
    scene = bpy.context.scene
    birdlib.configure_ink_render(scene, width, height,
                                 thickness=1.2 if width >= 400 else 1.0)
    birdlib.place_camera(scene, mesh_obj, view, width, height, margin=margin)
    if frame is not None and armature is not None:
        scene.frame_set(frame)
    out_path = pathlib.Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    return birdlib.render_still(scene, out_path)


def contact_sheet(slug, size=SHEET_PX):
    """Side, top and front in one sheet, for the silhouette gate."""
    review = birdlib.scratch_dir("review")
    tiles = birdlib.scratch_dir("review/tiles")
    paths = []
    for view in ("side", "top", "front"):
        paths.append(render_view(slug, view, size, size,
                                 tiles / ("%s-%s.png" % (slug, view))))
    out = review / ("%s-sheet.png" % slug)
    return birdlib.compose_grid(paths, 3, out,
                                labels=["%s %s" % (slug, v)
                                        for v in ("side", "top", "front")])


def silhouette_board(slugs):
    """One image for the gate: four species by three views."""
    review = birdlib.scratch_dir("review")
    tiles = birdlib.scratch_dir("review/tiles")
    paths, labels = [], []
    for slug in slugs:
        for view in ("side", "top", "front"):
            paths.append(render_view(slug, view, SHEET_PX, SHEET_PX,
                                     tiles / ("%s-%s.png" % (slug, view))))
            labels.append("%s %s" % (slug, view))
    return birdlib.compose_grid(paths, 3, review / "silhouettes.png",
                                labels=labels)


def still(slug):
    """The hero still in the glide pose, the reduced motion fallback.

    Built with rig=False, so the pose is the rest pose, which is glide.
    """
    birdlib.ASSET_DIR.mkdir(parents=True, exist_ok=True)
    out = birdlib.ASSET_DIR / ("%s.png" % slug)
    path = render_view(slug, "hero", STILL_W, STILL_H, out, rig=False)
    size = path.stat().st_size
    if size > birdlib.STILL_MAX:
        raise SystemExit("still %s is %d bytes, over the %d budget"
                         % (path.name, size, birdlib.STILL_MAX))
    print("still  %-24s %6d bytes" % (slug, size))
    return path


def flap_sequence(slug, width=LOOP_W, height=LOOP_H):
    raise NotImplementedError("the flap loop arrives in Task 7")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--species", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--sheets", action="store_true")
    parser.add_argument("--board", action="store_true")
    parser.add_argument("--still", action="store_true")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--size", type=int, default=SHEET_PX)
    args = parser.parse_args(birdlib.script_args())

    species = birdlib.load_species()
    slugs = args.species or (birdlib.real_slugs(species) if args.all else [])
    if not slugs:
        parser.error("pass --all or one or more --species <slug>")
    if not (args.sheets or args.board or args.still or args.loop):
        parser.error("pass at least one of --sheets --board --still --loop")

    if args.sheets:
        for slug in slugs:
            print("sheet  %s" % contact_sheet(slug, size=args.size))
    if args.board:
        print("board  %s" % silhouette_board(slugs))
    if args.still:
        for slug in slugs:
            still(slug)
    if args.loop:
        for slug in slugs:
            print("loop   %s" % flap_sequence(slug))

    tiles = birdlib.scratch_dir("review/tiles")
    shutil.rmtree(tiles, ignore_errors=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, twenty-seven tests passing, exit 0. This run renders eight small frames, so allow about a minute.

If `test_every_view_renders_a_non_empty_transparent_frame` reports `inked` near zero, the camera is inside the bird or aimed away: check that `birdlib.place_camera` ran `bpy.context.view_layer.update()` before `fit_ortho`, because `bound_box` is stale until it does.

- [ ] **Step 5: Render the gate artifacts**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/render.py -- \
  --all --sheets --board
```

Expected: four per species sheets plus one board, about six minutes. The last lines print the absolute paths.

- [ ] **Step 6: Commit (parent agent only)**

```bash
git add blender/render.py blender/tests/run_tests.py
git commit -m "feat(birds): contact sheet and still renders"
```

---

### Task 5: STOP, the silhouette gate

**This is a hard stop. Do not start Task 6. Do not write a line of rig code. Spec 6.5 subgoal 1 says this gate comes before any rigging, and the reason is that a parameter change is cheap while a rig built on a wrong silhouette is not.**

**Files:** none. This task writes no code.

**Interfaces:**
- Consumes: the renders from Task 4.
- Produces: either an approval, or a list of parameter changes to `blender/species.json` that sends the executor back to Task 3 Step 4.

- [ ] **Step 1: Confirm the gate artifacts exist and report their paths**

```bash
ls -la "${BIRDS_SCRATCH:-/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/blender}/review"
```

Expected: five PNGs, `silhouettes.png` plus one `<slug>-sheet.png` per species.

- [ ] **Step 2: Run the vision review against STYLE.md**

Dispatch one subagent with `model: "sonnet"` (screenshots and image reads are heavy, and they must not land in the parent's context). Give it exactly this prompt, with `<REVIEW_DIR>` substituted:

> Read `/Users/Alex/dev/h5-bird-flu-tracker/blender/STYLE.md` in full, then look at `<REVIEW_DIR>/silhouettes.png` and each `<REVIEW_DIR>/<slug>-sheet.png`.
>
> For each of the four species, answer in two or three sentences: does the silhouette match its reference description in STYLE.md, and would a birder name the species from the side view alone at 120 px wide? Name the single specific thing most wrong with each bird, as a parameter in `blender/species.json` and a direction (for example "wing_taper too high, the tern's wing should be more pointed, try 0.24").
>
> Then check the look rules: is the line ink and even, are the surfaces flat white with no grey and no gradient, is there any colour anywhere, is the background transparent, is the ink cap on the tern a clean filled shape with a legible lower border, and do the brown skua's wing panels leave a visible white band.
>
> Report findings only. Do not edit any file. Do not run Blender. Do not run git.

- [ ] **Step 3: Relay the review to Alex and STOP**

Post a message with:

1. The absolute path of `silhouettes.png` and the four per species sheets, so Alex can open them.
2. The triangle count per species from the Task 3 Step 4 output.
3. The subagent's per species verdict and its single suggested parameter change each.
4. This question, verbatim: "Approve these four silhouettes to go to rigging, or name the changes?"

**Then stop and wait.** Do not proceed on the subagent's approval alone. Spec 11 item 3 reserves two visual passes for Alex and this is the first.

- [ ] **Step 4: If changes are requested, apply them as parameters and loop**

Edit only `blender/species.json`. Do not edit `build_birds.py` unless a change cannot be expressed as a parameter, in which case say so and ask before touching the geometry code. Then re-run Task 3 Step 4, Task 4 Step 5 and this task, and stop again.

- [ ] **Step 5: Record the approval**

Append to `blender/STYLE.md`, under a new final heading, the one line `Silhouettes approved by Alex, <DATE>.` with the real date. Commit (parent agent only):

```bash
git add blender/STYLE.md blender/species.json
git commit -m "chore(birds): record silhouette gate approval"
```

---

### Task 6: The wing rig and the flap action

**Do not start this task until Task 5 recorded an approval.**

**Files:**
- Modify: `blender/build_birds.py` (replace the `_rig` stub, add `_flap_action`)
- Modify: `blender/tests/run_tests.py` (append one `TestCase` class)

**Interfaces:**
- Consumes: `build_birds.build_species` and the vertex groups from Task 3.
- Produces:
  - `build_birds.BONES = ("root", "wing_L_shoulder", "wing_L_elbow", "wing_L_hand", "wing_R_shoulder", "wing_R_elbow", "wing_R_hand")`
  - `build_birds.FLAP_AMPLITUDE = {"shoulder": 32.0, "elbow": 18.0, "hand": 22.0}` in degrees
  - `build_birds.FLAP_LAG = {"shoulder": 0.0, "elbow": 0.55, "hand": 1.05}` in radians
  - `build_birds.FLAP_FRAMES = 24` and `build_birds.FPS = 24`, re-exported from `birdlib` so callers need only one import
  - `build_birds.flap_angle(bone, frame) -> float`, radians for one short bone name (`"shoulder"`, `"elbow"` or `"hand"`) on one frame
  - `build_species(slug, params, rig=True)` returns `(mesh_obj, armature_obj)` where the armature carries exactly one action named `flap`, 24 frames, and the mesh carries an `ARMATURE` modifier bound to it
  - `build_scene(slug, rig=True)` sets `scene.frame_start = 1`, `scene.frame_end = 24`, `scene.render.fps = 24`

**Rig approach, and why.** An armature with a three bone chain per wing, not three shape keys. Three reasons, in order of weight. First, bytes: a morph target stores a position delta for every vertex, so three targets would add roughly 25 KB to a 45 KB GLB and put the aggregate 1 MB budget at risk, while a skin plus one animation sampler adds about 14 KB. Second, the animation contract: `export_animations=True` with an armature produces a GLB animation literally named `flap`, which is what the manifest promises stream D and what was verified on this machine; driving morph weights instead would hand stream D `morphTargetInfluences` wiring for no gain. Third, motion quality: a bone chain lets the elbow and the hand lag the shoulder, so the wing folds through the stroke. Shape keys blend linearly between three fixed poses, which is exactly how a flap comes to look like a flapping plank.

`glide` is not an action. The wings are built spread with dihedral, so the rest pose is the glide pose and a GLB with nothing playing is already gliding. The manifest's `"pose": "glide"` records that fact.

- [ ] **Step 1: Write the failing tests for the rig**

Append to `blender/tests/run_tests.py`, before `def main():`:

```python
class TestRig(unittest.TestCase):
    def test_every_species_rigs_with_seven_bones(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                mesh_obj, armature = build_birds.build_scene(slug, rig=True)
                self.assertIsNotNone(armature)
                names = [b.name for b in armature.data.bones]
                self.assertEqual(sorted(names), sorted(build_birds.BONES))
                self.assertEqual([m.type for m in mesh_obj.modifiers], ["ARMATURE"])
                self.assertIs(mesh_obj.modifiers[0].object, armature)

    def test_the_flap_action_has_twenty_four_frames(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                _mesh, armature = build_birds.build_scene(slug, rig=True)
                action = armature.animation_data.action
                self.assertEqual(action.name, "flap")
                self.assertEqual(tuple(action.frame_range), (1.0, 24.0))
                self.assertGreater(len(action.fcurves), 0)
                for fcurve in action.fcurves:
                    self.assertEqual(len(fcurve.keyframe_points),
                                     build_birds.FLAP_FRAMES,
                                     fcurve.data_path)

    def test_it_is_the_only_action(self):
        import bpy
        import build_birds
        build_birds.build_scene("greater-crested-tern", rig=True)
        self.assertEqual([a.name for a in bpy.data.actions], ["flap"])

    def test_the_loop_is_seamless(self):
        """Frame 25 must equal frame 1, or the WebM visibly jumps."""
        import math
        import build_birds
        for bone in ("shoulder", "elbow", "hand"):
            first = build_birds.flap_angle(bone, 1)
            wrap = build_birds.flap_angle(bone, build_birds.FLAP_FRAMES + 1)
            self.assertAlmostEqual(first, wrap, places=9, msg=bone)
        self.assertNotAlmostEqual(
            build_birds.flap_angle("shoulder", 1),
            build_birds.flap_angle("shoulder", 7), places=3)

    def test_the_wings_lag_and_the_body_does_not_move(self):
        import build_birds
        self.assertEqual(build_birds.FLAP_LAG["shoulder"], 0.0)
        self.assertGreater(build_birds.FLAP_LAG["elbow"], 0.0)
        self.assertGreater(build_birds.FLAP_LAG["hand"],
                           build_birds.FLAP_LAG["elbow"])
        _mesh, armature = build_birds.build_scene("brown-skua", rig=True)
        paths = {fc.data_path for fc in armature.animation_data.action.fcurves}
        self.assertNotIn('pose.bones["root"].rotation_quaternion', paths,
                         "the body must not move during the flap")

    def test_the_rest_pose_is_glide_so_the_wings_are_spread(self):
        import birdlib
        import build_birds
        species = birdlib.load_species()
        for slug in birdlib.real_slugs(species):
            mesh_obj, _ = build_birds.build_scene(slug, rig=True)
            ys = [v.co.y for v in mesh_obj.data.vertices]
            with self.subTest(slug=slug):
                self.assertAlmostEqual(max(ys) - min(ys),
                                       species[slug]["wing_span"], delta=0.06)

    def test_every_vertex_is_weighted(self):
        import birdlib
        import build_birds
        for slug in birdlib.real_slugs(birdlib.load_species()):
            mesh_obj, _ = build_birds.build_scene(slug, rig=True)
            with self.subTest(slug=slug):
                for vertex in mesh_obj.data.vertices:
                    total = sum(g.weight for g in vertex.groups)
                    self.assertAlmostEqual(total, 1.0, places=4,
                                           msg="vertex %d weights %.4f"
                                               % (vertex.index, total))
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: every `TestRig` test errors with `NotImplementedError: the rig arrives in Task 6, after the gate`, except `test_the_loop_is_seamless` and `test_the_wings_lag_and_the_body_does_not_move`, which fail on `AttributeError: module 'build_birds' has no attribute 'flap_angle'` and `FLAP_LAG`.

- [ ] **Step 3: Replace the _rig stub in build_birds.py**

In `blender/build_birds.py`, add these constants directly below `FLASH_PANELS`:

```python
FLAP_FRAMES = birdlib.FLAP_FRAMES
FPS = birdlib.FPS

BONES = (
    "root",
    "wing_L_shoulder", "wing_L_elbow", "wing_L_hand",
    "wing_R_shoulder", "wing_R_elbow", "wing_R_hand",
)

# Degrees of rotation about each bone's local X axis.
FLAP_AMPLITUDE = {"shoulder": 32.0, "elbow": 18.0, "hand": 22.0}
# Radians of phase lag behind the shoulder. The lag is what makes the wing
# fold through the stroke instead of hinging like a plank.
FLAP_LAG = {"shoulder": 0.0, "elbow": 0.55, "hand": 1.05}

# Spanwise fractions where each wing bone starts, matching wing_weights.
BONE_SPANS = (("shoulder", 0.0, 0.42), ("elbow", 0.42, 0.68),
              ("hand", 0.68, 1.0))
```

Then replace the whole `_rig` stub:

```python
def flap_angle(bone, frame):
    """Radians for one bone on one frame.

    An analytic sine of period FLAP_FRAMES, so angle(f + 24) == angle(f)
    and the loop is seamless by construction rather than by keying the
    first pose twice.
    """
    phase = 2.0 * math.pi * (frame - 1) / float(FLAP_FRAMES)
    return (math.radians(FLAP_AMPLITUDE[bone])
            * math.sin(phase - FLAP_LAG[bone]))


def _wing_bone_points(params, sign):
    """Head and tail positions for the three bones of one wing."""
    x0, y0, z0 = _shoulder(params)
    half_span = params["wing_span"] * 0.5
    sweep = math.tan(math.radians(params["wing_sweep"]))
    dihedral = math.tan(math.radians(params["wing_dihedral"]))

    def at(s):
        reach = s * (half_span - y0)
        chord = (params["wing_chord"]
                 * (1.0 - s * (1.0 - params["wing_taper"])))
        # Sit the bone a third of a chord back so auto rotation twists the
        # blade about a believable spar rather than about its leading edge.
        return (x0 - sweep * reach - chord * 0.33,
                sign * (y0 + reach),
                z0 + dihedral * reach)

    return [(name, at(a), at(b)) for (name, a, b) in BONE_SPANS]


def _rig(mesh_obj, params, slug):
    """One armature, seven bones, and the 24 frame flap action."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.armature_add(enter_editmode=False, location=(0.0, 0.0, 0.0))
    armature = bpy.context.object
    armature.name = "%s-rig" % slug
    armature.data.name = "%s-rig" % slug

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature.data.edit_bones

    root = edit_bones[0]
    root.name = "root"
    root.head = (-params["body_length"] * 0.20, 0.0, 0.0)
    root.tail = (params["body_length"] * 0.20, 0.0, 0.0)

    for sign, side in ((1.0, "L"), (-1.0, "R")):
        parent = root
        for (name, head, tail) in _wing_bone_points(params, sign):
            bone = edit_bones.new("wing_%s_%s" % (side, name))
            bone.head = head
            bone.tail = tail
            bone.parent = parent
            bone.use_connect = False
            parent = bone

    bpy.ops.object.mode_set(mode="OBJECT")

    modifier = mesh_obj.modifiers.new(name="rig", type="ARMATURE")
    modifier.object = armature
    mesh_obj.parent = armature

    _flap_action(armature)
    return armature


def _flap_action(armature):
    """Key every frame from flap_angle, then rename the auto action.

    Blender 4.4 introduced slotted actions, so an action is never built by
    hand here. keyframe_insert creates the action and its slot, and the
    action is renamed afterwards. Verified on 4.5.13 to export as the GLB
    animation "flap".
    """
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FLAP_FRAMES
    scene.render.fps = FPS

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"

    for frame in range(1, FLAP_FRAMES + 1):
        for side in ("L", "R"):
            for bone in ("shoulder", "elbow", "hand"):
                pose_bone = armature.pose.bones["wing_%s_%s" % (side, bone)]
                angle = flap_angle(bone, frame)
                # The bone runs along its local Y, so up and down is a
                # rotation about local X. Mirror it on the right wing so
                # both wings rise together.
                if side == "R":
                    angle = -angle
                euler = mathutils.Euler((angle, 0.0, 0.0), "XYZ")
                pose_bone.rotation_quaternion = euler.to_quaternion()
                pose_bone.keyframe_insert(data_path="rotation_quaternion",
                                          frame=frame)
    bpy.ops.object.mode_set(mode="OBJECT")

    action = armature.animation_data.action
    action.name = "flap"
    for fcurve in action.fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "LINEAR"
        fcurve.update()
    return action
```

Add `import mathutils` to the imports at the top of `build_birds.py`, directly after `import bpy`.

Finally, set the frame range in `build_scene` so a rigged scene is ready to render. Replace the last two lines of `build_scene`:

```python
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = build_species(slug, entry, rig=rig)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FLAP_FRAMES
    scene.render.fps = FPS
    return result
```

- [ ] **Step 4: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, thirty-four tests passing, exit 0.

If `test_every_vertex_is_weighted` fails, a shell was added with `{"root": 1.0}` weights but the wing panels were given spanwise weights, or vice versa. Every `part.add` call passes one weight dict per vertex and `Part.add` raises when the counts disagree, so a failure here means a weight dict is empty rather than missing.

If `bpy.ops.object.mode_set` raises a context error, the armature is not both active and selected. `bpy.ops.object.armature_add` leaves it as both, which is why it is used in preference to creating the armature through `bpy.data`.

- [ ] **Step 5: Run the rigged smoke build**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/build_birds.py -- --all --rig
```

Expected: four `manifold=True ok` lines. The rig does not change the mesh at rest, so the triangle counts match Task 3 Step 4 exactly.

- [ ] **Step 6: Commit (parent agent only)**

```bash
git add blender/build_birds.py blender/tests/run_tests.py
git commit -m "feat(birds): wing armature and 24 frame flap action"
```

---

### Task 7: render.py, the flap loop sequence

**Files:**
- Modify: `blender/render.py` (replace the `flap_sequence` stub)
- Modify: `blender/tests/run_tests.py` (append one `TestCase` class)

**Interfaces:**
- Consumes: `build_birds.build_scene(slug, rig=True)` from Task 6.
- Produces: `render.flap_sequence(slug, width=LOOP_W, height=LOOP_H) -> pathlib.Path`, the directory `<scratch>/seq/<slug>/` holding `flap_0001.png` to `flap_0024.png`, all `width` by `height`, RGBA, transparent.

- [ ] **Step 1: Write the failing tests for the sequence**

Append to `blender/tests/run_tests.py`, before `def main():`:

```python
class TestFlapSequence(unittest.TestCase):
    def test_a_sequence_is_twenty_four_transparent_frames(self):
        import bpy
        import build_birds
        import render
        seq = render.flap_sequence("silver-gull", width=96, height=72)
        frames = sorted(seq.glob("flap_*.png"))
        self.assertEqual(len(frames), build_birds.FLAP_FRAMES)
        self.assertEqual(frames[0].name, "flap_0001.png")
        self.assertEqual(frames[-1].name, "flap_0024.png")
        for frame in frames:
            self.assertGreater(frame.stat().st_size, 200, frame.name)
        img = bpy.data.images.load(str(frames[0]))
        try:
            self.assertEqual(tuple(img.size), (96, 72))
            pixels = list(img.pixels)
        finally:
            bpy.data.images.remove(img)
        transparent = sum(1 for i in range(3, len(pixels), 4)
                          if pixels[i] < 0.01)
        self.assertGreater(transparent, 96 * 72 * 0.3,
                           "the loop frames must be transparent")

    def test_the_wings_actually_move_between_frames(self):
        import bpy
        import render
        seq = render.flap_sequence("brown-skua", width=96, height=72)
        first = bpy.data.images.load(str(seq / "flap_0001.png"))
        mid = bpy.data.images.load(str(seq / "flap_0007.png"))
        try:
            a = list(first.pixels)
            b = list(mid.pixels)
        finally:
            bpy.data.images.remove(first)
            bpy.data.images.remove(mid)
        changed = sum(1 for i in range(3, len(a), 4) if abs(a[i] - b[i]) > 0.2)
        self.assertGreater(changed, 40,
                           "frame 7 looks identical to frame 1, so the rig "
                           "is not deforming the mesh")

    def test_the_sequence_stays_out_of_the_repository(self):
        import birdlib
        import render
        seq = render.flap_sequence("silver-gull", width=64, height=48)
        self.assertNotIn(str(birdlib.REPO_ROOT), str(seq))
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: the three `TestFlapSequence` tests error with `NotImplementedError: the flap loop arrives in Task 7`.

- [ ] **Step 3: Replace the flap_sequence stub in render.py**

In `blender/render.py`, replace the stub with:

```python
def flap_sequence(slug, width=LOOP_W, height=LOOP_H):
    """Render frames 1 to 24 of the flap from the hero view.

    Frame 25 equals frame 1 by construction (see build_birds.flap_angle),
    so only 24 frames are written and the encoded loop is seamless.
    """
    mesh_obj, armature = build_birds.build_scene(slug, rig=True)
    if armature is None:
        raise SystemExit("%s built without a rig, cannot render a flap" % slug)

    scene = bpy.context.scene
    birdlib.configure_ink_render(scene, width, height,
                                 thickness=1.2 if width >= 400 else 1.0)
    # Fit the camera on the rest pose, so the frame does not breathe with
    # the wings. A little extra margin holds the up stroke inside frame.
    birdlib.place_camera(scene, mesh_obj, "hero", width, height, margin=1.34)

    out_dir = birdlib.scratch_dir("seq/%s" % slug)
    for frame in range(1, build_birds.FLAP_FRAMES + 1):
        scene.frame_set(frame)
        birdlib.render_still(scene, out_dir / ("flap_%04d.png" % frame))
    return out_dir
```

- [ ] **Step 4: Run the suite to verify it passes**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, thirty-seven tests passing, exit 0. The three new tests render 72 tiny frames, so allow two to three minutes.

If `test_the_wings_actually_move_between_frames` fails, `scene.frame_set` is not driving the pose: check that `build_scene` was called with `rig=True` and that `armature.animation_data.action` is the `flap` action rather than `None`.

- [ ] **Step 5: Render the real sequences**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/render.py -- \
  --all --still --loop
```

Expected: four stills printed with their byte counts, all under 40,960, then four sequence directories. Allow about twelve minutes.

- [ ] **Step 6: Commit (parent agent only)**

```bash
git add blender/render.py blender/tests/run_tests.py
git commit -m "feat(birds): flap loop PNG sequence and hero still"
```

---

### Task 8: export.py, GLBs, encodes and the manifest

**Files:**
- Create: `blender/export.py`
- Modify: `blender/tests/run_tests.py` (append two `TestCase` classes)
- Create (generated): `site/assets/birds/<slug>.glb`, `<slug>.webm`, `<slug>-loop.png`, `manifest.json` for the four slugs

**Interfaces:**
- Consumes: `build_birds.build_scene(slug, rig=True)`, `render.flap_sequence`, `render.still`, `birdlib.glb_summary`.
- Produces:
  - `export.export_glb(slug, out_dir=None) -> pathlib.Path`, defaulting to `birdlib.ASSET_DIR`, so tests can export to scratch instead of publishing
  - `export.encode_webm(slug, seq_dir, crf="34") -> pathlib.Path`
  - `export.encode_apng(slug, seq_dir) -> pathlib.Path`
  - `export.write_manifest() -> pathlib.Path`
  - `site/assets/birds/manifest.json` in exactly the contract below

**The manifest contract.** Stream D consumes this file, so these keys are fixed. Paths are relative to `site/`, which is what the runtime fetches.

```json
{
  "version": 1,
  "generic": "greater-crested-tern",
  "licence": "MIT (original work)",
  "species": {
    "greater-crested-tern": {
      "glb": "assets/birds/greater-crested-tern.glb",
      "still": "assets/birds/greater-crested-tern.png",
      "apng": "assets/birds/greater-crested-tern-loop.png",
      "webm": "assets/birds/greater-crested-tern.webm",
      "tris": 0,
      "animations": ["flap"],
      "pose": "glide",
      "generic": true,
      "bytes": {"glb": 0, "still": 0, "apng": 0, "webm": 0}
    }
  }
}
```

The four real species appear under `species`. The slug named by the top level `generic` also carries `"generic": true`; the other three carry `false`. There is no separate `generic` entry, because it would duplicate four assets for no gain.

**The binding budget.** Spec 6.3 gives per asset ceilings of 60, 40, 150 and 300 KB, which sum to 550 KB per species and 2.2 MB across four, but it also caps all bird assets together at 1 MB. The aggregate is the binding constraint, so the working targets are GLB 50 KB, still 25 KB, WebM 80 KB and APNG 150 KB, giving about 960 KB for four species. If the aggregate check fails, the levers in order are the loop resolution (`--loop-res 320x240`) and then the VP9 quality (`--crf 38`). Do not relax the aggregate.

- [ ] **Step 1: Write the failing tests for export and the manifest**

Append to `blender/tests/run_tests.py`, before `def main():`:

```python
class TestGlbExport(unittest.TestCase):
    """Exports to scratch, so this runs standalone with no published assets."""

    def test_every_species_exports_a_rigged_animated_glb_in_budget(self):
        import birdlib
        import export
        scratch = birdlib.scratch_dir("glb-probe")
        for slug in birdlib.real_slugs(birdlib.load_species()):
            with self.subTest(slug=slug):
                path = export.export_glb(slug, out_dir=scratch)
                self.assertTrue(path.is_file(), path)
                info = birdlib.glb_summary(path)
                print("  %-24s %6d bytes  anims=%s skins=%d"
                      % (slug, info["bytes"], info["animations"], info["skins"]))
                self.assertEqual(info["animations"], ["flap"])
                self.assertEqual(info["skins"], 1)
                self.assertIn(slug, info["meshes"])
                self.assertLessEqual(info["bytes"], birdlib.GLB_MAX,
                                     "%s GLB is over the 60 KB ceiling" % slug)


class TestPublishedAssets(unittest.TestCase):
    """The published assets and the manifest contract.

    Skipped unless --require-manifest is passed, so the suite runs before
    the pipeline has ever produced assets. blender/build.sh passes it.
    """

    EXPECTED_KEYS = {"glb", "still", "apng", "webm", "tris",
                     "animations", "pose", "generic", "bytes"}
    BYTE_KEYS = {"glb", "still", "apng", "webm"}

    def setUp(self):
        import birdlib
        self.manifest_path = birdlib.ASSET_DIR / "manifest.json"
        if not self.manifest_path.is_file():
            if REQUIRE_MANIFEST:
                self.fail("%s is missing; run blender/build.sh"
                          % self.manifest_path)
            self.skipTest("no published manifest yet")
        self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def test_top_level_shape(self):
        import birdlib
        self.assertEqual(self.manifest["version"], 1)
        self.assertEqual(self.manifest["licence"], "MIT (original work)")
        species = birdlib.load_species()
        self.assertEqual(self.manifest["generic"], birdlib.generic_slug(species))
        self.assertEqual(sorted(self.manifest["species"]),
                         sorted(birdlib.real_slugs(species)))

    def test_every_entry_matches_the_contract(self):
        import birdlib
        for slug, entry in self.manifest["species"].items():
            with self.subTest(slug=slug):
                self.assertEqual(set(entry), self.EXPECTED_KEYS)
                self.assertEqual(entry["glb"], "assets/birds/%s.glb" % slug)
                self.assertEqual(entry["still"], "assets/birds/%s.png" % slug)
                self.assertEqual(entry["apng"],
                                 "assets/birds/%s-loop.png" % slug)
                self.assertEqual(entry["webm"], "assets/birds/%s.webm" % slug)
                self.assertEqual(entry["animations"], ["flap"])
                self.assertEqual(entry["pose"], "glide")
                self.assertIsInstance(entry["tris"], int)
                self.assertLess(entry["tris"], birdlib.TRI_CEILING)
                self.assertIsInstance(entry["generic"], bool)
                self.assertEqual(entry["generic"],
                                 slug == self.manifest["generic"])
                self.assertEqual(set(entry["bytes"]), self.BYTE_KEYS)

    def test_every_referenced_file_exists_with_the_recorded_size(self):
        import birdlib
        site_root = birdlib.REPO_ROOT / "site"
        for slug, entry in self.manifest["species"].items():
            for key in self.BYTE_KEYS:
                with self.subTest(slug=slug, asset=key):
                    path = site_root / entry[key]
                    self.assertTrue(path.is_file(), path)
                    self.assertEqual(path.stat().st_size, entry["bytes"][key])

    def test_per_asset_budgets(self):
        import birdlib
        ceilings = {"glb": birdlib.GLB_MAX, "still": birdlib.STILL_MAX,
                    "apng": birdlib.APNG_MAX, "webm": birdlib.WEBM_MAX}
        for slug, entry in self.manifest["species"].items():
            for key, ceiling in ceilings.items():
                with self.subTest(slug=slug, asset=key):
                    self.assertLessEqual(entry["bytes"][key], ceiling,
                                         "%s %s is %d bytes"
                                         % (slug, key, entry["bytes"][key]))

    def test_all_bird_assets_together_are_under_one_megabyte(self):
        import birdlib
        total = sum(sum(e["bytes"].values())
                    for e in self.manifest["species"].values())
        total += self.manifest_path.stat().st_size
        print("  all bird assets: %d bytes of %d" % (total, birdlib.TOTAL_MAX))
        self.assertLessEqual(total, birdlib.TOTAL_MAX,
                             "the aggregate is the binding budget; drop the "
                             "loop resolution or raise the VP9 crf")

    def test_the_glbs_are_animated_and_skinned(self):
        import birdlib
        site_root = birdlib.REPO_ROOT / "site"
        for slug, entry in self.manifest["species"].items():
            with self.subTest(slug=slug):
                info = birdlib.glb_summary(site_root / entry["glb"])
                self.assertEqual(info["animations"], ["flap"])
                self.assertEqual(info["skins"], 1)

    def test_no_intermediates_leaked_into_the_asset_directory(self):
        import birdlib
        allowed = {"manifest.json"}
        for slug in self.manifest["species"]:
            allowed.update({"%s.glb" % slug, "%s.png" % slug,
                            "%s-loop.png" % slug, "%s.webm" % slug})
        found = {p.name for p in birdlib.ASSET_DIR.iterdir() if p.is_file()}
        self.assertEqual(found - allowed, set(),
                         "unexpected files in site/assets/birds")
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `TestGlbExport` errors with `ModuleNotFoundError: No module named 'export'`, and every `TestPublishedAssets` test skips with `no published manifest yet`.

- [ ] **Step 3: Write export.py**

Create `blender/export.py`:

```python
"""Export the birds as GLBs, encode the image fallbacks, write the manifest.

Products, all under site/assets/birds/:
  <slug>.glb        rigged, skinned, one animation named flap
  <slug>.png        the hero still, written by render.py
  <slug>.webm       VP9 with alpha, the animated fallback
  <slug>-loop.png   APNG, the universal animated fallback
  manifest.json     the contract stream D consumes

    /usr/local/bin/blender -b --factory-startup \
      --python blender/export.py -- --all --glb --encode --manifest
"""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import bpy

import birdlib
import build_birds
import render

FFMPEG = "/usr/local/bin/ffmpeg"
WEBM_CRF = "34"


def export_glb(slug, out_dir=None):
    """Build the species rigged and write one GLB.

    export_apply deliberately skips armature modifiers, so applying the
    others does not bake away the skin. Verified on Blender 4.5.13.
    """
    mesh_obj, armature = build_birds.build_scene(slug, rig=True)
    if armature is None:
        raise SystemExit("%s built without a rig, refusing to export" % slug)

    out_dir = pathlib.Path(out_dir) if out_dir else birdlib.ASSET_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / ("%s.glb" % slug)

    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_frame_range=False,
        export_force_sampling=True,
        export_skins=True,
        export_morph=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_extras=False,
    )

    info = birdlib.glb_summary(out_path)
    if info["animations"] != ["flap"]:
        raise SystemExit("%s exported animations %s, expected ['flap']"
                         % (slug, info["animations"]))
    if info["skins"] != 1:
        raise SystemExit("%s exported %d skins, expected 1"
                         % (slug, info["skins"]))
    if info["bytes"] > birdlib.GLB_MAX:
        raise SystemExit("%s GLB is %d bytes, over the %d ceiling"
                         % (slug, info["bytes"], birdlib.GLB_MAX))
    print("glb    %-24s %6d bytes  tris=%d"
          % (slug, info["bytes"], birdlib.tri_count(mesh_obj)))
    return out_path


def _run(cmd):
    print("  $ %s" % " ".join(cmd))
    subprocess.run(cmd, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def encode_webm(slug, seq_dir, crf=WEBM_CRF):
    """VP9 with an alpha channel. auto-alt-ref must be off or alpha breaks.

    No loop flag exists in the container; the page's <video loop> does it.
    """
    birdlib.ASSET_DIR.mkdir(parents=True, exist_ok=True)
    out_path = birdlib.ASSET_DIR / ("%s.webm" % slug)
    _run([FFMPEG, "-y",
          "-framerate", str(birdlib.FPS),
          "-i", str(pathlib.Path(seq_dir) / "flap_%04d.png"),
          "-c:v", "libvpx-vp9",
          "-pix_fmt", "yuva420p",
          "-b:v", "0", "-crf", str(crf),
          "-auto-alt-ref", "0",
          "-g", str(birdlib.FLAP_FRAMES),
          "-row-mt", "1",
          "-an",
          str(out_path)])
    size = out_path.stat().st_size
    if size > birdlib.WEBM_MAX:
        raise SystemExit("%s webm is %d bytes, over the %d ceiling; raise "
                         "--crf or drop --loop-res"
                         % (slug, size, birdlib.WEBM_MAX))
    print("webm   %-24s %6d bytes" % (slug, size))
    return out_path


def encode_apng(slug, seq_dir):
    """An infinitely looping APNG, the universal animated fallback."""
    birdlib.ASSET_DIR.mkdir(parents=True, exist_ok=True)
    out_path = birdlib.ASSET_DIR / ("%s-loop.png" % slug)
    _run([FFMPEG, "-y",
          "-framerate", str(birdlib.FPS),
          "-i", str(pathlib.Path(seq_dir) / "flap_%04d.png"),
          "-f", "apng",
          "-plays", "0",
          "-pix_fmt", "rgba",
          str(out_path)])
    size = out_path.stat().st_size
    if size > birdlib.APNG_MAX:
        raise SystemExit("%s apng is %d bytes, over the %d ceiling; drop "
                         "--loop-res" % (slug, size, birdlib.APNG_MAX))
    print("apng   %-24s %6d bytes" % (slug, size))
    return out_path


def write_manifest():
    """The contract stream D consumes. Paths are relative to site/."""
    species = birdlib.load_species()
    slugs = birdlib.real_slugs(species)
    generic = birdlib.generic_slug(species)

    entries = {}
    total = 0
    for slug in slugs:
        mesh_obj, _ = build_birds.build_scene(slug, rig=False)
        files = {
            "glb": birdlib.ASSET_DIR / ("%s.glb" % slug),
            "still": birdlib.ASSET_DIR / ("%s.png" % slug),
            "apng": birdlib.ASSET_DIR / ("%s-loop.png" % slug),
            "webm": birdlib.ASSET_DIR / ("%s.webm" % slug),
        }
        for key, path in files.items():
            if not path.is_file():
                raise SystemExit("%s is missing; run render.py and the "
                                 "encodes before the manifest" % path)
        sizes = {key: path.stat().st_size for key, path in files.items()}
        total += sum(sizes.values())
        entries[slug] = {
            "glb": "assets/birds/%s.glb" % slug,
            "still": "assets/birds/%s.png" % slug,
            "apng": "assets/birds/%s-loop.png" % slug,
            "webm": "assets/birds/%s.webm" % slug,
            "tris": birdlib.tri_count(mesh_obj),
            "animations": ["flap"],
            "pose": "glide",
            "generic": slug == generic,
            "bytes": sizes,
        }

    manifest = {
        "version": 1,
        "generic": generic,
        "licence": "MIT (original work)",
        "species": entries,
    }
    out_path = birdlib.ASSET_DIR / "manifest.json"
    out_path.write_text(json.dumps(manifest, indent=2) + "\n",
                        encoding="utf-8")
    total += out_path.stat().st_size
    print("manifest %-22s %6d bytes" % (out_path.name,
                                        out_path.stat().st_size))
    print("all bird assets together: %d bytes of %d"
          % (total, birdlib.TOTAL_MAX))
    if total > birdlib.TOTAL_MAX:
        raise SystemExit("the aggregate 1 MB budget is blown by %d bytes; "
                         "drop the loop resolution, then raise the VP9 crf"
                         % (total - birdlib.TOTAL_MAX))
    return out_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--species", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--glb", action="store_true")
    parser.add_argument("--encode", action="store_true")
    parser.add_argument("--manifest", action="store_true")
    parser.add_argument("--crf", default=WEBM_CRF)
    parser.add_argument("--keep-sequences", action="store_true")
    args = parser.parse_args(birdlib.script_args())

    species = birdlib.load_species()
    slugs = args.species or (birdlib.real_slugs(species) if args.all else [])
    if not slugs:
        parser.error("pass --all or one or more --species <slug>")

    if args.glb:
        for slug in slugs:
            export_glb(slug)
    if args.encode:
        for slug in slugs:
            seq_dir = birdlib.scratch_dir("seq/%s" % slug)
            if not sorted(seq_dir.glob("flap_*.png")):
                raise SystemExit("no PNG sequence in %s; run render.py "
                                 "--loop first" % seq_dir)
            encode_webm(slug, seq_dir, crf=args.crf)
            encode_apng(slug, seq_dir)
            if not args.keep_sequences:
                shutil.rmtree(seq_dir, ignore_errors=True)
    if args.manifest:
        write_manifest()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the suite to verify the GLB tests pass**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py
```

Expected: `OK`, thirty-eight tests passing plus eight skips, exit 0. The printed GLB sizes should land between 30,000 and 52,000 bytes each.

If a GLB is over 60 KB, the lever is the triangle count, not the export flags. Reduce `BODY_SEGMENTS` from 12 to 10 in `build_birds.py`, which is a uniform change with no visual cost at drawer size, and re-run.

- [ ] **Step 5: Publish the real assets**

The sequences from Task 7 Step 5 must still exist in scratch. If they were cleaned, re-run that step first.

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && \
/usr/local/bin/blender -b --factory-startup \
  --python blender/export.py -- --all --glb --encode --manifest
```

Expected: four `glb` lines, four `webm` lines, four `apng` lines, one `manifest` line, and an aggregate under 1,048,576 bytes. The sequence directories are removed as each species encodes.

- [ ] **Step 6: Run the suite with the manifest required**

```bash
/usr/local/bin/blender -b --factory-startup \
  --python /Users/Alex/dev/h5-bird-flu-tracker/blender/tests/run_tests.py \
  -- --require-manifest
```

Expected: `OK`, forty-six tests passing, zero skips, exit 0.

- [ ] **Step 7: Confirm the asset directory holds exactly seventeen files**

```bash
ls -la /Users/Alex/dev/h5-bird-flu-tracker/site/assets/birds/ && \
find /Users/Alex/dev/h5-bird-flu-tracker/site/assets/birds -type f | wc -l
```

Expected: `17`, being four species times four assets plus `manifest.json`. Anything else means an intermediate leaked, which `test_no_intermediates_leaked_into_the_asset_directory` also catches.

- [ ] **Step 8: Commit (parent agent only)**

```bash
git add blender/export.py blender/tests/run_tests.py site/assets/birds
git commit -m "feat(birds): GLB export, WebM and APNG encodes, asset manifest"
```

---

### Task 9: STOP, the motion gate

**This is a hard stop. Task 10 is only the build script, but do not treat it as a way to keep moving: Alex's second visual pass is the acceptance check for spec 6.5 subgoal 3.**

**Files:** none. This task writes no code.

**Interfaces:**
- Consumes: the assets from Task 8.
- Produces: either an approval, or a list of changes to `FLAP_AMPLITUDE`, `FLAP_LAG` or `species.json` that sends the executor back to Task 6.

- [ ] **Step 1: Render a flap contact sheet for the review**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && \
/usr/local/bin/blender -b --factory-startup --python-expr "
import sys, pathlib
sys.path.insert(0, 'blender')
import birdlib, render
review = birdlib.scratch_dir('review')
tiles = birdlib.scratch_dir('review/flap-tiles')
paths, labels = [], []
for slug in birdlib.real_slugs(birdlib.load_species()):
    for frame in (1, 4, 7, 10, 13, 16, 19, 22):
        paths.append(render.render_view(slug, 'hero', 300, 300,
                     tiles / ('%s-%02d.png' % (slug, frame)),
                     rig=True, frame=frame, margin=1.34))
        labels.append('%s f%02d' % (slug, frame))
print('flap sheet', birdlib.compose_grid(paths, 8, review / 'flap.png', labels=labels))
"
```

Expected: one 8 by 4 sheet at `<scratch>/review/flap.png`, eight frames of the cycle for each of the four species. Allow about four minutes.

- [ ] **Step 2: Run the vision review on the motion**

Dispatch one subagent with `model: "sonnet"`. Give it exactly this prompt, with `<REVIEW_DIR>` substituted:

> Read `/Users/Alex/dev/h5-bird-flu-tracker/blender/STYLE.md`, the Motion section in particular, then look at `<REVIEW_DIR>/flap.png`, which is eight frames of a 24 frame wing beat for each of four species, and play `/Users/Alex/dev/h5-bird-flu-tracker/site/assets/birds/greater-crested-tern.webm` and `brown-skua.webm` if your tools can.
>
> Answer three questions. One: does the wing fold through the stroke, meaning the wingtip trails the shoulder rather than the whole wing pivoting rigidly like a plank? Two: is the down stroke and up stroke amplitude believable for each species, given that a giant petrel barely flaps and a tern beats quickly and shallowly? Three: does frame 22 lead back into frame 1 without a visible jump?
>
> For anything wrong, name the constant and the direction, choosing from `FLAP_AMPLITUDE["shoulder"|"elbow"|"hand"]` in degrees and `FLAP_LAG["elbow"|"hand"]` in radians, both in `blender/build_birds.py`.
>
> Report findings only. Do not edit any file. Do not run Blender. Do not run git.

- [ ] **Step 3: Relay the review to Alex and STOP**

Post a message with:

1. The absolute path of `<scratch>/review/flap.png`.
2. The absolute paths of the four WebM files under `site/assets/birds/`, which play in QuickTime and in any browser.
3. The per species byte table from Task 8 Step 5, and the aggregate against the 1 MB budget.
4. The subagent's answers to the three motion questions.
5. This question, verbatim: "Approve the flap, or name the changes?"

**Then stop and wait.** This is the second of the two visual passes spec 11 item 3 reserves for Alex.

- [ ] **Step 4: If changes are requested, apply them and loop**

Edit only `FLAP_AMPLITUDE` and `FLAP_LAG` in `blender/build_birds.py`, or proportions in `blender/species.json`. Then re-run Task 7 Step 5, Task 8 Step 5, Task 8 Step 6 and this task, and stop again.

- [ ] **Step 5: Record the approval**

Append to `blender/STYLE.md`, under the same final heading Task 5 created, the one line `Motion approved by Alex, <DATE>.` with the real date. Commit (parent agent only):

```bash
git add blender/STYLE.md blender/build_birds.py
git commit -m "chore(birds): record motion gate approval"
```

---

### Task 10: build.sh, one command end to end

**Files:**
- Create: `blender/build.sh`

**Interfaces:**
- Consumes: every script from Tasks 1 to 8.
- Produces: `blender/build.sh`, executable, which exports a stable `BIRDS_SCRATCH` when the caller has not set one, runs build then render then export then tests in that order, cleans intermediates, and exits non-zero on any failure.

- [ ] **Step 1: Write build.sh**

Create `blender/build.sh`:

```bash
#!/bin/sh
# Build, render, export and test the Blender birds, in that order.
#
#   blender/build.sh              the full pipeline, about twenty minutes
#   blender/build.sh --fast       geometry, small sheets and tests, no
#                                 publishing, for a plumbing check
#   blender/build.sh --tests-only just the test suite
#
# Intermediates live under BIRDS_SCRATCH and never in the repository. A
# stable default is exported here so the session specific fallback in
# birdlib.DEFAULT_SCRATCH is only ever a last resort.
#
# Expect about twenty minutes for the full pipeline on this machine:
# Workbench plus Freestyle costs roughly 15 s for a 640x480 frame and
# there is no usable GPU.

set -eu

REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BLENDER=/usr/local/bin/blender
: "${BIRDS_SCRATCH:=${TMPDIR:-/tmp}/h5-birds}"
export BIRDS_SCRATCH

SHEET_SIZE=800
FAST=0
TESTS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1; SHEET_SIZE=200 ;;
    --tests-only) TESTS_ONLY=1 ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

run() {
  printf '\n=== %s ===\n' "$1"
  shift
  "$BLENDER" -b --factory-startup --python "$@"
}

printf 'repo    %s\n' "$REPO"
printf 'scratch %s\n' "$BIRDS_SCRATCH"
mkdir -p "$BIRDS_SCRATCH"

if [ "$TESTS_ONLY" -eq 0 ]; then
  run "build (geometry and rig smoke check)" \
    "$REPO/blender/build_birds.py" -- --all --rig

  if [ "$FAST" -eq 1 ]; then
    run "render (small contact sheets only)" \
      "$REPO/blender/render.py" -- --all --sheets --size "$SHEET_SIZE"
  else
    run "render (contact sheets, board, still, flap loop)" \
      "$REPO/blender/render.py" -- --all --sheets --board --still --loop \
      --size "$SHEET_SIZE"

    run "export (GLBs, WebM, APNG, manifest)" \
      "$REPO/blender/export.py" -- --all --glb --encode --manifest
  fi
fi

# --fast publishes nothing, so the manifest checks stay as skips there.
if [ "$FAST" -eq 1 ]; then
  run "tests" "$REPO/blender/tests/run_tests.py"
else
  run "tests" "$REPO/blender/tests/run_tests.py" -- --require-manifest
fi

# The sequences are removed by export.py as each species encodes. Clear the
# render tiles too, and leave the review sheets for the gates.
rm -rf "$BIRDS_SCRATCH/seq" "$BIRDS_SCRATCH/review/tiles" \
       "$BIRDS_SCRATCH/review/flap-tiles" "$BIRDS_SCRATCH/glb-probe" \
       "$BIRDS_SCRATCH/views-probe" "$BIRDS_SCRATCH/birdlib-env-probe"

printf '\n=== done ===\n'
printf 'assets  %s\n' "$REPO/site/assets/birds"
printf 'review  %s\n' "$BIRDS_SCRATCH/review"
du -sh "$REPO/site/assets/birds"
```

- [ ] **Step 2: Make it executable and check the shell syntax**

```bash
chmod +x /Users/Alex/dev/h5-bird-flu-tracker/blender/build.sh && \
sh -n /Users/Alex/dev/h5-bird-flu-tracker/blender/build.sh && echo "syntax ok"
```

Expected: `syntax ok`.

- [ ] **Step 3: Run the fast pipeline to prove the wiring**

```bash
/Users/Alex/dev/h5-bird-flu-tracker/blender/build.sh --fast
```

Expected: the scratch path printed is under `$TMPDIR`, not the session
specific fallback; the build stage prints four `ok` lines; four small
sheets render; the suite ends `OK` with the eight `TestPublishedAssets`
tests skipped. About three minutes.

- [ ] **Step 4: Run the full pipeline**

```bash
/Users/Alex/dev/h5-bird-flu-tracker/blender/build.sh
```

Expected: every stage passes, the suite ends `OK` with forty-six tests and
zero skips, and the final `du -sh` prints under `1.0M`. About twenty
minutes.

- [ ] **Step 5: Confirm nothing leaked outside the allowlist**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && git status --porcelain
```

Expected: only paths under `blender/` and `site/assets/birds/`, plus
`docs/superpowers/plans/2026-09-30-stream-c-blender-birds.md`. Anything
else is out of scope for this stream: stop and report it rather than
committing it.

```bash
find /Users/Alex/dev/h5-bird-flu-tracker -name '*.blend*' -o -name 'flap_*.png' \
  | grep -v node_modules || echo "no blend files or sequences in the repo"
```

Expected: `no blend files or sequences in the repo`.

- [ ] **Step 6: Commit (parent agent only)**

```bash
git add blender/build.sh
git commit -m "feat(birds): one command build, render, export and test"
```

---

## Handover to stream D

Stream D (the three.js runtime, spec 6.4 and 6.5 subgoal 5) starts when
Task 8 has published assets. These are the facts it needs, and they are
not obvious from the files alone.

- **The manifest is the entry point.** `site/assets/birds/manifest.json`,
  fetched at runtime. Paths inside it are relative to `site/`, so a page at
  `/` fetches `assets/birds/<slug>.glb` directly.
- **Unknown species use the generic.** Look the drawer's species up by
  slug; on a miss, use the slug named by the manifest's top level
  `generic`. There is no separate generic asset.
- **One animation, named `flap`.** 24 frames at 24 fps, so about 0.958 s,
  and it is seamless: play it with `THREE.LoopRepeat` and no crossfade.
- **`glide` is the rest pose, not a clip.** Load the GLB, play nothing, and
  the bird is gliding. `"pose": "glide"` in the manifest records that.
- **Axes.** In glTF space `+X` is forward (the bill), `+Y` is up, `-Z` is
  the bird's left. One model unit is the tern's body length, 46 cm, so the
  four species are to scale against each other: the petrel is 1.89 units
  long and the silver gull 0.87. Scale to taste, but scale them together
  or the size relationship is lost.
- **Two materials, not one.** Capped and flashed species carry
  `bird_white` (RGBA 1, 1, 1, 1) and `bird_ink` (0.063, 0.063, 0.063, 1).
  The others carry `bird_white` only. The inverted hull outline in 6.4
  must not overwrite `bird_ink`, or the tern loses its cap and the skua
  loses its wing band.
- **Normals are exported.** `export_normals=True`, so an outline technique
  that extrudes along normals works as well as the hull scaling in 6.4.
- **The fallbacks are drawer sized.** The still and both loops are 420 by
  300 with a transparent background, which suits the 360 px desktop drawer.
  The WebM is VP9 with alpha, so it needs `<video muted loop playsinline>`
  and a `-webkit-` free `background: transparent`. The APNG is an ordinary
  `<img>` that loops forever on its own.
- **Which fallback when.** Per spec 6.4: reduced motion takes the PNG
  still and no flight; no WebGL or a low end device takes an animated
  fallback and no flight. Prefer the WebM and fall back to the APNG on a
  browser that cannot decode VP9 alpha.

## Self-review

**Spec coverage.** Section 6.2 (the four species plus a generic derived
from the tern) is Task 1. Section 6.3 is `blender/STYLE.md` in Task 1, with
its budgets enforced by tests in Tasks 3 and 8 and its colour rule enforced
in Tasks 2 and 3. Section 6.5 subgoal 1 is Tasks 1, 4 and 5. Subgoal 2 is
Task 3. Subgoal 3 is Tasks 6, 7 and 9. Subgoal 4 is Task 8. Section 8's
allowlist is in Global Constraints and verified in Task 10 Step 5.

**Three things in scope that this plan deliberately resolves against the
letter of the spec, each flagged here because a reviewer should see them.**

1. Spec 6.3 asks for **one material** per species and also for a black cap
   "read as a filled ink shape". One material cannot do both under
   Workbench, so capped and flashed species carry two, `bird_white` and
   `bird_ink`. The greyscale test is the guard that this does not become a
   door to colour.
2. Spec 6.3's **per asset ceilings sum to 2.2 MB** across four species while
   the same paragraph caps all bird assets at 1 MB. The aggregate is treated
   as binding and is tested; the per asset ceilings are kept as ceilings.
   Task 8 names the two levers.
3. Spec 6.3 offers **an armature or three shape keys**. Task 6 chooses the
   armature and gives three reasons. The relevant one for the spec is that
   morph targets would put the 1 MB aggregate at risk.

**Not mapped to a task, by scope.** Spec 6.5 subgoal 5 (the Safari, Chrome,
iPhone and Android integration pass) belongs to stream D. Spec 5.4's new
Open Graph card "rendered from the map plus one ink tern" needs the map,
which is stream B, so the tern still this plan publishes is the input and
the composition is not a task here. Spec 6.1's flight choreography (lower
left to upper right over about four seconds) is a runtime behaviour with no
asset of its own; the `flap` clip is all this stream owes it.

**Placeholders.** None. Every code step carries the code. Every command
carries its expected output. The two STOP tasks carry the verbatim prompt
for the review subagent and the verbatim question for Alex.

**Type consistency.** `build_scene` and `build_species` return
`(mesh_obj, armature_or_None)` in every task that calls them. `flap_angle`
takes a short bone name (`"shoulder"`, `"elbow"`, `"hand"`) while
`armature.pose.bones` is keyed by the full name (`"wing_L_shoulder"`), and
`_side_weights` is the one place those two namings meet. `manifold_report`
returns the same five keys wherever it is read. `birdlib.FLAP_FRAMES` is
re-exported as `build_birds.FLAP_FRAMES` in Task 6, so tests may use either
and get 24.