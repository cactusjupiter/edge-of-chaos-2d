# 2D Cellular Automata and the Edge of Chaos

A 2D port and extension of David Eck's 1D
[Cellular Automata — Edge of Chaos](https://math.hws.edu/eck/js/edge-of-chaos/CA.html)
explorer. Cellular automata on a 2D torus, with randomly generated rule
families and a lambda slider that sweeps how much of the rule set is active:
dies out or freezes at one end, boils at the other, and somewhere in between
— the edge of chaos — interesting things grow.

Everything is relative to David Eck's original: the 2D lattice, the larger
neighborhoods (von Neumann r1–r3, Moore 3×3 and 5×5), up to 32 states,
and three symmetry modes for rule generation:

- **Asymmetric** — every window code gets its own random output.
- **D4 isotropic** — outputs tied across all 8 square symmetries of the
  window, so the automaton is rotation/reflection symmetric by construction.
- **Permute** — the law depends only on the center state and the *multiset*
  of neighbor states (location-blind, outer-totalistic generalized to
  multisets).

## Use it

Open `index.html` — no build step, no server needed. Hit **Create New Rule
Set Using**, drag the lambda slider, run.

A few seeded starting points:

- `?ex=1` — Moore 3×3, 4 states, D4
- `?ex=2` — Moore 3×3, 4 states, permute
- `?ex=3` — Moore 3×3, 2 states, D4
- `?ex=4` — von Neumann r2 diamond, 3 states, asymmetric
- `?ex=5` — von Neumann r2 diamond, 2 states, D4
- `?ex=6` — von Neumann r1 cross, 3 states, permute

**Save Example in Browser** keeps examples in your browser's local storage
(tied to this browser + site). **Save to File / Load from File** exchange
examples as small JSON files.

Notes: giant rule families (25-cell windows, many states) take a few seconds
to build — the status line counts along. Painting works while running
(right-drag or shift-drag erases). The "fading trail" checkbox leaves ghost
images of previous generations.

## Credits

- [David Eck](https://math.hws.edu/eck/index.html) wrote the original 1D app
  and the slider-canvas control (his note on the original: *"You can do
  anything you like with this web page and with the code, but if you use a
  substantial portion of it, you should include attribution."*)
- [David Bau](https://github.com/davidbau/seedrandom) wrote seedrandom.js
  (MIT), which is what lets an example be saved as just two seed numbers.
- The 2D port was built by Jade Adams.
